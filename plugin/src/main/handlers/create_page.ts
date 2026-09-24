import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const page = figma.createPage();

  if (typeof params.name === "string") {
    page.name = params.name;
  }

  // The manifest uses `documentAccess: "dynamic-page"`, so the page must be
  // switched with the async setter — assigning `figma.currentPage` throws there.
  if (params.setAsCurrent === true) {
    await figma.setCurrentPageAsync(page);
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      pageId: page.id,
      pageName: page.name,
      index: figma.root.children.indexOf(page),
      isCurrentPage: figma.currentPage.id === page.id,
    },
  };
}
