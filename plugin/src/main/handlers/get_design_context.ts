import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, type SerializeOptions } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const depth =
    typeof request.params?.depth === "number" ? request.params.depth : 2;
  const options: SerializeOptions = {
    includeHidden: request.params?.includeHidden === true,
    depth,
    currentDepth: 0,
  };

  const selection = figma.currentPage.selection;
  const contextNodes = await Promise.all(
    selection.length > 0
      ? selection.map((node) => serializeNode(node, options))
      : [serializeNode(figma.currentPage as unknown as SceneNode, options)]
  );

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      fileName: figma.root.name,
      currentPage: {
        id: figma.currentPage.id,
        name: figma.currentPage.name,
      },
      selectionCount: selection.length,
      context: contextNodes,
    },
  };
}