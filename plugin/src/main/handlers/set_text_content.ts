import type { ServerRequest, PluginResponse } from "../types";
import { getTextNodeById, loadFontsForTextNode } from "../utils";
import { setTextContentSchema, validateParams } from "../schemas";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = validateParams(setTextContentSchema, request.params ?? {});
  const node = await getTextNodeById(params.nodeId);
  await loadFontsForTextNode(node);

  const previousCharacters = node.characters;
  node.characters = params.text;

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
