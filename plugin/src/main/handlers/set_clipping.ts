import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_clipping");
  }
  const clipsContent = request.params?.clipsContent;
  if (typeof clipsContent !== "boolean") {
    throw new Error("clipsContent (boolean) is required");
  }

  const node = await getSceneNodeById(nodeId);
  if (!("clipsContent" in node)) {
    throw new Error(`Node does not support clipsContent: ${nodeId}`);
  }
  node.clipsContent = clipsContent;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      clipsContent: node.clipsContent,
    },
  };
}
