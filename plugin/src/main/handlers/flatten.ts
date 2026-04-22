import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length === 0) {
    throw new Error("nodeIds is required for flatten");
  }

  const results = [];
  for (const nodeId of request.nodeIds) {
    const node = await getSceneNodeById(nodeId);
    if (!("flatten" in node) || typeof node.flatten !== "function") {
      results.push({ nodeId, error: `Node does not support flatten: ${nodeId}` });
      continue;
    }
    const flattened = node.flatten();
    results.push({
      sourceNodeId: nodeId,
      nodeId: flattened.id,
      nodeName: flattened.name,
      type: flattened.type,
    });
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      flattenedCount: results.filter((r) => !("error" in r)).length,
      results,
    },
  };
}
