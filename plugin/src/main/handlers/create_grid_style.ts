import type { ServerRequest, PluginResponse } from "../types";

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = request.params ?? {};
  const name = typeof params.name === "string" ? params.name : "";
  const layoutGrids = Array.isArray(params.layoutGrids) ? params.layoutGrids : [];

  if (!name) {
    throw new Error("name is required for create_grid_style");
  }
  if (layoutGrids.length === 0) {
    throw new Error("layoutGrids array is required for create_grid_style");
  }

  const style = figma.createGridStyle();
  style.name = name;

  const figmaGrids: LayoutGrid[] = layoutGrids.map((grid: unknown) => {
    const g = grid as Record<string, unknown>;
    const pattern = g.pattern as string;

    if (pattern === "COLUMNS" || pattern === "ROWS") {
      return {
        pattern,
        alignment: (g.alignment as string) ?? "STRETCH",
        count: (g.count as number) ?? 12,
        gutterSize: (g.gutterSize as number) ?? 16,
        offset: (g.offset as number) ?? 0,
        sectionSize: (g.sectionSize as number) ?? 80,
        visible: (g.visible as boolean) ?? true,
        color: (g.color as RGBA) ?? { r: 1, g: 0, b: 0, a: 0.1 },
      } as LayoutGrid;
    }

    if (pattern === "GRID") {
      return {
        pattern: "GRID",
        sectionSize: (g.sectionSize as number) ?? 8,
        visible: (g.visible as boolean) ?? true,
        color: (g.color as RGBA) ?? { r: 1, g: 0, b: 0, a: 0.1 },
      } as LayoutGrid;
    }

    throw new Error(`Unsupported grid pattern: ${pattern}`);
  });

  style.layoutGrids = figmaGrids;

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      styleId: style.id,
      name: style.name,
    },
  };
}