import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, parseHexColor } from "../utils";
import { setStrokeSchema, validateParams } from "../schemas";
import { createError, PluginErrorCode } from "../errors";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = validateParams(setStrokeSchema, request.params ?? {});
  const node = await getSceneNodeById(params.nodeId);
  const applied: Record<string, unknown> = {};

  if (!("strokes" in node)) {
    throw createError(
      PluginErrorCode.UNSUPPORTED_OPERATION,
      `Node does not support strokes: ${params.nodeId}`,
    );
  }

  if (typeof params.strokeHex === "string") {
    const strokeOpacity = params.strokeOpacity ?? 1;
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
