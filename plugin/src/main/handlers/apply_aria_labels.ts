import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface ApplyAriaParams {
  nodeIds: string[];
  /** "auto" generates from text content; "from-name" uses the node's name; "clear" empties all labels. */
  mode?: "auto" | "from-name" | "clear";
  /** Optional override map: { "<node-name>": "<aria-label>" }. */
  overrides?: Record<string, string>;
  dryRun?: boolean;
}

interface AriaResult {
  labeledCount: number;
  skippedCount: number;
  changes: Array<{ nodeId: string; from: string; to: string }>;
}

const INTERACTIVE_TYPES = new Set([
  "FRAME", "COMPONENT", "INSTANCE", "RECTANGLE", "ELLIPSE", "POLYGON", "STAR", "VECTOR", "TEXT", "BOOLEAN_OPERATION",
]);

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ApplyAriaParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const mode = params.mode ?? "auto";
  const dryRun = params.dryRun ?? false;
  const result: AriaResult = { labeledCount: 0, skippedCount: 0, changes: [] };

  for (const nodeId of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(nodeId);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    walkInteractive(node, (n) => {
      const override = params.overrides?.[n.name];
      const newLabel = mode === "clear"
        ? ""
        : override
        ? override
        : mode === "from-name"
          ? n.name
          : defaultLabel(n);
      if (!newLabel) {
        result.skippedCount++;
        return;
      }
      const before = readName(n);
      if (before === newLabel) {
        result.skippedCount++;
        return;
      }
      if (!dryRun) {
        try {
          writeName(n, newLabel);
          result.labeledCount++;
          if (result.changes.length < 50) {
            result.changes.push({ nodeId: n.id, from: before, to: newLabel });
          }
        } catch {
          result.skippedCount++;
        }
      } else {
        result.labeledCount++;
        if (result.changes.length < 50) {
          result.changes.push({ nodeId: n.id, from: before, to: newLabel });
        }
      }
    });
  }
  return { type: request.type, requestId: request.requestId, data: { ...result, dryRun } };
}

function defaultLabel(n: SceneNode): string {
  if (n.type === "TEXT") return (n as TextNode).characters || n.name;
  return n.name;
}

function readName(n: SceneNode): string {
  // Figma has no separate "aria-label"; we use the node's name as proxy.
  return n.name;
}

function writeName(n: SceneNode, value: string): void {
  n.name = value;
}

function walkInteractive(node: SceneNode, visit: (n: SceneNode) => void): void {
  if (INTERACTIVE_TYPES.has(node.type)) visit(node);
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) walkInteractive(c as SceneNode, visit);
  }
}
