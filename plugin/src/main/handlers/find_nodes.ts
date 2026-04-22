import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const query = params.query;
  const nodeType = params.type;
  const maxDepth = typeof params.maxDepth === "number" ? params.maxDepth : Infinity;
  const maxResults = typeof params.maxResults === "number" ? params.maxResults : 50;

  if (typeof query !== "string" && typeof nodeType !== "string") {
    throw new Error("query or type is required for find_nodes");
  }

  let regex: RegExp | null = null;
  if (typeof query === "string") {
    try {
      regex = new RegExp(query, "i");
    } catch {
      throw new Error(`Invalid regex: ${query}`);
    }
  }

  const results: Array<{ id: string; name: string; type: string; bounds?: { x: number; y: number; width: number; height: number } }> = [];

  const search = (node: SceneNode | PageNode, depth: number): void => {
    if (results.length >= maxResults) return;
    if (depth > maxDepth) return;

    if (node.type !== "DOCUMENT" && node.type !== "PAGE") {
      const sceneNode = node as SceneNode;
      const matchesName = !regex || regex.test(sceneNode.name);
      const matchesType = !nodeType || sceneNode.type === nodeType;

      if (matchesName && matchesType) {
        const entry: (typeof results)[0] = {
          id: sceneNode.id,
          name: sceneNode.name,
          type: sceneNode.type,
        };
        if ("x" in sceneNode && "y" in sceneNode) {
          entry.bounds = {
            x: sceneNode.x as number,
            y: sceneNode.y as number,
            width: sceneNode.width as number,
            height: sceneNode.height as number,
          };
        }
        results.push(entry);
      }
    }

    if ("children" in node) {
      for (const child of (node as { children: ReadonlyArray<SceneNode> }).children) {
        if (results.length >= maxResults) break;
        search(child, depth + 1);
      }
    }
  };

  search(figma.currentPage as unknown as PageNode, 0);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      foundCount: results.length,
      truncated: results.length >= maxResults,
      results,
    },
  };
}
