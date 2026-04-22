import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      fileName: figma.root.name,
      currentPageId: figma.currentPage.id,
      currentPageName: figma.currentPage.name,
      pageCount: figma.root.children.length,
      pages: figma.root.children.map((page) => ({
        id: page.id,
        name: page.name,
      })),
    },
  };
}
