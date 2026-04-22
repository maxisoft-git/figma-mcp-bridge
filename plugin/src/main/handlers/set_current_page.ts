import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const pageId = params.pageId;
  const pageName = params.pageName;

  let targetPage: PageNode | null = null;

  if (typeof pageId === "string") {
    const node = await figma.getNodeByIdAsync(pageId);
    if (node && node.type === "PAGE") {
      targetPage = node as PageNode;
    }
  }

  if (!targetPage && typeof pageName === "string") {
    targetPage = figma.root.children.find((p) => p.name === pageName) ?? null;
  }

  if (!targetPage) {
    throw new Error(
      `Page not found. Available: ${figma.root.children.map((p) => `"${p.name}" (id: ${p.id})`).join(", ")}`
    );
  }

  figma.currentPage = targetPage;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      currentPageId: figma.currentPage.id,
      currentPageName: figma.currentPage.name,
      pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
    },
  };
}
