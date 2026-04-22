import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_constraints");
  }
  const params = request.params ?? {};
  const node = await getSceneNodeById(nodeId);

  if (!("constraints" in node)) {
    throw new Error(`Node does not support constraints: ${nodeId}`);
  }

  if (typeof params.horizontal === "string") {
    node.constraints = {
      ...node.constraints,
      horizontal: params.horizontal as "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE",
    };
  }
  if (typeof params.vertical === "string") {
    node.constraints = {
      ...node.constraints,
      vertical: params.vertical as "MIN" | "CENTER" | "MAX" | "STRETCH" | "SCALE",
    };
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      constraints: node.constraints,
    },
  };
}
