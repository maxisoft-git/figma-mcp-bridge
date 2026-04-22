import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

const VALID_BLEND_MODES = [
  "PASS_THROUGH", "NORMAL", "DARKEN", "MULTIPLY", "LINEAR_BURN", "COLOR_BURN",
  "LIGHTEN", "SCREEN", "LINEAR_DODGE", "COLOR_DODGE", "OVERLAY", "SOFT_LIGHT",
  "HARD_LIGHT", "DIFFERENCE", "EXCLUSION", "HUE", "SATURATION", "COLOR", "LUMINOSITY",
];

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_blend_mode");
  }
  const blendMode = request.params?.blendMode;
  if (typeof blendMode !== "string" || !VALID_BLEND_MODES.includes(blendMode)) {
    throw new Error(`blendMode is required. Valid: ${VALID_BLEND_MODES.join(", ")}`);
  }

  const node = await getSceneNodeById(nodeId);
  if (!("blendMode" in node)) {
    throw new Error(`Node does not support blendMode: ${nodeId}`);
  }
  node.blendMode = blendMode as BlendMode;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      blendMode: node.blendMode,
    },
  };
}
