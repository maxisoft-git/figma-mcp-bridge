import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const rawItems = request.params?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("items is required for set_node_visibility");
  }
  const items = rawItems as Array<{ nodeId: string; visible: boolean }>;
  const results = await Promise.all(
    items.map(async ({ nodeId, visible }) => {
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
