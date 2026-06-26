import type { ServerRequest, PluginResponse } from "../types";
import { validationError } from "../errors";
import { exportWithHiddenChildren } from "../utils";

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
  if (!("exportAsync" in node)) {
    throw new Error(`Node does not support export: ${nodeId}`);
  }
  const exportable = node as SceneNode & { exportAsync: (s: ExportSettings) => Promise<Uint8Array> };

  const exportSettings: ExportSettings =
    format === "SVG"
      ? { format: "SVG" }
      : format === "JPG"
        ? { format: "JPG", constraint: { type: "SCALE", value: scale } }
        : { format: "PNG", constraint: { type: "SCALE", value: scale } };

  const bytes = backgroundOnly
    ? await exportWithHiddenChildren(exportable, exportSettings, (s) =>
        exportable.exportAsync(s),
      )
    : await exportable.exportAsync(exportSettings);

  const base64 = figma.base64Encode(bytes);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      format,
      scale,
      base64,
      width: "width" in node ? (node.width as number) : 0,
      height: "height" in node ? (node.height as number) : 0,
    },
  };
}
