import { describe, it, expect } from "vitest";
import { assertSafeHttpUrl, isBlockedIp, normalizeHostname } from "./ssrf.js";

describe("isBlockedIp", () => {
  it("blocks loopback, private and link-local IPv4", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback, unique-local, link-local and mapped addresses", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "64:ff9b::7f00:1",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6", () => {
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
  });

  it("fails closed on non-IP input", () => {
    expect(isBlockedIp("example.com")).toBe(true);
  });
});

describe("assertSafeHttpUrl", () => {
  it("rejects non-http(s) protocols", async () => {
    await expect(assertSafeHttpUrl(new URL("file:///etc/passwd"))).rejects.toThrow(
      /http or https/
    );
  });

  it("rejects literal internal IPs", async () => {
    await expect(assertSafeHttpUrl(new URL("http://127.0.0.1:1994/rpc"))).rejects.toThrow(
      /blocked internal address/
    );
    await expect(
      assertSafeHttpUrl(new URL("http://169.254.169.254/latest/meta-data"))
    ).rejects.toThrow(/blocked internal address/);
  });

  it("rejects a bracketed IPv6 loopback", async () => {
    await expect(assertSafeHttpUrl(new URL("http://[::1]/"))).rejects.toThrow(
      /blocked internal address/
    );
  });

  it("accepts a literal public IP", async () => {
    await expect(assertSafeHttpUrl(new URL("http://8.8.8.8/x.png"))).resolves.toBeUndefined();
  });
});

describe("normalizeHostname", () => {
  it("strips IPv6 brackets", () => {
    expect(normalizeHostname("[::1]")).toBe("::1");
    expect(normalizeHostname("example.com")).toBe("example.com");
  });
});
