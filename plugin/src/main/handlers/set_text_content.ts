import type { ServerRequest, PluginResponse } from "../types";
import { getTextNodeById, loadFontsForTextNode } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  const text = request.params?.text;
  if (!nodeId) {
    throw new Error("nodeIds is required for set_text_content");
  }
  if (typeof text !== "string") {
    throw new Error("text is required for set_text_content");
  }

  const node = await getTextNodeById(nodeId);
  await loadFontsForTextNode(node);

  const previousCharacters = node.characters;
  node.characters = text;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      previousCharacters,
      characters: node.characters,
    },
  };
}
