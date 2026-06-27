import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface VisualizeParams {
  nodeId: string;
  /** Recurse into children. Default true. */
  recurse?: boolean;
  /** Max depth. Default 3. */
  maxDepth?: number;
}

function summarize(n: SceneNode, maxW: number): string {
  const w = (n as { width?: number }).width ?? 0;
  const h = (n as { height?: number }).height ?? 0;
  if (n.type === "TEXT") {
    const t = (n as TextNode).characters ?? "";
    return `"${t.length > 30 ? t.slice(0, 27) + "..." : t}"`;
  }
  if (n.type === "RECTANGLE" || n.type === "ELLIPSE") {
    return `▮${w.toFixed(0)}×${h.toFixed(0)}`;
  }
  if (n.type === "FRAME" || n.type === "COMPONENT" || n.type === "INSTANCE") {
    return `▤${w.toFixed(0)}×${h.toFixed(0)}`;
  }
  if (n.type === "GROUP") return "Group";
  if (n.type === "VECTOR") return "Vect";
  return n.type;
}

function renderTree(node: SceneNode, depth: number, maxDepth: number, prefix: string, isLast: boolean, parentMode: "VERTICAL" | "HORIZONTAL" | null): string {
  if (depth > maxDepth) return "";
  const connector = isLast ? "└─ " : "├─ ";
  const isFrame = node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
  const mode = isFrame ? (node as FrameNode).layoutMode : null;
  const label = `${prefix}${connector}${node.name || "(unnamed)"}  [${summarize(node, 20)}]`;
  let out = label;
  if (isFrame && mode === "HORIZONTAL" && depth < maxDepth && "children" in node) {
    const children = (node as ChildrenMixin).children as SceneNode[];
    if (children.length > 0) {
      const sub = isLast ? "    " : "│   ";
      children.forEach((c, i) => {
        const last = i === children.length - 1;
        out += "\n" + renderTree(c, depth + 1, maxDepth, prefix + sub, last, "HORIZONTAL");
      });
    }
  } else if (isFrame && mode === "VERTICAL" && depth < maxDepth && "children" in node) {
    const children = (node as ChildrenMixin).children as SceneNode[];
    if (children.length > 0) {
      const sub = isLast ? "    " : "│   ";
      children.forEach((c, i) => {
        const last = i === children.length - 1;
        out += "\n" + renderTree(c, depth + 1, maxDepth, prefix + sub, last, "VERTICAL");
      });
    }
  } else if (depth < maxDepth && "children" in node) {
    const children = (node as ChildrenMixin).children as SceneNode[];
    if (children.length > 0) {
      const sub = isLast ? "    " : "│   ";
      children.forEach((c, i) => {
        const last = i === children.length - 1;
        out += "\n" + renderTree(c, depth + 1, maxDepth, prefix + sub, last, null);
      });
    }
  }
  return out;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as VisualizeParams;
  if (!params.nodeId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeId is required" } };
  }
  let node: SceneNode;
  try {
    node = await resolveNode(params.nodeId);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }
  const maxDepth = params.maxDepth ?? 3;
  const recurse = params.recurse ?? true;
  const tree = renderTree(node, 0, recurse ? maxDepth : 0, "", true, null);
  return { type: request.type, requestId: request.requestId, data: { nodeId: node.id, tree, depth: maxDepth } };
}
