import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, getParentNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length === 0) {
    throw new Error("nodeIds is required for reparent_nodes");
  }
  const parentId = request.params?.parentId;
  if (typeof parentId !== "string") {
    throw new Error("parentId is required for reparent_nodes");
  }

  const parent = await getParentNodeById(parentId);
  const moved = [];

  for (const nodeId of request.nodeIds) {
    const node = await getSceneNodeById(nodeId);
    parent.appendChild(node);
    moved.push({
      nodeId: node.id,
      nodeName: node.name,
      parentId: node.parent?.id,
    });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      movedCount: moved.length,
      moved,
    },
  };
}
