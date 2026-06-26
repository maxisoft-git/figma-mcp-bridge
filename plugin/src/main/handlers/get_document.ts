import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, enrichWithImageData, resolveStyleReferences } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const includeHidden = request.params?.includeHidden === true;
  const includeImageData = request.params?.includeImageData === true;
  const enrich = request.params?.enrich === true;
  let data = serializeNode(figma.currentPage, { includeHidden, enrich });
  if (enrich) {
    data = await resolveStyleReferences(data);
  }
  if (includeImageData) {
    data = await enrichWithImageData(data);
  }
  return {
    type: request.type,
    requestId: request.requestId,
    data,
  };
}
