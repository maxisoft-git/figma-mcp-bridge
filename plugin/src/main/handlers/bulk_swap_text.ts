import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface SwapTextParams {
  nodeIds: string[];
  /** Find substring. */
  find: string;
  /** Replace with. */
  replace: string;
  /** Use RegEx (default false). */
  regex?: boolean;
  /** Case-insensitive (default true). */
  caseInsensitive?: boolean;
  /** When true, only count matches (default false). */
  dryRun?: boolean;
}

interface SwapTextResult {
  matchedCount: number;
  replacedCount: number;
  samples: Array<{ nodeId: string; from: string; to: string }>;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as SwapTextParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  if (typeof params.find !== "string") {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "find is required" } };
  }
  if (typeof params.replace !== "string") {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "replace is required" } };
  }
  const useRegex = params.regex ?? false;
  const ci = params.caseInsensitive ?? true;
  const flags = ci ? "gi" : "g";
  let re: RegExp;
  try {
    re = useRegex ? new RegExp(params.find, flags) : new RegExp(escapeRegExp(params.find), flags);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: `Invalid RegEx: ${err instanceof Error ? err.message : String(err)}` } };
  }
  const dryRun = params.dryRun ?? false;
  const result: SwapTextResult = { matchedCount: 0, replacedCount: 0, samples: [] };
  const rewalk = (text: string): { replaced: string; changed: boolean; matches: number } => {
    let matches = 0;
    const replaced = text.replace(re, () => { matches++; return params.replace; });
    return { replaced, changed: matches > 0 && replaced !== text, matches };
  };

  for (const id of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(id);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    const walk = (n: SceneNode) => {
      if (n.type === "TEXT") {
        const t = n as TextNode;
        const before = t.characters;
        const { replaced, changed, matches } = rewalk(before);
        result.matchedCount += matches;
        if (changed) {
          if (result.samples.length < 50) result.samples.push({ nodeId: n.id, from: before.slice(0, 60) + (before.length > 60 ? "..." : ""), to: replaced.slice(0, 60) + (replaced.length > 60 ? "..." : "") });
          if (!dryRun) {
            try {
              t.characters = replaced;
              result.replacedCount += matches;
            } catch {
              // ignore
            }
          } else {
            result.replacedCount += matches;
          }
        }
      }
      if ("children" in n) {
        for (const c of (n as ChildrenMixin).children) walk(c as SceneNode);
      }
    };
    walk(node);
  }
  return { type: request.type, requestId: request.requestId, data: { ...result, dryRun } };
}
