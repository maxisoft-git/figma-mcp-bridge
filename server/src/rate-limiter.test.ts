import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to maxRequests hits within the window", () => {
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(false);
  });

  it("rejects after the limit but allows new IP", () => {
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(false);
    // Different key still has its own bucket
    expect(limiter.allow("ip2")).toBe(true);
  });

  it("resets the window after windowMs passes", () => {
    vi.useFakeTimers();
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(true);
    expect(limiter.allow("ip1")).toBe(false);

    vi.advanceTimersByTime(1500);

    expect(limiter.allow("ip1")).toBe(true);
  });

  it("returns remaining count", () => {
    expect(limiter.remaining("ip1")).toBe(3);
    limiter.allow("ip1");
    expect(limiter.remaining("ip1")).toBe(2);
    limiter.allow("ip1");
    expect(limiter.remaining("ip1")).toBe(1);
  });

  it("reset() clears the bucket", () => {
    limiter.allow("ip1");
    limiter.allow("ip1");
    limiter.allow("ip1");
    expect(limiter.allow("ip1")).toBe(false);
    limiter.reset("ip1");
    expect(limiter.allow("ip1")).toBe(true);
  });

  it("uses default config from env when no overrides", () => {
    const l = new RateLimiter();
    expect((l as unknown as { config: { maxRequests: number } }).config.maxRequests).toBe(60);
  });
});
