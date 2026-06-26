import type { ServerRequest, PluginResponse } from "../types";
import { setNodeVisibilitySchema, validateParams } from "../schemas";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = validateParams(setNodeVisibilitySchema, request.params ?? {});
  const results = await Promise.all(
    params.items.map(async ({ nodeId, visible }) => {
      const node = await figma.getNodeByIdAsync(nodeId);
      if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
        return { nodeId, error: `Node not found: ${nodeId}` };
      }
      const sceneNode = node as SceneNode;
      const previousVisible = sceneNode.visible;
      sceneNode.visible = visible;
      return { nodeId, previousVisible, visible };
    })
  );
  return {
    type: request.type,
    requestId: request.requestId,
    data: { results },
  };
}
