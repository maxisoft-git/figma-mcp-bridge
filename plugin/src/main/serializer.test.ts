import { describe, it, expect, beforeEach } from "vitest";
import { vi } from "vitest";
import {
  MAX_NODE_RESULT_CHARS,
  serializeNode,
  serializeNodeWithinBudget,
} from "./serializer";

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

describe("serializeNode with enrich option", () => {
  it("should always include absoluteBounds when available", () => {
    const node = createMockSceneNode({
      id: "1:1",
      type: "FRAME",
      absoluteBoundingBox: { x: 100, y: 200, width: 300, height: 400 },
    });

    const result = serializeNode(node as any);

    expect(result.absoluteBounds).toEqual({ x: 100, y: 200, width: 300, height: 400 });
  });

  it("should include styleReferences when enrich=true and node has fillStyleId", () => {
    const node = createMockSceneNode({
      id: "1:1",
      type: "RECTANGLE",
      fillStyleId: "S:abc123",
    });

    const result = serializeNode(node as any, { enrich: true });

    expect(result.styleReferences?.fillStyleId).toEqual({
      id: "S:abc123",
      name: "(unresolved)",
    });
  });

  it("should NOT include styleReferences when enrich=false (default)", () => {
    const node = createMockSceneNode({
      id: "1:1",
      type: "RECTANGLE",
      fillStyleId: "S:abc123",
    });

    const result = serializeNode(node as any);

    expect(result.styleReferences).toBeUndefined();
  });

  it("should not break when fills is 'mixed' (the for...of bug)", () => {
    const node = createMockSceneNode({
      id: "1:1",
      type: "FRAME",
      children: [
        createMockSceneNode({
          id: "1:2",
          type: "RECTANGLE",
          visible: true,
        }),
      ],
      styles: undefined,
    });
    // Manually set styles.fills to "mixed" (mimics mixed values across children)
    (node as any).styles = { fills: "mixed" };

    const result = serializeNode(node as any, { enrich: true });

    expect(result.children).toHaveLength(1);
    expect(result.children?.[0].id).toBe("1:2");
  });
});

describe("serializeNode paint defaults", () => {
  it("leaves opacity out of an opaque solid paint", () => {
    const node = createMockSceneNode({
      type: "RECTANGLE",
      fills: [
        { type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 }, opacity: 1 },
      ],
    });

    const result = serializeNode(node as any);

    expect(result.styles?.fills).toEqual([{ type: "SOLID", color: "#ff0000" }]);
  });

  it("keeps a solid paint whose opacity is not the default", () => {
    const node = createMockSceneNode({
      type: "RECTANGLE",
      fills: [
        { type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0 }, opacity: 0.4 },
      ],
    });

    const result = serializeNode(node as any);

    expect(result.styles?.fills).toEqual([
      { type: "SOLID", color: "#ff0000", opacity: 0.4 },
    ]);
  });
});

describe("serializeNodeWithinBudget", () => {
  const childrenNamed = (count: number, prefix = "1") =>
    Array.from({ length: count }, (_, index) =>
      createMockSceneNode({
        id: `${prefix}:${index + 2}`,
        name: `Child number ${index} with a reasonably long name`,
      })
    );

  it("returns a tree that fits untouched", () => {
    const node = createMockSceneNode({ children: childrenNamed(3) });

    const result = serializeNodeWithinBudget(node as any, MAX_NODE_RESULT_CHARS);

    expect(result.truncated).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.children).toHaveLength(3);
  });

  it("cuts child by child and stays inside the budget", () => {
    const children = childrenNamed(60);
    const node = createMockSceneNode({ children });
    const budget = 4_000;

    const result = serializeNodeWithinBudget(node as any, budget);

    expect(result.truncated).toBe(true);
    expect(result.note).toContain(String(budget));
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(budget);
    // Some children made it, but not all of them.
    expect(result.children?.length ?? 0).toBeGreaterThan(0);
    expect(result.children?.length ?? 0).toBeLessThan(children.length);
    expect(result.childCount).toBe(children.length);
  });

  it("walks the whole tree when the budget is generous enough to hold it", () => {
    const node = createMockSceneNode({
      children: [
        createMockSceneNode({
          id: "1:2",
          children: [createMockSceneNode({ id: "1:3" })],
        }),
      ],
    });

    const result = serializeNodeWithinBudget(node as any, 100 * 1024);

    expect(result.truncated).toBeUndefined();
    expect(result.children?.[0].children?.[0].id).toBe("1:3");
  });

  it("reports childCount instead of children once the depth limit is reached", () => {
    const node = createMockSceneNode({
      children: [
        createMockSceneNode({
          id: "1:2",
          children: [createMockSceneNode({ id: "1:3" })],
        }),
      ],
    });

    const result = serializeNodeWithinBudget(node as any, 100 * 1024, { depth: 1 });

    expect(result.children?.[0].childCount).toBe(1);
    expect(result.children?.[0].children).toBeUndefined();
  });

  it("honours includeHidden while cutting", () => {
    const visible = childrenNamed(40, "2");
    const hidden = childrenNamed(40, "3").map((child) => ({
      ...child,
      visible: false,
    }));
    const node = createMockSceneNode({ children: [...visible, ...hidden] });

    const without = serializeNodeWithinBudget(node as any, 4_000);
    const withHidden = serializeNodeWithinBudget(node as any, 4_000, {
      includeHidden: true,
    });

    // The hidden half is neither carried nor counted.
    expect(without.truncated).toBe(true);
    expect(JSON.stringify(without)).not.toMatch(/"3:\d+"/);
    expect(without.childCount).toBe(visible.length);
    // Asked for hidden nodes, the same budget has to cover both halves.
    expect(withHidden.childCount).toBe(visible.length + hidden.length);
    expect(withHidden.children?.length ?? 0).toBeGreaterThan(0);
  });
});