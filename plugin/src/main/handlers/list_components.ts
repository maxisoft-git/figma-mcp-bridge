import type { ServerRequest, PluginResponse } from "../types";

function serializeComponent(c: ComponentNode) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    key: c.key,
    width: c.width,
    height: c.height,
    parent: c.parent ? { id: c.parent.id, name: c.parent.name } : null,
  };
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const page = figma.currentPage;

  if (params.pageId) {
    const target = figma.getNodeById(params.pageId as string);
    if (!target || target.type !== "PAGE") {
      throw new Error(`Page not found: ${params.pageId}`);
    }
  }

  const targetPage = params.pageId
    ? (figma.getNodeById(params.pageId as string) as PageNode)
    : page;

  const components = targetPage.findAll((n) => n.type === "COMPONENT") as ComponentNode[];

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      components: components.map(serializeComponent),
      count: components.length,
    },
  };
}
