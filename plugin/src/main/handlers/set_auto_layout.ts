import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_auto_layout");
  }

  const node = await getSceneNodeById(nodeId) as FrameNode;
  const params = request.params ?? {};
  const applied: Record<string, unknown> = {};

  if (!("layoutMode" in node)) {
    throw new Error(`Node does not support auto-layout: ${nodeId}`);
  }

  if (params.layoutMode === "NONE" || params.layoutMode === "HORIZONTAL" || params.layoutMode === "VERTICAL") {
    node.layoutMode = params.layoutMode as "NONE" | "HORIZONTAL" | "VERTICAL";
    applied.layoutMode = node.layoutMode;
  }

  if (typeof params.itemSpacing === "number" && "itemSpacing" in node) {
    node.itemSpacing = params.itemSpacing;
    applied.itemSpacing = node.itemSpacing;
  }

  if (typeof params.primaryAxisAlignItems === "string" && "primaryAxisAlignItems" in node) {
    node.primaryAxisAlignItems = params.primaryAxisAlignItems as "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
    applied.primaryAxisAlignItems = node.primaryAxisAlignItems;
  }

  if (typeof params.counterAxisAlignItems === "string" && "counterAxisAlignItems" in node) {
    node.counterAxisAlignItems = params.counterAxisAlignItems as "MIN" | "CENTER" | "MAX" | "BASELINE";
    applied.counterAxisAlignItems = node.counterAxisAlignItems;
  }

  if (typeof params.primaryAxisSizingMode === "string" && "primaryAxisSizingMode" in node) {
    node.primaryAxisSizingMode = params.primaryAxisSizingMode as "FIXED" | "AUTO";
    applied.primaryAxisSizingMode = node.primaryAxisSizingMode;
  }

  if (typeof params.counterAxisSizingMode === "string" && "counterAxisSizingMode" in node) {
    node.counterAxisSizingMode = params.counterAxisSizingMode as "FIXED" | "AUTO";
    applied.counterAxisSizingMode = node.counterAxisSizingMode;
  }

  if (typeof params.paddingLeft === "number" && "paddingLeft" in node) {
    node.paddingLeft = params.paddingLeft;
    applied.paddingLeft = node.paddingLeft;
  }
  if (typeof params.paddingRight === "number" && "paddingRight" in node) {
    node.paddingRight = params.paddingRight;
    applied.paddingRight = node.paddingRight;
  }
  if (typeof params.paddingTop === "number" && "paddingTop" in node) {
    node.paddingTop = params.paddingTop;
    applied.paddingTop = node.paddingTop;
  }
  if (typeof params.paddingBottom === "number" && "paddingBottom" in node) {
    node.paddingBottom = params.paddingBottom;
    applied.paddingBottom = node.paddingBottom;
  }

  if (typeof params.layoutWrap === "string" && "layoutWrap" in node) {
    node.layoutWrap = params.layoutWrap as "NO_WRAP" | "WRAP";
    applied.layoutWrap = node.layoutWrap;
  }

  if (typeof params.counterAxisSpacing === "number" && "counterAxisSpacing" in node) {
    node.counterAxisSpacing = params.counterAxisSpacing;
    applied.counterAxisSpacing = node.counterAxisSpacing;
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
