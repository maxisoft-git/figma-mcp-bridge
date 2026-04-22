import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const format =
    request.params?.format === "SVG" ||
    request.params?.format === "PDF" ||
    request.params?.format === "JPG" ||
    request.params?.format === "PNG"
      ? request.params.format
      : "PNG";
  const scale =
    typeof request.params?.scale === "number" ? request.params.scale : 2;

  let targetNodes: SceneNode[];
  if (request.nodeIds && request.nodeIds.length > 0) {
    const nodes = await Promise.all(
      request.nodeIds.map((id) => figma.getNodeByIdAsync(id))
    );
    targetNodes = nodes.filter(
      (node): node is SceneNode =>
        node !== null && node.type !== "DOCUMENT" && node.type !== "PAGE"
    );
  } else {
    targetNodes = [...figma.currentPage.selection];
  }

  if (targetNodes.length === 0) {
    throw new Error(
      "No nodes to export. Select nodes or provide nodeIds."
    );
  }

  const exports = await Promise.all(
    targetNodes.map(async (node) => {
      const settings: ExportSettings =
        format === "SVG"
          ? { format: "SVG" }
          : format === "PDF"
            ? { format: "PDF" }
            : format === "JPG"
              ? {
                  format: "JPG",
                  constraint: { type: "SCALE", value: scale },
                }
              : {
                  format: "PNG",
                  constraint: { type: "SCALE", value: scale },
                };

      const bytes = await node.exportAsync(settings);
      const base64 = figma.base64Encode(bytes);
      return {
        nodeId: node.id,
        nodeName: node.name,
        format,
        base64,
        width: node.width,
        height: node.height,
      };
    })
  );

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      exports,
    },
  };
}
