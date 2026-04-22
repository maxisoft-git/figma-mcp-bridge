import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for create_component");
  }

  const node = await getSceneNodeById(nodeId);
  const params = request.params ?? {};

  if (node.type === "COMPONENT") {
    throw new Error(`Node ${nodeId} is already a component`);
  }

  const component = figma.createComponent();
  component.name = (params.name as string) ?? node.name;

  node.parent && node.type !== "PAGE"
    ? component.appendChild(node)
    : component.appendChild(node.clone());

  component.x = node.x;
  component.y = node.y;
  component.resize(node.width, node.height);

  if (params.description && typeof params.description === "string") {
    component.description = params.description;
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      id: component.id,
      name: component.name,
      key: component.key,
      width: component.width,
      height: component.height,
    },
  };
}
