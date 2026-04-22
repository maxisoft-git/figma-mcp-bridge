import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseHexColor, positionNode, resizeNodeIfSupported, setSolidFill } from "./utils";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseHexColor", () => {
  it("should parse 3-digit hex", () => {
    const result = parseHexColor("#F00");
    expect(result).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("should parse 6-digit hex", () => {
    const result = parseHexColor("#FF0000");
    expect(result).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("should throw on invalid hex", () => {
    expect(() => parseHexColor("#GGGGGG")).toThrow("Invalid hex color: #GGGGGG");
  });

  it("should handle lowercase hex", () => {
    const result = parseHexColor("#aabbcc");
    expect(result.r).toBeCloseTo(0.67, 2);
    expect(result.g).toBeCloseTo(0.73, 2);
    expect(result.b).toBeCloseTo(0.8, 2);
  });
});

describe("positionNode", () => {
  it("should set x and y", () => {
    const node = { x: 0, y: 0 } as any;
    positionNode(node, 100, 200);
    expect(node.x).toBe(100);
    expect(node.y).toBe(200);
  });

  it("should ignore non-number values", () => {
    const node = { x: 0, y: 0 } as any;
    positionNode(node, "abc", undefined);
    expect(node.x).toBe(0);
    expect(node.y).toBe(0);
  });

  it("should set only x when y is not a number", () => {
    const node = { x: 0, y: 0 } as any;
    positionNode(node, 100, "abc" as any);
    expect(node.x).toBe(100);
    expect(node.y).toBe(0);
  });
});

describe("resizeNodeIfSupported", () => {
  it("should resize node with resize method", () => {
    const node = { width: 100, height: 100, resize: (w: number, h: number) => { node.width = w; node.height = h; } } as any;
    resizeNodeIfSupported(node, 200, 150);
    expect(node.width).toBe(200);
    expect(node.height).toBe(150);
  });

  it("should throw if node does not support resize", () => {
    const node = { id: "1:1" } as any;
    expect(() => resizeNodeIfSupported(node, 200, 150)).toThrow("Node does not support resizing: 1:1");
  });

  it("should do nothing if neither width nor height is provided", () => {
    const node = { width: 100, height: 100, resize: vi.fn() } as any;
    resizeNodeIfSupported(node, undefined, undefined);
    expect(node.resize).not.toHaveBeenCalled();
  });

  it("should resize with current width if only height is provided", () => {
    const node = { width: 100, height: 100, resize: vi.fn() } as any;
    resizeNodeIfSupported(node, undefined, 50);
    expect(node.resize).toHaveBeenCalledWith(100, 50);
  });
});

describe("setSolidFill", () => {
  it("should set solid fill on node with fills property", () => {
    const node = { id: "1:1", fills: [] } as any;
    setSolidFill(node, "#FF0000", 0.5);
    expect(node.fills).toEqual([
      { type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 0.5 },
    ]);
  });

  it("should default opacity to 1", () => {
    const node = { id: "1:1", fills: [] } as any;
    setSolidFill(node, "#00FF00");
    expect(node.fills[0].opacity).toBe(1);
  });

  it("should throw if node does not support fills", () => {
    const node = { id: "1:1" } as any;
    expect(() => setSolidFill(node, "#FF0000")).toThrow("Node does not support fills: 1:1");
  });
});