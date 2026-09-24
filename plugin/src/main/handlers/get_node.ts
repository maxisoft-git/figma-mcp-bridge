import type { ServerRequest, PluginResponse } from "../types";
import {
  MAX_NODE_RESULT_CHARS,
  serializeNodeWithinBudget,
  enrichWithImageData,
  resolveStyleReferences,
} from "../serializer";
import { nodeNotFound, validationError } from "../errors";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw validationError("nodeIds is required for get_node");
  }
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || node.type === "DOCUMENT") {
    throw nodeNotFound(nodeId);
  }
  const includeHidden = request.params?.includeHidden === true;
  const includeImageData = request.params?.includeImageData === true;
  const enrich = request.params?.enrich === true;
  // Kept permissive on purpose: the server validates the shape, so anything
  // non-numeric arriving here means an older server build and should read as
  // unlimited rather than cut the tree to nothing.
  const requestedDepth = request.params?.depth;
  const depth =
    typeof requestedDepth === "number" &&
    Number.isFinite(requestedDepth) &&
    requestedDepth >= 0
      ? requestedDepth
      : undefined;
  let data = serializeNodeWithinBudget(node as SceneNode, MAX_NODE_RESULT_CHARS, {
    includeHidden,
    enrich,
    depth,
  });
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
