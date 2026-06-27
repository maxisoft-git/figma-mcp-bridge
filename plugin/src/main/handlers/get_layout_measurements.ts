import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface LayoutMeasurementsParams {
  nodeId: string;
  /** Recurse into children. Default true. */
  recurse?: boolean;
  /** Max depth (default 4). */
  maxDepth?: number;
}

interface FrameMeasurements {
  name: string;
  type: string;
  width: number;
  height: number;
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  itemSpacing?: number;
  counterAxisSpacing?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "BASELINE";
  layoutGrow?: number;
  layoutAlign?: "INHERIT" | "STRETCH" | "MIN" | "CENTER" | "MAX";
  layoutPositioning?: "AUTO" | "ABSOLUTE";
  children?: FrameMeasurements[];
  warnings?: string[];
}

function measureNode(node: SceneNode, depth: number, maxDepth: number): FrameMeasurements {
  const m: FrameMeasurements = {
    name: node.name,
    type: node.type,
    width: (node as { width: number }).width ?? 0,
    height: (node as { height: number }).height ?? 0,
  };
  const warnings: string[] = [];
  if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
    const f = node as FrameNode;
    m.layoutMode = f.layoutMode;
    m.primaryAxisSizingMode = f.primaryAxisSizingMode;
    m.counterAxisSizingMode = f.counterAxisSizingMode;
    m.primaryAxisAlignItems = f.primaryAxisAlignItems;
    m.counterAxisAlignItems = f.counterAxisAlignItems;
    m.itemSpacing = f.itemSpacing;
    m.counterAxisSpacing = (f as FrameNode & { counterAxisSpacing?: number }).counterAxisSpacing;
    m.paddingTop = f.paddingTop;
    m.paddingRight = f.paddingRight;
    m.paddingBottom = f.paddingBottom;
    m.paddingLeft = f.paddingLeft;
    m.layoutGrow = (f as FrameNode & { layoutGrow?: number }).layoutGrow ?? 0;
    m.layoutAlign = (f as FrameNode & { layoutAlign?: "INHERIT" | "STRETCH" | "MIN" | "CENTER" | "MAX" }).layoutAlign ?? "INHERIT";
    m.layoutPositioning = (f as FrameNode & { layoutPositioning?: "AUTO" | "ABSOLUTE" }).layoutPositioning ?? "AUTO";
    if (depth < maxDepth) {
      m.children = (f.children as SceneNode[]).map((c) => measureNode(c, depth + 1, maxDepth));
      // Overflow warning: child bigger than parent
      for (const c of f.children as SceneNode[]) {
        const cw = (c as { width: number }).width ?? 0;
        const ch = (c as { height: number }).height ?? 0;
        if (cw > f.width) warnings.push(`Child "${c.name}" width ${cw} > parent ${f.width}`);
        if (ch > f.height) warnings.push(`Child "${c.name}" height ${ch} > parent ${f.height}`);
      }
    }
  } else {
    if (depth < maxDepth && "children" in node) {
      m.children = (node as ChildrenMixin).children.map((c) => measureNode(c as SceneNode, depth + 1, maxDepth));
    }
  }
  if (warnings.length > 0) m.warnings = warnings;
  return m;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as LayoutMeasurementsParams;
  if (!params.nodeId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeId is required" } };
  }
  let node: SceneNode;
  try {
    node = await resolveNode(params.nodeId);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }
  const recurse = params.recurse ?? true;
  const maxDepth = params.maxDepth ?? 4;
  const root = measureNode(node, 0, recurse ? maxDepth : 0);
  return { type: request.type, requestId: request.requestId, data: root };
}
