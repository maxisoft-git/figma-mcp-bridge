import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const includeHidden = request.params?.includeHidden === true;
  return {
    type: request.type,
    requestId: request.requestId,
    data: figma.currentPage.selection.map((node) =>
      serializeNode(node, { includeHidden })
    ),
  };
}