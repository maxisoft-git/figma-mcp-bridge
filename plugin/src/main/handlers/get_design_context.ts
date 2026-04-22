import type { ServerRequest, PluginResponse } from "../types";
import { serializeNode, type SerializeOptions } from "../serializer";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const depth =
    typeof request.params?.depth === "number" ? request.params.depth : 2;
  const options: SerializeOptions = {
    includeHidden: request.params?.includeHidden === true,
  };

  const serializeWithDepth = async (
    node: unknown,
    currentDepth: number
  ): Promise<ReturnType<typeof serializeNode>> => {
    const serialized = serializeNode(node, options);
    if (currentDepth >= depth && serialized.children) {
      return {
        ...serialized,
        children: undefined,
        childCount:
          (node as ChildrenMixin & SceneNode).children?.filter((c) =>
            options.includeHidden ? true : c.visible !== false
          ).length ?? 0,
      } as ReturnType<typeof serializeNode> & { childCount: number };
    }
    if (serialized.children) {
      const childNodes = await Promise.all(
        serialized.children.map((child) =>
          figma.getNodeByIdAsync(child.id)
        )
      );
      const serializedChildren = await Promise.all(
        childNodes
          .filter((n): n is SceneNode => {
            if (n === null || n.type === "DOCUMENT") return false;
            if (options.includeHidden) return true;
            return "visible" in n && n.visible !== false;
          })
          .map((n) => serializeWithDepth(n, currentDepth + 1))
      );
      return {
        ...serialized,
        children: serializedChildren,
      };
    }
    return serialized;
  };

  const selection = figma.currentPage.selection;
  const contextNodes =
    selection.length > 0
      ? await Promise.all(
          selection.map((node) => serializeWithDepth(node, 0))
        )
      : [
          await serializeWithDepth(
            figma.currentPage as unknown as SceneNode,
            0
          ),
        ];

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      fileName: figma.root.name,
      currentPage: {
        id: figma.currentPage.id,
        name: figma.currentPage.name,
      },
      selectionCount: selection.length,
      context: contextNodes,
    },
  };
}
