import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { serializeNode } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  const node = await resolveNode(nodeId);
  const cssObj = await node.getCSSAsync();
  // Combine Dev Mode CSS object with the rich serialized node tree so AI
  // agents get both the raw Figma key/value dump and a useful structural
  // representation in one round-trip.
  const serialized = serializeNode(node, { depth: 2 });
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      nodeType: node.type,
      css: cssObj,
      node: serialized,
    },
  };
}
