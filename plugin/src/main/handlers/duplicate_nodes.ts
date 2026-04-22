import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length === 0) {
    throw new Error("nodeIds is required for duplicate_nodes");
  }

  const duplicates = [];
  for (const nodeId of request.nodeIds) {
    const node = await getSceneNodeById(nodeId);
    if (!("clone" in node) || typeof node.clone !== "function") {
      throw new Error(`Node does not support duplication: ${node.id}`);
    }
    const clone = node.clone();
    duplicates.push({
      sourceNodeId: node.id,
      nodeId: clone.id,
      nodeName: clone.name,
      parentId: clone.parent?.id,
    });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      duplicatedCount: duplicates.length,
      duplicates,
    },
  };
}
