import type { ServerRequest, PluginResponse } from "../types";
import { validationError } from "../errors";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw validationError("nodeId is required for get_image");
  }

  const format =
    request.params?.format === "SVG" ||
    request.params?.format === "JPG"
      ? request.params.format
      : "PNG";
  const scale =
    typeof request.params?.scale === "number" ? request.params.scale : 1;
  const backgroundOnly = request.params?.backgroundOnly === true;

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
    throw new Error(`Node not found: ${nodeId}`);
  }

  const exportSettings: ExportSettings =
    format === "SVG"
      ? { format: "SVG" }
      : format === "JPG"
        ? { format: "JPG", constraint: { type: "SCALE", value: scale } }
        : { format: "PNG", constraint: { type: "SCALE", value: scale } };

  let base64: string;
  if (backgroundOnly && "children" in node && node.children.length > 0) {
    const savedVisibility: boolean[] = [];
    for (const child of node.children) {
      savedVisibility.push(child.visible !== false);
      child.visible = false;
    }
    try {
      const bytes = await node.exportAsync(exportSettings);
      base64 = figma.base64Encode(bytes);
    } finally {
      for (let i = 0; i < node.children.length; i++) {
        node.children[i].visible = savedVisibility[i];
      }
    }
  } else {
    const bytes = await node.exportAsync(exportSettings);
    base64 = figma.base64Encode(bytes);
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      format,
      scale,
      base64,
      width: node.width,
      height: node.height,
    },
  };
}