import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface InspectParams {
  nodeIds: string[];
  /** Recurse into children. Default false (inspect only requested nodes). */
  recurse?: boolean;
  /** Include bound variables (componentPropertyName → value). Default true. */
  includeVariables?: boolean;
  /** Max depth for recurse. Default 1. */
  maxDepth?: number;
}

interface BoxModel {
  x: number;
  y: number;
  width: number;
  height: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  padding?: { top: number; right: number; bottom: number; left: number };
  cornerRadius?: number | null;
  rotation?: number;
  opacity?: number;
  fillsCount?: number;
  strokesCount?: number;
  effectsCount?: number;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  constraints?: {
    horizontal: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER";
    vertical: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER";
  };
}

interface InspectResult {
  nodeId: string;
  name: string;
  type: string;
  box: BoxModel;
  typography?: {
    font: { family: string; style: string };
    size: number;
    lineHeight: number | string;
    letterSpacing: number | string;
    paragraphSpacing?: number;
  };
  fills?: Array<{ value: string; boundVariable?: string; visible: boolean }>;
  strokes?: Array<{ value: string; boundVariable?: string }>;
  effects?: Array<{ type: string; visible: boolean }>;
  variables?: {
    bound: Record<string, string>;
  };
  warnings?: string[];
  children?: InspectResult[];
}

function isTextNode(n: SceneNode): n is TextNode {
  return n.type === "TEXT";
}

function isFrameLike(n: SceneNode): n is FrameNode {
  return n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE";
}

function extractBoxModel(node: SceneNode): BoxModel {
  const base: BoxModel = {
    x: (node as { x: number }).x ?? 0,
    y: (node as { y: number }).y ?? 0,
    width: (node as { width?: number }).width ?? 0,
    height: (node as { height?: number }).height ?? 0,
  };
  if ("rotation" in node) base.rotation = (node as { rotation: number }).rotation;
  if ("opacity" in node) base.opacity = (node as { opacity: number }).opacity;
  if (isFrameLike(node) && node.layoutMode !== "NONE") {
    base.layoutMode = node.layoutMode;
    base.padding = {
      top: node.paddingTop,
      right: node.paddingRight,
      bottom: node.paddingBottom,
      left: node.paddingLeft,
    };
    if ("itemSpacing" in node) {
      // spacing is captured via layout measurements tool, skip here
    }
  }
  if ("cornerRadius" in node) base.cornerRadius = (node as { cornerRadius?: number }).cornerRadius ?? null;
  if ("fills" in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) base.fillsCount = (fills as unknown[]).length;
  }
  if ("strokes" in node) {
    const strokes = (node as GeometryMixin).strokes;
    if (Array.isArray(strokes)) base.strokesCount = (strokes as unknown[]).length;
  }
  if ("effects" in node) {
    const eff = (node as BlendMixin).effects;
    if (Array.isArray(eff)) base.effectsCount = (eff as unknown[]).length;
  }
  // Constraints (MIN/MAX/STRETCH/SCALE/CENTER)
  if ("constraints" in node) {
    const c = (node as { constraints: { horizontal: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER"; vertical: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER" } }).constraints;
    base.constraints = { horizontal: c.horizontal, vertical: c.vertical };
  }
  return base;
}

function extractTypography(node: TextNode): NonNullable<InspectResult["typography"]> {
  const fontName = (node.fontName as FontName) ?? { family: "Inter", style: "Regular" };
  return {
    font: { family: fontName.family, style: fontName.style },
    size: (node.fontSize as number) ?? 16,
    lineHeight: (node.lineHeight as number) ?? 1.5,
    letterSpacing: (node.letterSpacing as number) ?? 0,
    paragraphSpacing: (node as TextNode).paragraphSpacing ?? 0,
  };
}

function extractFills(node: SceneNode): InspectResult["fills"] {
  if (!("fills" in node)) return undefined;
  const fills = (node as GeometryMixin).fills;
  if (!Array.isArray(fills)) return undefined;
  return (fills as readonly Paint[]).map((f) => {
    if (f.type === "SOLID") {
      const c = (f as SolidPaint).color;
      const hex = `#${[c.r, c.g, c.b].map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("")}`;
      const bv = (f as { boundVariables?: { color?: { id: string } } }).boundVariables;
      return { value: hex, boundVariable: bv?.color?.id, visible: (f as SolidPaint).visible ?? true };
    }
    return { value: f.type, visible: true };
  });
}

function extractStrokes(node: SceneNode): InspectResult["strokes"] {
  if (!("strokes" in node)) return undefined;
  const strokes = (node as GeometryMixin).strokes;
  if (!Array.isArray(strokes)) return undefined;
  return (strokes as readonly Paint[]).map((f) => {
    if (f.type === "SOLID") {
      const c = (f as SolidPaint).color;
      const hex = `#${[c.r, c.g, c.b].map((n) => Math.round(n * 255).toString(16).padStart(2, "0")).join("")}`;
      const bv = (f as { boundVariables?: { color?: { id: string } } }).boundVariables;
      return { value: hex, boundVariable: bv?.color?.id };
    }
    return { value: f.type };
  });
}

function extractEffects(node: SceneNode): InspectResult["effects"] {
  if (!("effects" in node)) return undefined;
  const eff = (node as BlendMixin).effects;
  if (!Array.isArray(eff)) return undefined;
  return (eff as readonly Effect[]).map((e) => ({ type: e.type, visible: (e as { visible?: boolean }).visible ?? true }));
}

function extractBoundVariables(node: SceneNode): Record<string, string> | undefined {
  if (!("boundVariables" in node)) return undefined;
  const bv = (node as { boundVariables: Record<string, { id: string; type: string } | undefined> }).boundVariables;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(bv)) {
    if (v?.id) out[k] = v.id;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function extractWarnings(node: SceneNode): string[] | undefined {
  const out: string[] = [];
  // Overflow: child larger than parent
  if ("width" in node && "height" in node && "children" in node) {
    const n = node as { width: number; height: number; children: SceneNode[] };
    for (const c of n.children) {
      if ((c as { x?: number }).x !== undefined && (c as { width: number }).width > n.width) {
        out.push(`Child "${c.name}" overflows parent width`);
      }
    }
  }
  return out.length > 0 ? out : undefined;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as InspectParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const recurse = params.recurse ?? false;
  const includeVariables = params.includeVariables ?? true;
  const maxDepth = params.maxDepth ?? 1;

  const out: InspectResult[] = [];
  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    out.push(await inspect(node, recurse ? maxDepth : 0, includeVariables));
  }
  return { type: request.type, requestId: request.requestId, data: out };
}

async function inspect(node: SceneNode, depthRemaining: number, includeVariables: boolean): Promise<InspectResult> {
  const result: InspectResult = {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    box: extractBoxModel(node),
  };
  if (isTextNode(node)) {
    result.typography = extractTypography(node);
  }
  result.fills = extractFills(node);
  result.strokes = extractStrokes(node);
  result.effects = extractEffects(node);
  if (includeVariables) {
    const bv = extractBoundVariables(node);
    if (bv) result.variables = { bound: bv };
  }
  const warnings = extractWarnings(node);
  if (warnings) result.warnings = warnings;
  if (depthRemaining > 0 && "children" in node) {
    result.children = [];
    for (const c of (node as ChildrenMixin).children) {
      result.children.push(await inspect(c as SceneNode, depthRemaining - 1, includeVariables));
    }
  }
  return result;
}
