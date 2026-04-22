import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, enrichWithImageData } from "../serializer";
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
  const includeImageData = request.params?.includeImageData === true;
  let data = serializeNode(node as SceneNode, { includeHidden });
  if (includeImageData) {
    data = await enrichWithImageData(data);
  }
  return {
    type: request.type,
    requestId: request.requestId,
    data,
  };
}