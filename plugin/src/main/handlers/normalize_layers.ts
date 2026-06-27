import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface NormalizeLayersParams {
  nodeIds: string[];
  /** Rename "Frame 234" → "Frame" (default true). */
  renameAnonymous?: boolean;
  /** Flatten single-child frame wrappers (default true). */
  flattenRedundant?: boolean;
  dryRun?: boolean;
}

interface NormalizeResult {
  renamedCount: number;
  flattenedCount: number;
  samples: Array<{ nodeId: string; action: string; from: string; to: string }>;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as NormalizeLayersParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeIds is required" },
    };
  }
  const renameAnonymous = params.renameAnonymous ?? true;
  const flattenRedundant = params.flattenRedundant ?? true;
  const dryRun = params.dryRun ?? false;

  const result: NormalizeResult = { renamedCount: 0, flattenedCount: 0, samples: [] };

  for (const nodeId of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(nodeId);
    } catch (err) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
      };
    }
    walk(node, (n) => {
      if (renameAnonymous) {
        if (/^Frame \d+$|^Rectangle \d+$|^Group \d+$|^Vector \d+$/.test(n.name)) {
          const before = n.name;
          const after = n.type.charAt(0) + n.type.slice(1).toLowerCase();
          if (before !== after) {
            if (!dryRun) n.name = after;
            result.renamedCount++;
            if (result.samples.length < 30) {
              result.samples.push({ nodeId: n.id, action: "rename", from: before, to: after });
            }
          }
        }
      }
      if (flattenRedundant) {
        if ("children" in n && (n as ChildrenMixin).children.length === 1) {
          const only = (n as ChildrenMixin).children[0]!;
          // Don't flatten if the single child carries auto-layout we must keep
          // on the outer frame, or if the outer is a component / instance.
          if (n.type !== "COMPONENT" && n.type !== "INSTANCE" && only.type !== "COMPONENT" && only.type !== "INSTANCE") {
            const before = n.name;
            try {
              if (!dryRun) {
                const parent = n.parent;
                if (parent) {
                  const idx = (parent as ChildrenMixin).children.indexOf(n);
                  only.name = before;
                  parent.insertChild(idx, only);
                  n.remove();
                }
              }
              result.flattenedCount++;
              if (result.samples.length < 30) {
                result.samples.push({ nodeId: only.id, action: "flatten", from: before, to: only.name });
              }
            } catch {
              // ignore flattening failures (locked parents, etc.)
            }
          }
        }
      }
    });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { ...result, dryRun },
  };
}

function walk(node: SceneNode, visit: (n: SceneNode) => void): void {
  visit(node);
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) {
      walk(c as SceneNode, visit);
    }
  }
}
