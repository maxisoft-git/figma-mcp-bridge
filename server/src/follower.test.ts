import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Follower } from "./follower.js";

const mockFetch = vi.mocked(globalThis.fetch);

describe("Follower", () => {
  let follower: Follower;
  const baseUrl = "http://localhost:1994";

  beforeEach(() => {
    follower = new Follower(baseUrl);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("sendWithParams", () => {
    it("sends a POST to /rpc with the request body", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await follower.sendWithParams("get_node", ["1:23"], undefined, "abc");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0]!;
      const [url, init] = call as [string, { method?: string; headers?: Record<string, string>; body?: string }];
      expect(url).toBe(`${baseUrl}/rpc`);
      expect(init.method).toBe("POST");
      expect(init.headers).toEqual({
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip",
      });
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        tool: "get_node",
        nodeIds: ["1:23"],
        fileKey: "abc",
      });
      expect(result).toEqual({
        type: "get_node",
        requestId: "",
        data: { ok: true },
      });
    });

    it("omits empty nodeIds and params from the body", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: null }), { status: 200 }),
      );

      await follower.sendWithParams("get_metadata", undefined, {}, "k");

      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as { body: string };
      const body = JSON.parse(init.body);
      expect(body).toEqual({ tool: "get_metadata", fileKey: "k" });
    });

    it("requests gzip compression", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: null }), { status: 200 }),
      );
      await follower.sendWithParams("get_node");
      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as { headers: Record<string, string> };
      expect(init.headers["Accept-Encoding"]).toBe("gzip");
    });

    it("throws on non-2xx response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      );

      await expect(
        follower.sendWithParams("get_node"),
      ).rejects.toThrow("Leader returned status 500");
    });

    it("throws on RPC-level error", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "Node not found" }),
          { status: 200 },
        ),
      );

      await expect(
        follower.sendWithParams("get_node"),
      ).rejects.toThrow("Node not found");
    });

    it("uses 35s timeout for normal calls", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: null }), { status: 200 }),
      );

      await follower.sendWithParams("get_node");
      const call = mockFetch.mock.calls[0]!;
      const init = call[1] as { signal: unknown };
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe("listConnectedFiles", () => {
    it("returns the array from the response", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { fileKey: "f1", fileName: "design.fig" },
              { fileKey: "f2", fileName: "deck.fig" },
            ],
          }),
          { status: 200 },
        ),
      );

      const files = await follower.listConnectedFiles();
      expect(files).toEqual([
        { fileKey: "f1", fileName: "design.fig" },
        { fileKey: "f2", fileName: "deck.fig" },
      ]);
    });

    it("returns [] when response data is missing", async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200 }),
      );

      const files = await follower.listConnectedFiles();
      expect(files).toEqual([]);
    });
  });

  describe("ping", () => {
    it("returns true on 2xx", async () => {
      mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));
      expect(await follower.ping()).toBe(true);
    });

    it("returns true on any 2xx", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
      expect(await follower.ping()).toBe(true);
    });

    it("returns false on non-2xx", async () => {
      mockFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
      expect(await follower.ping()).toBe(false);
    });

    it("returns false on fetch error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
      expect(await follower.ping()).toBe(false);
    });
  });
});
