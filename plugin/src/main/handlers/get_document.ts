import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, enrichWithImageData } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const includeHidden = request.params?.includeHidden === true;
  const includeImageData = request.params?.includeImageData === true;
  let data = serializeNode(figma.currentPage, { includeHidden });
  if (includeImageData) {
    data = await enrichWithImageData(data);
  }
  return {
    type: request.type,
    requestId: request.requestId,
    data,
  };
}