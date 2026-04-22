import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, enrichWithImageData, type SerializeOptions } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const depth =
    typeof request.params?.depth === "number" ? request.params.depth : 2;
  const includeImageData = request.params?.includeImageData === true;
  const options: SerializeOptions = {
    includeHidden: request.params?.includeHidden === true,
    depth,
    currentDepth: 0,
  };

  const selection = figma.currentPage.selection;
  let contextNodes = await Promise.all(
    selection.length > 0
      ? selection.map((node) => serializeNode(node, options))
      : [serializeNode(figma.currentPage as unknown as SceneNode, options)]
  );

  if (includeImageData) {
    contextNodes = await Promise.all(
      contextNodes.map((n) => enrichWithImageData(n))
    );
  }

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