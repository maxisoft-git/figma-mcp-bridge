/**
 * Simple in-memory TTL cache.
 *
 * Used to memoize read-only tool responses (get_node, get_document, etc.)
 * for a short window so repeated MCP calls within ~5s don't re-hit the
 * Figma plugin sandbox. Writes invalidate relevant keys on commit.
 *
 * Not distributed — each Node process has its own cache. Acceptable
 * because Followers always proxy through the Leader which is the only
 * one talking to the plugin.
 */

export interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TTLCache<K, V> {
  private store = new Map<K, CacheEntry<V>>();
  private defaultTtlMs: number;

  constructor(defaultTtlMs = 5_000) {
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Returns the cached value if it exists and hasn't expired, else null.
   */
  get(key: K): V | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  /** Delete a specific key. Call after write ops that should invalidate reads. */
  invalidate(key: K): void {
    this.store.delete(key);
  }

  /** Delete every key starting with the given prefix. */
  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (typeof key === "string" && key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

/**
 * Build a stable cache key for a tool call.
 * Tools that take nodeIds use the first id; params are JSON-stringified.
 */
export function makeCacheKey(
  tool: string,
  nodeIds?: string[],
  params?: Record<string, unknown>,
  fileKey?: string,
): string {
  const nodePart = nodeIds && nodeIds.length > 0 ? nodeIds.join(",") : "_";
  const paramPart = params && Object.keys(params).length > 0
    ? JSON.stringify(params)
    : "_";
  const filePart = fileKey ?? "_";
  return `${tool}|${filePart}|${nodePart}|${paramPart}`;
}
