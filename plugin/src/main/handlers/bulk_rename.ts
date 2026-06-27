import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface BulkRenameParams {
  nodeIds?: string[];
  /** RegEx pattern (string) applied to node.name. */
  pattern: string;
  /** Replacement string. May contain $1, $2, … for capture groups. */
  replacement: string;
  /** Only nodes whose name matches the pattern. Default true. */
  matchOnly?: boolean;
  /** "all" (default) walks whole subtree; "children" stops at the first level. */
  scope?: "all" | "children";
  /** When true (default false) do not write — just count matches. */
  dryRun?: boolean;
}

interface RenameResult {
  matched: number;
  renamed: number;
  samples: Array<{ nodeId: string; from: string; to: string }>;
}

function safeCompileRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as BulkRenameParams;
  if (typeof params.pattern !== "string" || params.pattern.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "pattern is required and must be a non-empty string" },
    };
  }
  if (typeof params.replacement !== "string") {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "replacement is required" },
    };
  }
  const re = safeCompileRegex(params.pattern);
  if (!re) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: `Invalid RegEx: ${params.pattern}` },
    };
  }
  const matchOnly = params.matchOnly ?? true;
  const scope = params.scope ?? "all";
  const dryRun = params.dryRun ?? false;
  const nodeIds = params.nodeIds ?? [];

  if (nodeIds.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeIds is required (at least one node)" },
    };
  }

  const result: RenameResult = { matched: 0, renamed: 0, samples: [] };

  for (const nodeId of nodeIds) {
    let root: SceneNode;
    try {
      root = await resolveNode(nodeId);
    } catch (err) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
      };
    }
    const stack: SceneNode[] = [root];
    if (scope === "children") {
      stack.length = 0;
      if ("children" in root) {
        for (const c of (root as ChildrenMixin).children) stack.push(c as SceneNode);
      }
    }
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (scope === "all" && "children" in node) {
        for (const c of (root === node && scope === "all" ? (root as ChildrenMixin).children : (node as ChildrenMixin).children)) {
          stack.push(c as SceneNode);
        }
      }
      const isMatch = re.test(node.name);
      re.lastIndex = 0;
      if (isMatch) {
        result.matched++;
        const newName = node.name.replace(re, params.replacement);
        if (newName !== node.name) {
          if (result.samples.length < 20) {
            result.samples.push({ nodeId: node.id, from: node.name, to: newName });
          }
          if (!dryRun && !matchOnly) {
            try {
              node.name = newName;
              result.renamed++;
            } catch {
              // rename may fail for locked nodes — skip
            }
          } else if (dryRun && !matchOnly) {
            // count only
            result.renamed++;
          }
        }
      }
      // recurse into children for "all" scope
      if (scope === "all" && "children" in node) {
        for (const c of (node as ChildrenMixin).children) stack.push(c as SceneNode);
      }
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { ...result, dryRun },
  };
}
