import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

type SpecNode =
  | { type: "text"; text: string; name?: string; size?: number; weight?: number }
  | { type: "button"; text: string; name?: string; fill?: string; textColor?: string; cornerRadius?: number }
  | { type: "input"; placeholder?: string; name?: string; width?: number }
  | { type: "rect"; name?: string; width: number; height: number; fill?: string; cornerRadius?: number }
  | { type: "row"; name?: string; gap?: number; children?: SpecNode[] }
  | { type: "column"; name?: string; gap?: number; padding?: number; children?: SpecNode[] };

interface SpecImportParams {
  parentId: string;
  name: string;
  /** JSON string describing the layout. */
  spec: string;
  /** Optional design tokens to apply: { tokenName: hexValue }. */
  tokens?: Record<string, string>;
}

interface SpecImportResult {
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

function applyFill(node: SceneNode, fill: string | undefined, tokens: Record<string, string>): void {
  if (!("fills" in node)) return;
  let color: { r: number; g: number; b: number } | undefined;
  if (fill) {
    const fromToken = tokens[fill];
    color = fromToken ? hexToRgb(fromToken) : hexToRgb(fill);
  }
  (node as GeometryMixin).fills = color ? [{ type: "SOLID", color } as unknown as Paint] : [];
}

async function createSpecNode(parent: SceneNode, spec: SpecNode, tokens: Record<string, string>): Promise<BaseNode | null> {
  if (spec.type === "text") {
    const t = figma.createText();
    t.fontName = { family: "Inter", style: "Regular" };
    t.characters = spec.text;
    if (spec.name) t.name = spec.name;
    if (spec.size && typeof spec.size === "number") t.fontSize = spec.size;
    if (spec.weight) {
      try { await t.setTextStyleIdAsync(""); t.fontName = { family: "Inter", style: spec.weight.toString() }; } catch { /* ignore */ }
    }
    (parent as ChildrenMixin).appendChild(t);
    return t;
  }
  if (spec.type === "button") {
    const b = figma.createFrame();
    b.name = spec.name ?? "Button";
    b.layoutMode = "HORIZONTAL";
    b.primaryAxisSizingMode = "AUTO";
    b.counterAxisSizingMode = "AUTO";
    b.primaryAxisAlignItems = "CENTER";
    b.counterAxisAlignItems = "CENTER";
    b.paddingLeft = 16; b.paddingRight = 16; b.paddingTop = 8; b.paddingBottom = 8;
    b.cornerRadius = spec.cornerRadius ?? 8;
    applyFill(b, spec.fill, tokens);
    (parent as ChildrenMixin).appendChild(b);
    const t = figma.createText();
    t.fontName = { family: "Inter", style: "Medium" };
    t.characters = spec.text;
    if (spec.textColor) {
      t.fills = [{ type: "SOLID", color: hexToRgb(spec.textColor) } as unknown as Paint];
    }
    (b as ChildrenMixin).appendChild(t);
    return b;
  }
  if (spec.type === "input") {
    const i = figma.createFrame();
    i.name = spec.name ?? "Input";
    i.layoutMode = "HORIZONTAL";
    i.primaryAxisSizingMode = "AUTO";
    i.counterAxisSizingMode = "AUTO";
    i.primaryAxisAlignItems = "MIN";
    i.counterAxisAlignItems = "CENTER";
    i.paddingLeft = 12; i.paddingRight = 12; i.paddingTop = 8; i.paddingBottom = 8;
    i.cornerRadius = 6;
    if (spec.width) i.resize(spec.width, i.height);
    applyFill(i, "#ffffff", tokens);
    (parent as ChildrenMixin).appendChild(i);
    if (spec.placeholder) {
      const t = figma.createText();
      t.fontName = { family: "Inter", style: "Regular" };
      t.characters = spec.placeholder;
      t.fills = [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5 } } as unknown as Paint];
      (i as ChildrenMixin).appendChild(t);
    }
    return i;
  }
  if (spec.type === "rect") {
    const r = figma.createRectangle();
    r.name = spec.name ?? "Rect";
    r.resize(spec.width, spec.height);
    if (spec.cornerRadius !== undefined) r.cornerRadius = spec.cornerRadius;
    applyFill(r, spec.fill, tokens);
    (parent as ChildrenMixin).appendChild(r);
    return r;
  }
  if (spec.type === "row" || spec.type === "column") {
    const f = figma.createFrame();
    f.name = spec.name ?? (spec.type === "row" ? "Row" : "Column");
    f.layoutMode = spec.type === "row" ? "HORIZONTAL" : "VERTICAL";
    f.primaryAxisSizingMode = "AUTO";
    f.counterAxisSizingMode = "AUTO";
    if (spec.gap !== undefined) f.itemSpacing = spec.gap;
    if (spec.padding !== undefined) {
      f.paddingTop = spec.padding;
      f.paddingBottom = spec.padding;
      f.paddingLeft = spec.padding;
      f.paddingRight = spec.padding;
    }
    f.fills = [];
    (parent as ChildrenMixin).appendChild(f);
    for (const c of spec.children ?? []) {
      await createSpecNode(f, c, tokens);
    }
    return f;
  }
  return null;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as SpecImportParams;
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
  if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "spec must be a JSON object with 'type' field" } };
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
  const tokens = params.tokens ?? {};
  const root = await createSpecNode(parent, parsed as SpecNode, tokens);
  if (!root) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "Unknown root node type" } };
  }
  root.name = params.name;
  return { type: request.type, requestId: request.requestId, data: { rootId: root.id, createdNodeIds: "children" in root ? (root as ChildrenMixin).children.map((c) => c.id) : [] } satisfies SpecImportResult };
}
