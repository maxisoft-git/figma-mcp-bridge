import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF/DoS guards for image sources the server fetches on the user's behalf.
 *
 * `create_image` accepts an http(s) URL and downloads it from the server
 * process, so without these checks `http://169.254.169.254/…` (or a redirect
 * to it) would let an agent probe the host's internal network.
 */

/** Largest image the server will fetch and hand to Figma. */
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_REDIRECTS = 5;
export const IMAGE_FETCH_TIMEOUT_MS = 30_000;

/**
 * Fetch image bytes from a remote URL, refusing internal targets and bounding
 * size, redirects and time.
 */
export async function fetchImageBytes(source: string): Promise<Buffer> {
  let url = new URL(source);
  let redirects = 0;

  while (true) {
    await assertSafeHttpUrl(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(url, { signal: controller.signal, redirect: "manual" });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Timed out fetching image after ${IMAGE_FETCH_TIMEOUT_MS}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (resp.status >= 300 && resp.status < 400) {
      const location = resp.headers.get("location");
      if (!location) {
        throw new Error(`Image redirect missing Location header: ${resp.status}`);
      }
      redirects += 1;
      if (redirects > MAX_IMAGE_REDIRECTS) {
        throw new Error(`Image fetch exceeded ${MAX_IMAGE_REDIRECTS} redirects`);
      }
      // Re-validated on the next loop iteration — a redirect to an internal
      // address must still be blocked.
      url = new URL(location, url);
      continue;
    }

    if (!resp.ok) {
      throw new Error(`Failed to fetch image: ${resp.status} ${resp.statusText}`);
    }

    const contentLength = resp.headers.get("content-length");
    if (contentLength !== null) {
      const size = Number(contentLength);
      if (!Number.isFinite(size) || size < 0) {
        throw new Error("Invalid image Content-Length header");
      }
      if (size > MAX_IMAGE_BYTES) {
        throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`);
      }
    }

    return readBoundedResponse(resp, MAX_IMAGE_BYTES);
  }
}

/** Reject non-http(s) URLs and any URL that resolves to a private/loopback IP. */
export async function assertSafeHttpUrl(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Image URL must use http or https");
  }
  if (!url.hostname) {
    throw new Error("Image URL must include a hostname");
  }

  const hostname = normalizeHostname(url.hostname);
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new Error("Image URL resolves to a blocked internal address");
    }
    return;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("Image URL hostname did not resolve");
  }
  if (addresses.some((address) => isBlockedIp(address.address))) {
    throw new Error("Image URL resolves to a blocked internal address");
  }
}

function isBlockedIpv4(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

export function isBlockedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return isBlockedIpv4(address);
  // Not a parseable IPv4/IPv6 literal → fail closed.
  if (version !== 6) return true;

  const normalized = address.toLowerCase();
  // ::/128, ::1, ::ffff:a.b.c.d, ::ffff:XXXX:XXXX, ::a.b.c.d and NAT64.
  if (normalized.startsWith("::") || normalized.startsWith("64:ff9b:")) {
    return true;
  }

  const hextets = normalized.split(":");
  const first = parseInt(hextets[0] || "0", 16);
  const secondIsZero =
    hextets[1] === "" || (hextets[1] !== undefined && parseInt(hextets[1], 16) === 0);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xffc0) === 0xfec0 || // fec0::/10 deprecated site-local
    (first & 0xff00) === 0xff00 || // ff00::/8 multicast
    first === 0x2002 || // 2002::/16 6to4
    (first === 0x2001 && secondIsZero) // 2001:0::/32 Teredo
  );
}

/** Strip the brackets the WHATWG URL parser keeps around IPv6 hosts. */
export function normalizeHostname(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

/** Read a response body, aborting once it exceeds `maxBytes`. */
export async function readBoundedResponse(
  resp: Response,
  maxBytes: number
): Promise<Buffer> {
  if (!resp.body) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of resp.body) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > maxBytes) {
      throw new Error(`Image exceeds ${maxBytes} bytes`);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}
