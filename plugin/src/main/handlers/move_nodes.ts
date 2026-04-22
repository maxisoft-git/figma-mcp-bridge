import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, positionNode } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length === 0) {
    throw new Error("nodeIds is required for move_nodes");
  }
  const params = request.params ?? {};
  const results = [];

  for (const nodeId of request.nodeIds) {
    const node = await getSceneNodeById(nodeId);

    if (typeof params.dx === "number" || typeof params.dy === "number") {
      if (!("x" in node)) {
        results.push({ nodeId, error: `Node does not support positioning: ${nodeId}` });
        continue;
      }
      const dx = typeof params.dx === "number" ? params.dx : 0;
      const dy = typeof params.dy === "number" ? params.dy : 0;
      node.x = (node.x as number) + dx;
      node.y = (node.y as number) + dy;
      results.push({ nodeId, x: node.x, y: node.y });
    } else if (typeof params.x === "number" || typeof params.y === "number") {
      positionNode(node, params.x, params.y);
      results.push({ nodeId, x: "x" in node ? node.x : undefined, y: "y" in node ? node.y : undefined });
    } else {
      results.push({ nodeId, error: "dx/dy or x/y is required" });
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: { movedCount: results.filter((r) => !("error" in r)).length, results },
  };
}
