import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

interface GetConstraintsParams {
  nodeIds: string[];
}

interface ConstraintsReport {
  nodeId: string;
  name: string;
  type: string;
  horizontal: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER";
  vertical: "MIN" | "MAX" | "STRETCH" | "SCALE" | "CENTER";
  layoutGrow: number;
  layoutAlign: "INHERIT" | "STRETCH" | "MIN" | "CENTER" | "MAX";
}

function extractConstraints(n: SceneNode): ConstraintsReport | null {
  if (!("constraints" in n)) return null;
  const c = (n as { constraints: { horizontal: ConstraintsReport["horizontal"]; vertical: ConstraintsReport["vertical"] } }).constraints;
  const layoutGrow = (n as { layoutGrow?: number }).layoutGrow ?? 0;
  const layoutAlign = (n as { layoutAlign?: ConstraintsReport["layoutAlign"] }).layoutAlign ?? "INHERIT";
  return {
    nodeId: n.id,
    name: n.name,
    type: n.type,
    horizontal: c.horizontal,
    vertical: c.vertical,
    layoutGrow,
    layoutAlign,
  };
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as GetConstraintsParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const out: ConstraintsReport[] = [];
  for (const id of params.nodeIds) {
    let n: SceneNode;
    try {
      n = await resolveNode(id);
    } catch (err) {
      return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
    }
    const c = extractConstraints(n);
    if (c) out.push(c);
  }
  return { type: request.type, requestId: request.requestId, data: out };
}
