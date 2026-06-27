import type { ServerRequest, PluginResponse } from "../types";

interface FindByVariableParams {
  /** Variable id or variable name. */
  variable: string;
  /** When false, don't recurse the entire file (just current page). Default true. */
  global?: boolean;
  /** Limit number of results. Default 500. */
  limit?: number;
}

interface Usage {
  nodeId: string;
  name: string;
  type: string;
  boundOn: string;
  value: unknown;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as FindByVariableParams;
  if (typeof params.variable !== "string" || params.variable.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "variable is required (id or name)" } };
  }
  const limit = params.limit ?? 500;
  const all = await figma.variables.getLocalVariablesAsync();
  const target = all.find((v) => v.id === params.variable || v.name === params.variable);
  if (!target) {
    return { type: request.type, requestId: request.requestId, error: { code: "NOT_FOUND", message: `Variable not found: ${params.variable}` } };
  }
  const global = params.global ?? true;
  const roots = global ? (figma.root.children as SceneNode[]) : [figma.currentPage as unknown as SceneNode];
  const usages: Usage[] = [];
  walk(roots, target.id, target.resolvedType, usages, limit);
  return { type: request.type, requestId: request.requestId, data: { variable: { id: target.id, name: target.name, type: target.resolvedType }, count: usages.length, usages } };
}

function walk(roots: SceneNode[], variableId: string, varType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN", out: Usage[], limit: number): void {
  for (const root of roots) {
    walkNode(root, variableId, varType, out, limit);
    if (out.length >= limit) return;
  }
}

function walkNode(node: SceneNode, variableId: string, varType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN", out: Usage[], limit: number): void {
  if (out.length >= limit) return;
  // Check if the node binds to the target variable
  const usages = findBoundUsage(node, variableId, varType);
  for (const u of usages) out.push(u);
  if ("children" in node) {
    for (const c of (node as ChildrenMixin).children) walkNode(c as SceneNode, variableId, varType, out, limit);
  }
}

function findBoundUsage(node: SceneNode, variableId: string, _varType: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN"): Usage[] {
  const out: Usage[] = [];
  // Check boundVariables on the node
  if ("boundVariables" in node) {
    const bv = (node as { boundVariables: Record<string, { id: string } | undefined> }).boundVariables;
    for (const [field, v] of Object.entries(bv)) {
      if (v?.id === variableId) {
        out.push({
          nodeId: node.id,
          name: node.name,
          type: node.type,
          boundOn: field,
          value: (node as unknown as Record<string, unknown>)[field],
        });
      }
    }
  }
  // Check fills
  if ("fills" in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (let i = 0; i < fills.length; i++) {
        const f = fills[i]!;
        const bv = (f as { boundVariables?: { color?: { id: string } } }).boundVariables;
        if (bv?.color?.id === variableId) {
          out.push({
            nodeId: node.id,
            name: node.name,
            type: node.type,
            boundOn: `fills[${i}].color`,
            value: (f as { color?: unknown }).color,
          });
        }
      }
    }
  }
  // Check effectStyleId
  if ("effectStyleId" in node) {
    const eid = (node as { effectStyleId?: string }).effectStyleId;
    if (eid === variableId) {
      out.push({ nodeId: node.id, name: node.name, type: node.type, boundOn: "effectStyleId", value: eid });
    }
  }
  // Check textStyleId
  if ("textStyleId" in node) {
    const tid = (node as { textStyleId?: string }).textStyleId;
    if (tid === variableId) {
      out.push({ nodeId: node.id, name: node.name, type: node.type, boundOn: "textStyleId", value: tid });
    }
  }
  return out;
}
