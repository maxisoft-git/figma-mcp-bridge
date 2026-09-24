import type { BridgeResponse, ConnectedFile, RPCRequest, RPCResponse } from "./types.js";

/**
 * Follower proxies MCP tool calls to the leader via HTTP /rpc.
 *
 * Node 18+ fetch has connection pooling by default, so we don't need a
 * custom keep-alive Agent. Earlier versions passed a node:http.Agent via
 * the undici `dispatcher` option, but that is incompatible with Node
 * 24's built-in fetch (undici requires an undici.Agent there).
 */
export class Follower {
  constructor(private leaderUrl: string) {}

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
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      },
      body: JSON.stringify(rpcReq),
      signal: AbortSignal.timeout(35_000),
    });

    if (!response.ok) {
      // The leader answers validation failures with a 400 whose body names the
      // offending field — surface it instead of a bare status code.
      const body = (await response.json().catch(() => null)) as RPCResponse | null;
      throw new Error(body?.error ?? `Leader returned status ${response.status}`);
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
        signal: AbortSignal.timeout(2_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
