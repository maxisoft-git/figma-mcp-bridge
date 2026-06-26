import type { ServerRequest, PluginResponse } from "../types";
import {
  applyProps,
  getSceneNodeById,
  numericProp,
  booleanProp,
  stringProp,
  resizeNodeIfSupported,
  setSolidFill,
} from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_node_properties");
  }

  const node = await getSceneNodeById(nodeId);
  const params = request.params ?? {};
  const applied: Record<string, unknown> = {};
  const hasUpdates = Object.keys(params).length > 0;

  if (!hasUpdates) {
    throw new Error("At least one property is required for set_node_properties");
  }

  if (params.solidFillOpacity !== undefined && params.solidFillHex === undefined) {
    throw new Error("solidFillHex is required when solidFillOpacity is provided");
  }

  applyProps(node, params, [
    stringProp("name"),
    booleanProp("visible"),
    numericProp("x"),
    numericProp("y"),
    numericProp("rotation"),
    numericProp("opacity"),
    numericProp("cornerRadius"),
    booleanProp("verticalTrim"),
    booleanProp("horizontalTrim"),
  ], applied);

  if (typeof params.width === "number" || typeof params.height === "number") {
    resizeNodeIfSupported(node, params.width, params.height);
    applied.width = node.width;
    applied.height = node.height;
  }

  if (typeof params.solidFillHex === "string") {
    const fillOpacity =
      typeof params.solidFillOpacity === "number"
        ? params.solidFillOpacity
        : undefined;
    setSolidFill(node, params.solidFillHex, fillOpacity);
    applied.solidFillHex = params.solidFillHex;
    applied.solidFillOpacity = fillOpacity ?? 1;
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      applied,
    },
  };
}
