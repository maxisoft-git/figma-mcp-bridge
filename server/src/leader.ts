import http from "node:http";
import { gzipSync } from "node:zlib";
import type { Duplex } from "node:stream";
import { Bridge } from "./bridge.js";
import { validateRpc } from "./schema.js";
import { executeSaveScreenshots } from "./tools.js";
import type { ExportFormat } from "./tools.js";
import type { RPCRequest, RPCResponse } from "./types.js";
import { VERSION } from "./version.js";
import { RateLimiter } from "./rate-limiter.js";

const RPC_RATE_LIMIT_BYPASS = process.env.RATE_LIMIT_RPC_DISABLE === "1";

/**
 * Leader owns the WebSocket bridge to Figma and exposes HTTP endpoints for followers.
 * Endpoints:
 *   /ws   — WebSocket upgrade for the Figma plugin
 *   /ping — Health check
 *   /rpc  — JSON RPC for follower tool calls
 */
export class Leader {
  private bridge: Bridge;
  private server: http.Server | null = null;
  private rateLimiter: RateLimiter;
  private inFlight = 0;
  private closing = false;

  constructor(private port: number) {
    this.bridge = new Bridge();
    this.rateLimiter = new RateLimiter();
  }

  getBridge(): Bridge {
    return this.bridge;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.url === "/ping" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", version: VERSION }));
          return;
        }

        if (req.url === "/rpc" && req.method === "POST") {
          this.handleRPC(req, res);
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      });

      server.on(
        "upgrade",
        (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
          if (req.url?.startsWith("/ws")) {
            this.bridge.handleUpgrade(req, socket, head);
          } else {
            socket.destroy();
          }
        }
      );

      // Fail fast if port is already in use
      server.once("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "EADDRINUSE"
            ? new Error(`Port ${this.port} already in use`)
            : err
        );
      });

      server.listen(this.port, () => {
        this.server = server;
        console.error(`Leader listening on :${this.port}`);
        resolve();
      });
    });
  }

  private handleRPC(req: http.IncomingMessage, res: http.ServerResponse): void {
    // Refuse new requests once shutdown has begun — clients can retry
    // against a fresh leader.
    if (this.closing) {
      this.sendJSON(res, 503, { error: "Server is shutting down" });
      return;
    }

    // Rate limit per source IP. /ping bypasses (handled in start()).
    const ip = req.socket.remoteAddress ?? "unknown";
    if (!RPC_RATE_LIMIT_BYPASS && !this.rateLimiter.allow(`rpc:${ip}`)) {
      const remaining = this.rateLimiter.remaining(`rpc:${ip}`);
      res.setHeader("Retry-After", "60");
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      this.sendJSON(res, 429, {
        error: `Rate limit exceeded. Try again in 60s. (remaining: ${remaining})`,
      });
      return;
    }

    this.inFlight++;

    const finish = (): void => {
      this.inFlight--;
    };
    res.on("close", finish);
    res.on("finish", finish);

    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        await this.processRPC(req, res, body);
      } catch (err) {
        // Defensive — processRPC should never throw, but if it does,
        // surface a 500 rather than dropping the connection.
        if (!res.headersSent) {
          this.sendJSON(res, 500, {
            error: `Unhandled: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    });
  }

  private async processRPC(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
  ): Promise<void> {
    // 1) Parse body. Malformed JSON = 400, not 200.
    let rpcReq: RPCRequest;
    try {
      rpcReq = JSON.parse(body);
    } catch (err) {
      this.sendJSON(res, 400, {
        error: `Invalid JSON body: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }

      // 2) list_files is a server-side RPC (not forwarded to plugin).
      if (rpcReq.tool === "list_files") {
        this.sendJSON(res, 200, {
          data: this.bridge.listConnectedFiles(),
        });
        return;
      }

      // 3) Zod validation. Bad params = 400.
      const validationError = validateRpc(
        rpcReq.tool,
        rpcReq.nodeIds,
        rpcReq.params
      );
      if (validationError) {
        this.sendJSON(res, 400, { error: validationError });
        return;
      }

      const fileKey = rpcReq.fileKey;

      // 4) save_screenshots: server-side orchestration (writes to disk).
      if (rpcReq.tool === "save_screenshots") {
        const params = rpcReq.params ?? {};
        const sender = {
          sendWithParams: (
            requestType: string,
            nodeIds?: string[],
            sendParams?: Record<string, unknown>
          ) => this.bridge.sendWithParams(requestType, nodeIds, sendParams, fileKey),
        };
        try {
          const result = await executeSaveScreenshots(
            sender,
            params.items as Parameters<typeof executeSaveScreenshots>[1],
            params.format as ExportFormat | undefined,
            params.scale as number | undefined
          );
          this.sendJSON(res, 200, { data: result });
        } catch (err) {
          this.sendJSON(res, 500, {
            error: `save_screenshots failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
        return;
      }

      // 5) Forward to the plugin. Plugin-reported errors stay 200
      //    (they are part of the RPC contract). Bridge-level errors
      //    (timeout, no plugin) are 5xx.
      try {
        const resp = await this.bridge.sendWithParams(
          rpcReq.tool,
          rpcReq.nodeIds,
          rpcReq.params,
          fileKey
        );
        this.sendJSON(
          res,
          200,
          resp.error ? { error: resp.error } : { data: resp.data }
        );
      } catch (err) {
        // Bridge timeout / no plugin / network error.
        this.sendJSON(res, 502, {
          error: `Bridge error: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
  }

  /**
   * Number of requests currently being processed.
   */
  getInFlightCount(): number {
    return this.inFlight;
  }

  /**
   * Mark the leader as closing. Further RPC requests will be rejected
   * with 503. Existing in-flight requests are allowed to complete.
   * Returns a promise that resolves once in-flight count drops to 0
   * or the timeout elapses.
   */
  async drain(timeoutMs = 10_000): Promise<void> {
    this.closing = true;
    if (this.inFlight === 0) return;
    const start = Date.now();
    while (this.inFlight > 0) {
      if (Date.now() - start > timeoutMs) {
        console.error(
          `drain() timeout: ${this.inFlight} request(s) still in-flight`,
        );
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  private sendJSON(
    res: http.ServerResponse,
    status: number,
    body: RPCResponse,
    acceptEncoding?: string | string[]
  ): void {
    // Default to the request's Accept-Encoding so call-sites don't
    // have to thread it through manually.
    const ae = acceptEncoding ?? res.req?.headers["accept-encoding"];
    const json = JSON.stringify(body);
    // Skip compression for tiny payloads (overhead > saving).
    if (json.length >= 1024 && this.acceptsGzip(ae)) {
      const gz = gzipSync(json);
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
        "Content-Length": String(gz.length),
        Vary: "Accept-Encoding",
      });
      res.end(gz);
      return;
    }
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(json);
  }

  private acceptsGzip(h?: string | string[]): boolean {
    if (!h) return false;
    const v = Array.isArray(h) ? h.join(",") : h;
    return /\bgzip\b/i.test(v);
  }

  stop(): void {
    this.bridge.close();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
