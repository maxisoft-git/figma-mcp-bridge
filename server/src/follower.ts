import http from "node:http";
import type { BridgeResponse, ConnectedFile, RPCRequest, RPCResponse } from "./types.js";

/**
 * Follower proxies MCP tool calls to the leader via HTTP /rpc.
 *
 * Uses a persistent http.Agent with `keepAlive: true` so the TCP
 * connection to the leader is reused across calls. Without it, every
 * fetch opens a new socket, paying ~10-50ms of TCP/TLS handshake.
 */
export class Follower {
  private agent: http.Agent;

  constructor(private leaderUrl: string) {
    this.agent = new http.Agent({
      keepAlive: true,
      maxSockets: 4,
      keepAliveMsecs: 30_000,
    });
  }

  send(
    requestType: string,
    nodeIds?: string[],
    fileKey?: string
  ): Promise<BridgeResponse> {
    return this.sendWithParams(requestType, nodeIds, undefined, fileKey);
  }

  async sendWithParams(
    requestType: string,
    nodeIds?: string[],
    params?: Record<string, unknown>,
    fileKey?: string
  ): Promise<BridgeResponse> {
    const rpcReq: RPCRequest = { tool: requestType };
    if (nodeIds && nodeIds.length > 0) rpcReq.nodeIds = nodeIds;
    if (params && Object.keys(params).length > 0) rpcReq.params = params;
    if (fileKey) rpcReq.fileKey = fileKey;

    const response = await fetch(`${this.leaderUrl}/rpc`, {
      method: "POST",
      // @ts-expect-error — Node fetch accepts the dispatcher option.
      dispatcher: this.agent,
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify(rpcReq),
      signal: AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
      throw new Error(`Leader returned status ${response.status}`);
    }

    // response.json() in undici auto-decompresses gzip / br / deflate.
    const rpcResp = (await response.json()) as RPCResponse;

    if (rpcResp.error) {
      throw new Error(rpcResp.error);
    }

    return {
      type: requestType,
      requestId: "",
      data: rpcResp.data,
    };
  }

  async listConnectedFiles(): Promise<ConnectedFile[]> {
    const response = await fetch(`${this.leaderUrl}/rpc`, {
      method: "POST",
      // @ts-expect-error — Node fetch accepts the dispatcher option.
      dispatcher: this.agent,
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify({ tool: "list_files" } as RPCRequest),
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      throw new Error(`Leader returned status ${response.status}`);
    }

    const rpcResp = (await response.json()) as RPCResponse;
    if (rpcResp.error) {
      throw new Error(rpcResp.error);
    }

    return (rpcResp.data as ConnectedFile[]) ?? [];
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.leaderUrl}/ping`, {
        // @ts-expect-error — Node fetch accepts the dispatcher option.
        dispatcher: this.agent,
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
