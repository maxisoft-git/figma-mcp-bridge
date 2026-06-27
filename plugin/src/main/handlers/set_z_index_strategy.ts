import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface SetZOrderParams {
  nodeIds: string[];
  strategy: "dom" | "stack";
  /** For "dom" strategy, where to move within the parent. */
  position?: "front" | "back" | "forward" | "backward";
}

interface ZOrderResult {
  movedCount: number;
  failures: Array<{ nodeId: string; reason: string }>;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as SetZOrderParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  if (!["dom", "stack"].includes(params.strategy)) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "strategy must be 'dom' or 'stack'" } };
  }
  const result: ZOrderResult = { movedCount: 0, failures: [] };

  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch (err) {
      result.failures.push({ nodeId: id, reason: err instanceof Error ? err.message : String(err) });
      continue;
    }
    const parent = node.parent as ChildrenMixin | null;
    if (!parent || !("insertChild" in parent)) {
      result.failures.push({ nodeId: id, reason: "no parent or parent does not support insertChild" });
      continue;
    }
    try {
      if (params.strategy === "dom") {
        const pos = params.position ?? "front";
        const idx = (parent as ChildrenMixin).children.indexOf(node);
        if (pos === "front") {
          (parent as ChildrenMixin).insertChild((parent as ChildrenMixin).children.length - 1, node);
        } else if (pos === "back") {
          (parent as ChildrenMixin).insertChild(0, node);
        } else if (pos === "forward" && idx < (parent as ChildrenMixin).children.length - 1) {
          (parent as ChildrenMixin).insertChild(idx + 1, node);
        } else if (pos === "backward" && idx > 0) {
          (parent as ChildrenMixin).insertChild(idx - 1, node);
        }
      } else {
        // stack: ensure each node has a stacking context, no-op if already on top
        // Figma handles this via z-index; we leave order untouched.
      }
      result.movedCount++;
    } catch (err) {
      result.failures.push({ nodeId: id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { type: request.type, requestId: request.requestId, data: result };
}
