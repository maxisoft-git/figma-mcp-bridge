import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, enrichWithImageData, resolveStyleReferences } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const includeHidden = request.params?.includeHidden === true;
  const includeImageData = request.params?.includeImageData === true;
  const enrich = request.params?.enrich === true;
  const nodes = figma.currentPage.selection.map((node) =>
    serializeNode(node, { includeHidden, enrich })
  );
  const data = includeImageData
    ? await Promise.all(
        nodes.map(async (n) => {
          const enriched = enrich ? await resolveStyleReferences(n) : n;
          return enrichWithImageData(enriched);
        })
      )
    : enrich
      ? await Promise.all(nodes.map(resolveStyleReferences))
      : nodes;
  return {
    type: request.type,
    requestId: request.requestId,
    data,
  };
}
