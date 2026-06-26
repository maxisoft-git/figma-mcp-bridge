import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode, cssFor } from "../utils/dev-mode";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  const node = await resolveNode(nodeId);
  const css = await cssFor(node);
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      css,
    },
  };
}
