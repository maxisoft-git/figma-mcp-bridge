import type { ServerRequest, PluginResponse } from "../types";
import { getSceneNodeById } from "../utils";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const nodeId = request.nodeIds && request.nodeIds[0];
  if (!nodeId) {
    throw new Error("nodeIds is required for set_z_order");
  }
  const params = request.params ?? {};
  const node = await getSceneNodeById(nodeId);
  const parent = node.parent;
  if (!parent || !("children" in parent)) {
    throw new Error(`Node has no parent: ${nodeId}`);
  }

  const direction = params.direction;
  if (typeof direction !== "string") {
    throw new Error("direction is required: forward, backward, front, back, or index");
  }

  const siblings = (parent as BaseNode & ChildrenMixin).children as ReadonlyArray<SceneNode>;
  const currentIndex = siblings.indexOf(node);

  if (direction === "front") {
    (parent as BaseNode & ChildrenMixin).insertChild(siblings.length - 1, node);
  } else if (direction === "back") {
    (parent as BaseNode & ChildrenMixin).insertChild(0, node);
  } else if (direction === "forward") {
    if (currentIndex < siblings.length - 1) {
      (parent as BaseNode & ChildrenMixin).insertChild(currentIndex + 1, node);
    }
  } else if (direction === "backward") {
    if (currentIndex > 0) {
      (parent as BaseNode & ChildrenMixin).insertChild(currentIndex - 1, node);
    }
  } else if (direction === "index" && typeof params.index === "number") {
    const targetIndex = Math.max(0, Math.min(params.index, siblings.length - 1));
    (parent as BaseNode & ChildrenMixin).insertChild(targetIndex, node);
  } else {
    throw new Error(`Invalid direction: ${direction}. Use forward, backward, front, back, or index`);
  }

  const newIndex = ((parent as BaseNode & ChildrenMixin).children as ReadonlyArray<SceneNode>).indexOf(node);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      nodeId: node.id,
      nodeName: node.name,
      previousIndex: currentIndex,
      newIndex,
      totalSiblings: ((parent as BaseNode & ChildrenMixin).children as ReadonlyArray<SceneNode>).length,
    },
  };
}
