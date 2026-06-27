import { Leader } from "./leader.js";
import { Follower } from "./follower.js";
import { Role } from "./types.js";
import type { BridgeResponse, ConnectedFile } from "./types.js";
import { TTLCache, makeCacheKey } from "./cache.js";

/**
 * Tools whose responses are safe to memoise for a short window.
 * These are pure reads that always return the same data for the same
 * inputs (within a few seconds), so we avoid re-hitting the Figma
 * sandbox for repeated calls (e.g. an agent polling the same node).
 */
const CACHEABLE_TOOLS = new Set<string>([
  "get_node",
  "get_document",
  "get_selection",
  "get_metadata",
  "get_styles",
  "get_design_context",
  "get_variable_defs",
  "get_color_palette",
  "get_typography_scale",
  "get_spacing_system",
  "get_measurements",
  "find_nodes",
  "list_components",
  "get_dev_css",
  "get_dev_svg",
  "get_dev_json",
]);

/** Default TTL for cached tool responses (ms). */
const DEFAULT_CACHE_TTL_MS = 5_000;

/**
 * Node is the dynamic handler that switches between leader and follower roles.
 * It routes MCP tool calls to the appropriate backend based on its current role.
 */
export class Node {
  private _role: Role = Role.Unknown;
  private leader: Leader | null = null;
  private follower: Follower;
  private responseCache: TTLCache<string, BridgeResponse>;

  constructor(private port: number) {
    this.follower = new Follower(`http://localhost:${port}`);
    this.responseCache = new TTLCache<string, BridgeResponse>(DEFAULT_CACHE_TTL_MS);
  }

  get role(): Role {
    return this._role;
  }

  get roleName(): string {
    switch (this._role) {
      case Role.Leader:
        return "LEADER";
      case Role.Follower:
        return "FOLLOWER";
      default:
        return "UNKNOWN";
    }
  }

  send(
    requestType: string,
    nodeIds?: string[],
    fileKey?: string
  ): Promise<BridgeResponse> {
    return this.sendWithParams(requestType, nodeIds, undefined, fileKey);
  }

  sendWithParams(
    requestType: string,
    nodeIds?: string[],
    params?: Record<string, unknown>,
    fileKey?: string
  ): Promise<BridgeResponse> {
    // Check cache for read-only tools only.
    if (CACHEABLE_TOOLS.has(requestType)) {
      const key = makeCacheKey(requestType, nodeIds, params, fileKey);
      const cached = this.responseCache.get(key);
      if (cached) return Promise.resolve(cached);
    }

    const dispatch = (): Promise<BridgeResponse> => {
      if (this._role === Role.Leader && this.leader) {
        return this.leader
          .getBridge()
          .sendWithParams(requestType, nodeIds, params, fileKey);
      }
      return this.follower.sendWithParams(requestType, nodeIds, params, fileKey);
    };

    return dispatch().then((resp) => {
      // Cache successful responses for cacheable tools. Errors are not
      // cached — they should be retried on the next call.
      if (CACHEABLE_TOOLS.has(requestType) && !resp.error) {
        const key = makeCacheKey(requestType, nodeIds, params, fileKey);
        this.responseCache.set(key, resp);
      }
      return resp;
    });
  }

  listConnectedFiles(): ConnectedFile[] {
    if (this._role === Role.Leader && this.leader) {
      return this.leader.getBridge().listConnectedFiles();
    }
    // Followers return empty — the tool handler falls back to RPC
    return [];
  }

  async becomeLeader(): Promise<void> {
    if (this._role === Role.Leader) return;

    const leader = new Leader(this.port);
    await leader.start();

    this.leader = leader;
    this._role = Role.Leader;
    console.error("Became LEADER");
  }

  becomeFollower(): void {
    if (this._role === Role.Follower) return;

    if (this.leader) {
      this.leader.stop();
      this.leader = null;
    }

    this._role = Role.Follower;
    console.error("Became FOLLOWER");
  }

  stop(): void {
    if (this.leader) {
      this.leader.stop();
      this.leader = null;
    }
    this._role = Role.Unknown;
    this.responseCache.clear();
  }

  /**
   * Drop every cached response. Call after write operations that
   * could affect reads (e.g. set_node_properties, delete_nodes, …).
   * Currently a no-op for tool flow (TTL covers it), but exposed for
   * tools that want immediate invalidation.
   */
  invalidateResponseCache(): void {
    this.responseCache.clear();
  }
}
