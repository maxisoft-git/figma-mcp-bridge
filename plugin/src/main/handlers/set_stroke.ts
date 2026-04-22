import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, parseHexColor } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_stroke");
  }

  const node = await getSceneNodeById(nodeId);
  const params = request.params ?? {};
  const applied: Record<string, unknown> = {};

  if (!("strokes" in node)) {
    throw new Error(`Node does not support strokes: ${nodeId}`);
  }

  if (typeof params.strokeHex === "string") {
    const strokeOpacity = typeof params.strokeOpacity === "number" ? params.strokeOpacity : 1;
    node.strokes = [
      {
        type: "SOLID",
        color: parseHexColor(params.strokeHex),
        opacity: strokeOpacity,
      },
    ];
    applied.strokeHex = params.strokeHex;
    applied.strokeOpacity = strokeOpacity;
  }

  if (typeof params.strokeWeight === "number" && "strokeWeight" in node) {
    node.strokeWeight = params.strokeWeight;
    applied.strokeWeight = node.strokeWeight;
  }

  if (typeof params.strokeAlign === "string" && "strokeAlign" in node) {
    node.strokeAlign = params.strokeAlign as "INSIDE" | "OUTSIDE" | "CENTER";
    applied.strokeAlign = node.strokeAlign;
  }

  if (Array.isArray(params.dashPattern) && "dashPattern" in node) {
    node.dashPattern = params.dashPattern as number[];
    applied.dashPattern = node.dashPattern;
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
