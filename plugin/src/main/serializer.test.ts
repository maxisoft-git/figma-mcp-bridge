import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import { serializeNode } from "./serializer";

beforeEach(() => {
  vi.clearAllMocks();
});

const createMockSceneNode = (overrides: Record<string, unknown> = {}) => ({
  id: "0:1",
  name: "Mock Node",
  type: "FRAME",
  parent: null,
  children: [],
  removed: false,
  appendChild: vi.fn(),
  insertChild: vi.fn(),
  removeChild: vi.fn(),
  setPluginData: vi.fn(),
  getPluginData: vi.fn(),
  setSharedPluginData: vi.fn(),
  getSharedPluginData: vi.fn(),
  remove: vi.fn(),
  duplicate: vi.fn(),
  exports: vi.fn(),
  exportSettings: [],
  nameRaw: "",
  visible: true,
  locked: false,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  blendMode: "normal",
  effects: [],
  fills: [],
  strokes: [],
  strokeWeight: 0,
  strokeAlign: "CENTER",
  dashPattern: [],
  cornerRadius: 0,
  topLeftRadius: 0,
  topRightRadius: 0,
  bottomRightRadius: 0,
  bottomLeftRadius: 0,
  cornerSmoothing: 0,
  layoutMode: "NONE",
  paddingLeft: 0,
  paddingRight: 0,
  paddingTop: 0,
  paddingBottom: 0,
  itemSpacing: 0,
  primaryAxisAlignItems: "MIN",
  counterAxisAlignItems: "MIN",
  primaryAxisSizingMode: "AUTO",
  counterAxisSizingMode: "AUTO",
  layoutWrap: "NO_WRAP",
  counterAxisSpacing: 0,
  clipsContent: false,
  constraints: { horizontal: "MIN", vertical: "MIN" },
  ...overrides,
});

describe("serializeNode", () => {
  it("should serialize a basic frame node", async () => {
    const node = createMockSceneNode({
      id: "1:1",
      name: "Test Frame",
      type: "FRAME",
      x: 10,
      y: 20,
      width: 200,
      height: 150,
    });

    const result = serializeNode(node as any);

    expect(result).toMatchObject({
      id: "1:1",
      name: "Test Frame",
      type: "FRAME",
      bounds: { x: 10, y: 20, width: 200, height: 150 },
    });
    expect(result.styles).toBeDefined();
  });

  it("should filter out hidden children by default", async () => {
    const visibleChild = createMockSceneNode({ id: "1:2", name: "Visible", visible: true });
    const hiddenChild = createMockSceneNode({ id: "1:3", name: "Hidden", visible: false });

    const parent = createMockSceneNode({
      children: [visibleChild, hiddenChild],
    });

    const result = serializeNode(parent as any);

    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].name).toBe("Visible");
  });

  it("should include hidden children when includeHidden is true", async () => {
    const visibleChild = createMockSceneNode({ id: "1:2", name: "Visible", visible: true });
    const hiddenChild = createMockSceneNode({ id: "1:3", name: "Hidden", visible: false });

    const parent = createMockSceneNode({
      children: [visibleChild, hiddenChild],
    });

    const result = serializeNode(parent as any, { includeHidden: true });

    expect(result.children).toHaveLength(2);
  });

  it("should serialize solid fill", async () => {
    const node = createMockSceneNode({
      fills: [
        {
          type: "SOLID",
          visible: true,
          opacity: 0.5,
          color: { r: 1, g: 0, b: 0, a: 1 },
        },
      ],
    });

    const result = serializeNode(node as any);

    expect(result.styles?.fills).toEqual([
      {
        type: "SOLID",
        color: "#ff0000",
        opacity: 0.5,
      },
    ]);
  });

  it("should serialize gradient fill", async () => {
    const node = createMockSceneNode({
      fills: [
        {
          type: "GRADIENT_LINEAR",
          visible: true,
          opacity: 1,
          gradientStops: [
            { color: { r: 1, g: 0, b: 0, a: 1 }, position: 0 },
            { color: { r: 0, g: 0, b: 1, a: 1 }, position: 1 },
          ],
          gradientTransform: [[1, 0, 0], [0, 1, 0]],
        },
      ],
    });

    const result = serializeNode(node as any);

    expect(result.styles?.fills).toEqual([
      expect.objectContaining({
        type: "GRADIENT_LINEAR",
        gradientStops: [
          { color: "#ff0000", opacity: 1, position: 0 },
          { color: "#0000ff", opacity: 1, position: 1 },
        ],
      }),
    ]);
  });

  it("should serialize drop shadow effect", async () => {
    const node = createMockSceneNode({
      effects: [
        {
          type: "DROP_SHADOW",
          visible: true,
          color: { r: 0, g: 0, b: 0, a: 0.25 },
          offset: { x: 0, y: 4 },
          radius: 8,
          spread: 0,
          blendMode: "NORMAL",
        },
      ],
    });

    const result = serializeNode(node as any);

    expect(result.styles?.effects).toEqual([
      expect.objectContaining({
        type: "DROP_SHADOW",
        color: "#000000",
        opacity: 0.25,
        offset: { x: 0, y: 4 },
        radius: 8,
      }),
    ]);
  });

  it("should serialize corner radii", async () => {
    const node = createMockSceneNode({
      cornerRadius: 8,
      topLeftRadius: 8,
      topRightRadius: 8,
      bottomRightRadius: 8,
      bottomLeftRadius: 8,
    });

    const result = serializeNode(node as any);

    expect(result.styles?.cornerRadius).toBe(8);
    expect(result.styles?.cornerRadii).toBeUndefined();
  });

  it("should serialize individual corner radii when different", async () => {
    const node = createMockSceneNode({
      cornerRadius: 0,
      topLeftRadius: 4,
      topRightRadius: 8,
      bottomRightRadius: 12,
      bottomLeftRadius: 16,
    });

    const result = serializeNode(node as any);

    expect(result.styles?.cornerRadii).toEqual({
      topLeft: 4,
      topRight: 8,
      bottomRight: 12,
      bottomLeft: 16,
    });
  });

  it("should serialize auto-layout properties", async () => {
    const node = createMockSceneNode({
      layoutMode: "HORIZONTAL",
      itemSpacing: 16,
      primaryAxisAlignItems: "CENTER",
      counterAxisAlignItems: "MAX",
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "FIXED",
      paddingLeft: 20,
      paddingRight: 20,
      paddingTop: 10,
      paddingBottom: 10,
    });

    const result = serializeNode(node as any);

    expect(result.styles?.autoLayout).toMatchObject({
      direction: "HORIZONTAL",
      gap: 16,
      primaryAxisAlign: "CENTER",
      counterAxisAlign: "MAX",
      primaryAxisSizing: "AUTO",
      counterAxisSizing: "FIXED",
    });
    expect(result.styles?.padding).toEqual({
      top: 10,
      right: 20,
      bottom: 10,
      left: 20,
    });
  });

  it("should return undefined bounds for nodes without position", async () => {
    const node = {
      id: "1:1",
      name: "Test",
      type: "DOCUMENT",
    } as any;

    const result = serializeNode(node);

    expect(result.bounds).toBeUndefined();
  });

  it("should serialize mixed values as 'mixed' string", async () => {
    const node = {
      id: "1:1",
      name: "Test",
      type: "TEXT",
      fontSize: Symbol("mixed"),
      fontName: Symbol("mixed"),
      fontWeight: Symbol("mixed"),
      textDecoration: Symbol("mixed"),
      lineHeight: Symbol("mixed"),
      letterSpacing: Symbol("mixed"),
      textAlignHorizontal: Symbol("mixed"),
      textAlignVertical: Symbol("mixed"),
      characters: "",
      fills: [],
    } as any;

    const result = serializeNode(node);

    expect(result.styles?.fontSize).toBe("mixed");
    expect(result.styles?.fontFamily).toBe("mixed");
  });
});

describe("parseHexColor", () => {
  it("should parse 3-digit hex", async () => {
    const { parseHexColor } = await import("./utils");

    const result = parseHexColor("#F00");
    expect(result).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("should parse 6-digit hex", async () => {
    const { parseHexColor } = await import("./utils");

    const result = parseHexColor("#FF0000");
    expect(result).toEqual({ r: 1, g: 0, b: 0 });
  });

  it("should throw on invalid hex", async () => {
    const { parseHexColor } = await import("./utils");

    expect(() => parseHexColor("#GGGGGG")).toThrow();
  });
});