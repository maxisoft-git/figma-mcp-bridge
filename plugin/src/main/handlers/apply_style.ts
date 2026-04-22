import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  const styleId = request.params?.styleId;
  const styleType = request.params?.styleType;

  if (!nodeId) {
    throw new Error("nodeIds is required for apply_style");
  }
  if (typeof styleId !== "string") {
    throw new Error("styleId is required for apply_style");
  }

  const node = await getSceneNodeById(nodeId);

  switch (styleType) {
    case "paint": {
      if (!("fillStyleId" in node)) {
        throw new Error(`Node does not support paint styles: ${nodeId}`);
      }
      node.fillStyleId = styleId;
      break;
    }
    case "text": {
      if (!("textStyleId" in node)) {
        throw new Error(`Node does not support text styles: ${nodeId}`);
      }
      node.textStyleId = styleId;
      break;
    }
    case "effect": {
      if (!("effectStyleId" in node)) {
        throw new Error(`Node does not support effect styles: ${nodeId}`);
      }
      node.effectStyleId = styleId;
      break;
    }
    case "grid": {
      if (!("gridStyleId" in node)) {
        throw new Error(`Node does not support grid styles: ${nodeId}`);
      }
      node.gridStyleId = styleId;
      break;
    }
    default:
      throw new Error("styleType is required: paint, text, effect, or grid");
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      styleId,
      styleType,
    },
  };
}
