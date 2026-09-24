import type { ServerRequest, PluginResponse } from "../types";

/**
 * Read-only geometry for a capture root: absolute transforms and bounds for
 * every node in the subtree. Deliberately independent of screenshot export,
 * so callers can combine it with a separate (non-atomic) screenshot.
 */
async function getLayoutTree(rootId: string, maxNodes = 2000) {
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root || root.type === "DOCUMENT" || root.type === "PAGE") {
    throw new Error("Scene root required");
  }
  const nodes: unknown[] = [];
  let truncated = false;

  const visit = (node: SceneNode, depth: number): void => {
    if (nodes.length >= maxNodes || depth > 100) {
      truncated = true;
      return;
    }
    nodes.push({
      id: node.id,
      parentId: node.parent?.id,
      name: node.name,
      type: node.type,
      visible: node.visible,
      localSize: { width: node.width, height: node.height },
      absoluteTransform: node.absoluteTransform,
      absoluteBoundingBox: node.absoluteBoundingBox,
      absoluteRenderBounds: node.absoluteRenderBounds,
      clipsContent: "clipsContent" in node ? node.clipsContent : false,
    });
    if ("children" in node) for (const child of node.children) visit(child, depth + 1);
  };

  visit(root as SceneNode, 0);

  return {
    schemaVersion: 1,
    snapshotId: new Date().toISOString(),
    atomicWithScreenshot: false,
    fileKey: figma.fileKey ?? null,
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    rootId,
    truncated,
    nodes,
    capture: {
      coordinateSpace: "document-absolute",
      window: (root as SceneNode).absoluteBoundingBox,
      exportSettings: {
        format: "PNG",
        contentsOnly: true,
        useAbsoluteBounds: true,
        constraint: { type: "SCALE", value: 1 },
      },
      dimensionsAreMeasuredFromImage: false,
      clipping:
        "Rectangles are layout AABBs; ancestor masks and painted visibility are not evaluated.",
    },
  };
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const rootId = request.nodeIds?.[0];
  if (!rootId) throw new Error("rootId is required");

  const maxNodes = Number(request.params?.maxNodes ?? 2000);

  return {
    type: request.type,
    requestId: request.requestId,
    data: await getLayoutTree(rootId, maxNodes),
  };
}
