import type { ServerRequest, PluginResponse } from "../types";
import {
  getSceneNodeById,
  setSolidFill,
  positionNode,
  resizeNodeIfSupported,
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

  if (typeof params.name === "string") {
    node.name = params.name;
    applied.name = node.name;
  }

  if (typeof params.visible === "boolean") {
    node.visible = params.visible;
    applied.visible = node.visible;
  }

  if (typeof params.x === "number" || typeof params.y === "number") {
    if (!("x" in node) || !("y" in node)) {
      throw new Error(`Node does not support x/y positioning: ${node.id}`);
    }
    positionNode(node, params.x, params.y);
    applied.x = node.x;
    applied.y = node.y;
  }

  if (typeof params.width === "number" || typeof params.height === "number") {
    resizeNodeIfSupported(node, params.width, params.height);
    applied.width = node.width;
    applied.height = node.height;
  }

  if (typeof params.rotation === "number") {
    if (!("rotation" in node)) {
      throw new Error(`Node does not support rotation: ${node.id}`);
    }
    node.rotation = params.rotation;
    applied.rotation = node.rotation;
  }

  if (typeof params.opacity === "number") {
    if (!("opacity" in node)) {
      throw new Error(`Node does not support opacity: ${node.id}`);
    }
    node.opacity = params.opacity;
    applied.opacity = node.opacity;
  }

  if (typeof params.cornerRadius === "number") {
    if (!("cornerRadius" in node)) {
      throw new Error(`Node does not support cornerRadius: ${node.id}`);
    }
    node.cornerRadius = params.cornerRadius;
    applied.cornerRadius = node.cornerRadius;
  }

  if (params.solidFillOpacity !== undefined && params.solidFillHex === undefined) {
    throw new Error("solidFillHex is required when solidFillOpacity is provided");
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
