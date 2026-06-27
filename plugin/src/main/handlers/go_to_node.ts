import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds?.[0];
  if (!nodeId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeId is required (pass in nodeIds array)" } };
  }
  let node: SceneNode;
  try {
    node = await resolveNode(nodeId);
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) } };
  }
  try {
    figma.currentPage.selection = [node];
  } catch (err) {
    return { type: request.type, requestId: request.requestId, error: { code: "OPERATION_FAILED", message: err instanceof Error ? err.message : String(err) } };
  }
  return { type: request.type, requestId: request.requestId, data: { nodeId, name: node.name, type: node.type, selected: true } };
}
