import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById, getParentNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  if (!request.nodeIds || request.nodeIds.length === 0) {
    throw new Error("nodeIds is required for create_group");
  }
  const params = request.params ?? {};

  const nodes = await Promise.all(request.nodeIds.map((id) => getSceneNodeById(id)));

  const firstParent = nodes[0].parent;
  if (!firstParent) {
    throw new Error("Nodes must have a parent to create a group");
  }

  for (const node of nodes) {
    if (node.parent !== firstParent) {
      throw new Error("All nodes must have the same parent to create a group");
    }
  }

  let targetParent: (BaseNode & ChildrenMixin) | null = null;
  if (typeof params.parentId === "string") {
    targetParent = await getParentNodeById(params.parentId);
  } else {
    if (!("appendChild" in firstParent)) {
      throw new Error("Parent does not support children");
    }
    targetParent = firstParent as BaseNode & ChildrenMixin;
  }

  const group = figma.group(nodes, targetParent);

  if (typeof params.name === "string") {
    group.name = params.name;
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: group.id,
      nodeName: group.name,
      parentId: group.parent?.id,
      childrenCount: group.children.length,
    },
  };
}
