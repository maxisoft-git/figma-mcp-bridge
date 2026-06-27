/**
 * Simple per-IP sliding window rate limiter.
 *
 * No external dep — keeps a Map<ip, number[]> of recent request timestamps
 * and prunes entries outside the window on every check. For a localhost
 * server with a single client (the Follower) this is fine; for a public
 * deployment swap in a proper token-bucket store.
 *
 * Env vars:
 *   RATE_LIMIT_RPC         max requests per window (default 60)
 *   RATE_LIMIT_RPC_WINDOW  window length in ms (default 60_000 = 1 min)
 */

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export class RateLimiter {
  private hits = new Map<string, number[]>();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = {
      maxRequests: config?.maxRequests ?? (Number(process.env.RATE_LIMIT_RPC) || 60),
      windowMs: config?.windowMs ?? (Number(process.env.RATE_LIMIT_RPC_WINDOW) || 60_000),
    };
  }

  /**
   * Returns true if the request is within the limit, false if rate-limited.
   * Side effect: records the hit.
   */
  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = this.hits.get(key) ?? [];

    // Prune old entries
    const fresh = timestamps.filter((t) => t > cutoff);
    fresh.push(now);
    this.hits.set(key, fresh);

    // Periodic GC to avoid unbounded Map growth
    if (this.hits.size > 1000) this.gc(cutoff);

    return fresh.length <= this.config.maxRequests;
  }

  /** How many requests are still in the window for the given key. */
  remaining(key: string): number {
    const now = Date.now();
    const cutoff = now - this.config.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    return Math.max(0, this.config.maxRequests - timestamps.length);
  }

  /** Reset the bucket for a key (e.g. after a successful health check). */
  reset(key: string): void {
    this.hits.delete(key);
  }

  private gc(cutoff: number): void {
    for (const [key, timestamps] of this.hits) {
      const fresh = timestamps.filter((t) => t > cutoff);
      if (fresh.length === 0) this.hits.delete(key);
      else this.hits.set(key, fresh);
    }
  }
}
