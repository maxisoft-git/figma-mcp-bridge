import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  const node = await resolveNode(nodeId);
  const svg = await node.exportAsync({ format: "SVG_STRING" });
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      svg,
    },
  };
}
