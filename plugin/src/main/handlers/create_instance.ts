import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};

  let component: ComponentNode | null = null;

  if (params.componentId && typeof params.componentId === "string") {
    const node = figma.getNodeById(params.componentId);
    if (!node || node.type !== "COMPONENT") {
      throw new Error(`Component not found: ${params.componentId}`);
    }
    component = node;
  } else if (params.componentKey && typeof params.componentKey === "string") {
    const node = figma.getNodeById(params.componentKey);
    if (!node || node.type !== "COMPONENT") {
      try {
        const imported = await figma.importComponentByKeyAsync(params.componentKey);
        component = imported;
      } catch {
        throw new Error(`Component key not found: ${params.componentKey}`);
      }
    } else {
      component = node;
    }
  }

  if (!component) {
    throw new Error("componentId or componentKey is required for create_instance");
  }

  const instance = component.createInstance();

  if (typeof params.x === "number") instance.x = params.x;
  if (typeof params.y === "number") instance.y = params.y;
  if (typeof params.name === "string") instance.name = params.name;

  if (params.parentId && typeof params.parentId === "string") {
    const parent = figma.getNodeById(params.parentId);
    if (parent && "appendChild" in parent) {
      (parent as BaseNode & { appendChild: (n: SceneNode) => void }).appendChild(instance);
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      id: instance.id,
      name: instance.name,
      componentId: instance.componentId,
      width: instance.width,
      height: instance.height,
    },
  };
}
