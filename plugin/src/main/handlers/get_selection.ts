import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, enrichWithImageData } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const includeHidden = request.params?.includeHidden === true;
  const includeImageData = request.params?.includeImageData === true;
  const nodes = figma.currentPage.selection.map((node) =>
    serializeNode(node, { includeHidden })
  );
  const data = includeImageData
    ? await Promise.all(nodes.map((n) => enrichWithImageData(n)))
    : nodes;
  return {
    type: request.type,
    requestId: request.requestId,
    data,
  };
}