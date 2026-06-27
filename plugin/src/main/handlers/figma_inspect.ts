import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface FigmaInspectParams {
  nodeIds: string[];
  /** Include auto-layout tree (default true). */
  includeLayoutTree?: boolean;
  /** Include text style metrics (default true). */
  includeTypography?: boolean;
}

interface ConstraintsReport {
  horizontal: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER";
  vertical: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER";
}

interface LayoutInfo {
  mode: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  itemSpacing?: number;
  counterAxisSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
}

interface FigmaNodeInspect {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  position: { x: number; y: number; rotation: number };
  size: { width: number; height: number };
  opacity: number;
  constraints?: ConstraintsReport;
  layout?: LayoutInfo;
  typography?: {
    family: string;
    style: string;
    size: number;
    lineHeight: number | string;
    letterSpacing: number | string;
    paragraphSpacing?: number;
    textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
    textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  };
  fills: Array<{ type: string; value: string; boundVariable?: string; opacity?: number; visible: boolean }>;
  strokes: Array<{ type: string; value: string; boundVariable?: string }>;
  effects: Array<{ type: string; visible: boolean }>;
  cornerRadius?: number | null;
  parentId?: string;
  componentId?: string;
  layoutTree?: FigmaNodeInspect[];
}

function rgbToHex(c: { r: number; g: number; b: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

function fillToValue(f: Paint): { type: string; value: string; boundVariable?: string; opacity?: number; visible: boolean } {
  if (f.type === "SOLID") {
    const c = (f as SolidPaint).color;
    const bv = (f as { boundVariables?: { color?: { id: string } } }).boundVariables;
    return { type: "SOLID", value: rgbToHex(c), boundVariable: bv?.color?.id, opacity: (f as SolidPaint).opacity ?? 1, visible: (f as SolidPaint).visible ?? true };
  }
  return { type: f.type, value: f.type, visible: (f as { visible?: boolean }).visible ?? true };
}

function inspectOne(
  node: SceneNode,
  includeLayoutTree: boolean,
  depth: number,
  maxDepth: number,
): FigmaNodeInspect {
  const base: FigmaNodeInspect = {
    id: node.id,
    name: node.name,
    type: node.type,
    visible: (node as { visible: boolean }).visible,
    position: {
      x: (node as { x: number }).x ?? 0,
      y: (node as { y: number }).y ?? 0,
      rotation: (node as { rotation: number }).rotation ?? 0,
    },
    size: {
      width: (node as { width: number }).width ?? 0,
      height: (node as { height: number }).height ?? 0,
    },
    opacity: (node as { opacity: number }).opacity ?? 1,
    parentId: (node.parent as { id: string } | null)?.id,
    componentId: (node as { mainComponent?: { id: string } | null }).mainComponent?.id,
  };
  if ("constraints" in node) {
    const c = (node as { constraints: { horizontal: ConstraintsReport["horizontal"]; vertical: ConstraintsReport["vertical"] } }).constraints;
    base.constraints = { horizontal: c.horizontal, vertical: c.vertical };
  }
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
    const f = node as FrameNode;
    base.layout = {
      mode: f.layoutMode,
      primaryAxisSizingMode: f.primaryAxisSizingMode,
      counterAxisSizingMode: f.counterAxisSizingMode,
      primaryAxisAlignItems: f.primaryAxisAlignItems,
      counterAxisAlignItems: f.counterAxisAlignItems,
      itemSpacing: f.itemSpacing,
      counterAxisSpacing: (f as FrameNode & { counterAxisSpacing?: number }).counterAxisSpacing,
      paddingTop: f.paddingTop,
      paddingRight: f.paddingRight,
      paddingBottom: f.paddingBottom,
      paddingLeft: f.paddingLeft,
    };
  }
  if (node.type === "TEXT") {
    const t = node as TextNode;
    base.typography = {
      family: (t.fontName as FontName).family,
      style: (t.fontName as FontName).style,
      size: (t.fontSize as number) ?? 16,
      lineHeight: (t.lineHeight as number) ?? 1.5,
      letterSpacing: (t.letterSpacing as number) ?? 0,
      paragraphSpacing: t.paragraphSpacing ?? 0,
      textAlignHorizontal: t.textAlignHorizontal,
      textAlignVertical: t.textAlignVertical,
    };
  }
  if ("fills" in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      base.fills = (fills as readonly Paint[]).map(fillToValue);
    } else {
      base.fills = [];
    }
  } else {
    base.fills = [];
  }
  if ("strokes" in node) {
    const strokes = (node as GeometryMixin).strokes;
    base.strokes = Array.isArray(strokes) ? (strokes as readonly Paint[]).map(fillToValue) : [];
  } else {
    base.strokes = [];
  }
  if ("effects" in node) {
    const eff = (node as BlendMixin).effects;
    base.effects = Array.isArray(eff) ? (eff as readonly Effect[]).map((e) => ({ type: e.type, visible: (e as { visible?: boolean }).visible ?? true })) : [];
  } else {
    base.effects = [];
  }
  if ("cornerRadius" in node) {
    base.cornerRadius = (node as { cornerRadius?: number }).cornerRadius ?? null;
  }
  if (includeLayoutTree && "children" in node && depth < maxDepth) {
    base.layoutTree = (node as ChildrenMixin).children.map((c) => inspectOne(c as SceneNode, true, depth + 1, maxDepth));
  }
  return base;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as FigmaInspectParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const includeLayoutTree = params.includeLayoutTree ?? true;
  const out: FigmaNodeInspect[] = [];
  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    out.push(inspectOne(node, includeLayoutTree, 0, 1));
  }
  return { type: request.type, requestId: request.requestId, data: out };
}
