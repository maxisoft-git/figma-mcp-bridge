import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

type StorybookNode =
  | { type: "text"; text: string; name?: string }
  | { type: "rect"; name: string; w: number; h: number; fill?: string; cornerRadius?: number }
  | { type: "frame"; name: string; layoutMode?: "VERTICAL" | "HORIZONTAL"; padding?: number; itemSpacing?: number; fill?: string; children?: StorybookNode[] }
  | { type: "circle"; name: string; w: number; h: number; fill?: string };

interface StorybookImportParams {
  parentId: string;
  /** Top-level component name. */
  name: string;
  /** JSON string describing the structure. */
  spec: string;
}

interface StorybookImportResult {
  rootId: string;
  createdNodeIds: string[];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

async function createNode(parent: SceneNode, spec: StorybookNode): Promise<BaseNode | null> {
  if (spec.type === "text") {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: "Regular" };
    t.characters = spec.text;
    if (spec.name) t.name = spec.name;
    (parent as ChildrenMixin).appendChild(t);
    return t;
  }
  if (spec.type === "rect") {
    const r = figma.createRectangle();
    r.name = spec.name;
    r.resize(spec.w, spec.h);
    if (spec.fill) {
      r.fills = [{ type: "SOLID", color: hexToRgb(spec.fill) } as unknown as Paint];
    } else {
      r.fills = [];
    }
    if (spec.cornerRadius !== undefined) r.cornerRadius = spec.cornerRadius;
    (parent as ChildrenMixin).appendChild(r);
    return r;
  }
  if (spec.type === "circle") {
    const e = figma.createEllipse();
    e.name = spec.name;
    e.resize(spec.w, spec.h);
    if (spec.fill) {
      e.fills = [{ type: "SOLID", color: hexToRgb(spec.fill) } as unknown as Paint];
    } else {
      e.fills = [];
    }
    (parent as ChildrenMixin).appendChild(e);
    return e;
  }
  if (spec.type === "frame") {
    const f = figma.createFrame();
    f.name = spec.name;
    f.layoutMode = spec.layoutMode ?? "VERTICAL";
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    if (spec.padding !== undefined) {
      f.paddingTop = spec.padding;
      f.paddingBottom = spec.padding;
      f.paddingLeft = spec.padding;
      f.paddingRight = spec.padding;
    }
    if (spec.itemSpacing !== undefined) f.itemSpacing = spec.itemSpacing;
    if (spec.fill) {
      f.fills = [{ type: "SOLID", color: hexToRgb(spec.fill) } as unknown as Paint];
    } else {
      f.fills = [];
    }
    (parent as ChildrenMixin).appendChild(f);
    for (const c of spec.children ?? []) {
      await createNode(f, c);
    }
    return f;
  }
  return null;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as StorybookImportParams;
  if (!params.parentId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "parentId is required" } };
  }
  if (!params.name) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "name is required" } };
  }
  if (typeof params.spec !== "string" || params.spec.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "spec is required" } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(params.spec);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}` } };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "spec must be a JSON object" } };
  }
  let parent: SceneNode;
  try {
    parent = await resolveNode(params.parentId);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }
  if (!("appendChild" in parent)) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "parent does not accept children" } };
  }
  const root = figma.createFrame();
  root.name = params.name;
  root.layoutMode = "VERTICAL";
  root.primaryAxisSizingMode = "AUTO";
  root.counterAxisSizingMode = "AUTO";
  root.fills = [];
  (parent as ChildrenMixin).appendChild(root);
  for (const c of (parsed as { children?: StorybookNode[] }).children ?? []) {
    await createNode(root, c);
  }
  return { type: request.type, requestId: request.requestId, data: { rootId: root.id, createdNodeIds: (root as ChildrenMixin).children.map((c) => c.id) } satisfies StorybookImportResult };
}
