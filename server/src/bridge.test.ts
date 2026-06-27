import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the 'ws' module before importing Bridge
vi.mock("ws", () => {
  class MockWebSocket {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    on: Record<string, ((...args: unknown[]) => void)[]> = {};
    send = vi.fn();
    close = vi.fn();
    onmessage: ((event: { data: string }) => void) | null = null;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((err: Error) => void) | null = null;
  }
  class MockWebSocketServer {
    handleUpgrade = vi.fn();
  }
  return { WebSocket: MockWebSocket, WebSocketServer: MockWebSocketServer };
});

// Provide ALLOWED_ORIGINS override so origin test doesn't depend on env
process.env.ALLOWED_ORIGINS = "https://figma.com,https://www.figma.com";

import { Bridge } from "./bridge.js";

/**
 * Build a minimal IncomingMessage-shaped object for handleUpgrade tests.
 */
function makeReq(opts: {
  origin?: string;
  url?: string;
}): {
  headers: Record<string, string | undefined>;
  url?: string;
} {
  return {
    headers: { origin: opts.origin },
    url: opts.url ?? "/ws?fileKey=f1&fileName=test&secret=s",
  };
}

function makeSocket(): {
  destroyed: boolean;
  written: string[];
  destroy: () => void;
  write: (s: string) => boolean;
} {
  const sock = {
    destroyed: false,
    written: [] as string[],
    destroy() {
      this.destroyed = true;
    },
    write(s: string) {
      this.written.push(s);
      return true;
    },
  };
  return sock;
}

describe("Bridge", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handleUpgrade — origin check", () => {
    it("rejects unauthorized origin with HTTP 403", () => {
      const bridge = new Bridge();
      const socket = makeSocket();
      bridge.handleUpgrade(
        makeReq({ origin: "https://evil.example" }) as never,
        socket as never,
        Buffer.alloc(0),
      );
      expect(socket.destroyed).toBe(true);
      const http = socket.written.join("");
      expect(http).toContain("HTTP/1.1 403");
    });

    it("accepts allowed origin", () => {
      const bridge = new Bridge();
      const socket = makeSocket();
      bridge.handleUpgrade(
        makeReq({ origin: "https://figma.com" }) as never,
        socket as never,
        Buffer.alloc(0),
      );
      expect(socket.destroyed).toBe(false);
    });

    it("skips origin check when no Origin header is present (non-browser client)", () => {
      const bridge = new Bridge();
      const socket = makeSocket();
      bridge.handleUpgrade(
        makeReq({}) as never,
        socket as never,
        Buffer.alloc(0),
      );
      // Will proceed past origin check; may fail later on missing fileKey
      // or secret, but origin did NOT destroy the socket.
      const http = socket.written.join("");
      expect(http).not.toContain("HTTP/1.1 403");
    });
  });

  describe("handleUpgrade — fileKey check", () => {
    it("rejects request without fileKey with HTTP 400", () => {
      const bridge = new Bridge();
      const socket = makeSocket();
      bridge.handleUpgrade(
        {
          headers: {},
          url: "/ws?fileName=test",
        } as never,
        socket as never,
        Buffer.alloc(0),
      );
      expect(socket.destroyed).toBe(true);
      expect(socket.written.join("")).toContain("HTTP/1.1 400");
    });
  });

  describe("listConnectedFiles", () => {
    it("returns empty array when no connections", () => {
      const bridge = new Bridge();
      expect(bridge.listConnectedFiles()).toEqual([]);
    });
  });
});
