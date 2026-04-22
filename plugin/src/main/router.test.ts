import { describe, it, expect, beforeEach, vi } from "vitest";
import { dispatch } from "./router";

beforeEach(() => {
  vi.clearAllMocks();
});

global.figma = {
  currentPage: {
    id: "0:1",
    name: "Page 1",
    type: "PAGE",
    selection: [],
    children: [],
  } as unknown as PageNode,
  root: {
    name: "Test File",
    children: [],
  } as unknown as DocumentNode,
  fileKey: "test-file-key",
  getNodeByIdAsync: vi.fn(async () => null),
  getNodeById: vi.fn(() => null),
  loadFontAsync: vi.fn(),
  base64Decode: vi.fn(),
  createFrame: vi.fn(),
  createText: vi.fn(),
  createShape: vi.fn(),
  createImage: vi.fn(),
  createComponent: vi.fn(),
  createInstance: vi.fn(),
  showUI: vi.fn(),
  ui: { postMessage: vi.fn() },
  importComponentByKeyAsync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
} as unknown as typeof figma;

describe("router.dispatch", () => {
  it("should throw for unknown request type", async () => {
    await expect(
      dispatch({ type: "unknown_type" as any, requestId: "1" })
    ).rejects.toThrow("Unknown request type: unknown_type");
  });

  it("should return data for get_metadata", async () => {
    const result = await dispatch({ type: "get_metadata", requestId: "req-1" });
    expect(result.requestId).toBe("req-1");
    expect(result.type).toBe("get_metadata");
    expect(result.data).toBeDefined();
    expect((result.data as any).fileName).toBe("Test File");
  });

  it("should return data for get_selection", async () => {
    const result = await dispatch({ type: "get_selection", requestId: "req-2" });
    expect(result.requestId).toBe("req-2");
    expect(result.type).toBe("get_selection");
    expect(result.data).toBeDefined();
  });
});

describe("get_node handler", () => {
  it("should throw for missing nodeIds", async () => {
    await expect(
      dispatch({ type: "get_node", requestId: "req-3" })
    ).rejects.toThrow("nodeIds is required for get_node");
  });
});

describe("create_frame handler", () => {
  it("should create frame with parameters", async () => {
    const mockFrame = {
      id: "1:100",
      name: "New Frame",
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      resize: (w: number, h: number) => { mockFrame.width = w; mockFrame.height = h; },
      appendChild: vi.fn(),
    };
    (figma.createFrame as any).mockReturnValue(mockFrame);

    const result = await dispatch({
      type: "create_frame",
      requestId: "req-4",
      params: { name: "New Frame", width: 200, height: 100 },
    });

    expect(result.type).toBe("create_frame");
    expect(result.data).toMatchObject({
      nodeId: "1:100",
      nodeName: "New Frame",
    });
  });
});

describe("delete_nodes handler", () => {
  it("should throw for missing confirm", async () => {
    await expect(
      dispatch({
        type: "delete_nodes",
        requestId: "req-5",
        nodeIds: ["1:1"],
        params: { confirm: false },
      })
    ).rejects.toThrow("delete_nodes requires confirm: true");
  });

  it("should return partial success when node not found", async () => {
    (figma.getNodeById as any).mockReturnValue(null);

    const result = await dispatch({
      type: "delete_nodes",
      requestId: "req-6",
      nodeIds: ["1:1"],
      params: { confirm: true },
    });

    expect(result.data).toMatchObject({
      total: 1,
      deletedCount: 0,
      failedCount: 1,
      results: [{ nodeId: "1:1", success: false }],
    });
  });
});