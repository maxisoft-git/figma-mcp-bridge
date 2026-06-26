import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode, findImageForNode } from "../utils/dev-mode";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  const node = await resolveNode(nodeId);
  const found = await findImageForNode(node);
  if (!found) {
    throw new Error(
      "No image fill on this node or its direct children, and node export returned no data."
    );
  }
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      mime: found.mime,
      source: found.source,
      scaleMode: found.scaleMode,
      base64: figma.base64Encode(found.bytes),
      bytes: found.bytes.length,
    },
  };
}
