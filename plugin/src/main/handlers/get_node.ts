import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode } from "../serializer";
import { nodeNotFound, validationError } from "../errors";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw validationError("nodeIds is required for get_node");
  }
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === "DOCUMENT") {
    throw nodeNotFound(nodeId);
  }
  const includeHidden = request.params?.includeHidden === true;
  return {
    type: request.type,
    requestId: request.requestId,
    data: serializeNode(node as SceneNode, { includeHidden }),
  };
}
