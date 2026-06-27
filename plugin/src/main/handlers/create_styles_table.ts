import type { ServerRequest, PluginResponse } from "../types";
import { getManifest } from "../utils/ds-manifest";

interface CreateTableParams {
  manifestId: string;
  options?: {
    pageName?: string;
    columns?: number;
    cellSize?: number;
  };
}

const PAGE_NAME_DEFAULT = "📐 Design System";
const COLUMNS_DEFAULT = 4;
const CELL_SIZE_DEFAULT = 80;
const SECTION_GAP = 32;
const CELL_GAP = 16;

/** Find an existing page by name, or create a new one. */
function findOrCreatePage(name: string): PageNode {
  const existing = figma.root.children.find(
    (c): c is PageNode => c.type === "PAGE" && c.name === name,
  );
  if (existing) return existing;
  return figma.createPage();
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as CreateTableParams;
  if (!params.manifestId) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "manifestId is required for create_styles_table" },
    };
  }
  const manifest = getManifest(params.manifestId);
  if (!manifest) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "NOT_FOUND", message: `Manifest not found: ${params.manifestId}` },
    };
  }

  const pageName = params.options?.pageName ?? PAGE_NAME_DEFAULT;
  const columns = Math.max(1, Math.min(8, params.options?.columns ?? COLUMNS_DEFAULT));
  const cellSize = Math.max(40, Math.min(160, params.options?.cellSize ?? CELL_SIZE_DEFAULT));

  const page = findOrCreatePage(pageName);
  // Only rename when the page is fresh (created above).
  if (page.name === "Page 1" || page.name === "Untitled") {
    page.name = pageName;
  }

  const outer = figma.createFrame();
  outer.name = "Design System — Reference";
  outer.layoutMode = "VERTICAL";
  outer.itemSpacing = SECTION_GAP;
  outer.paddingTop = SECTION_GAP;
  outer.paddingBottom = SECTION_GAP;
  outer.paddingLeft = SECTION_GAP;
  outer.paddingRight = SECTION_GAP;
  outer.primaryAxisSizingMode = "AUTO";
  outer.counterAxisSizingMode = "AUTO";
  outer.fills = [];
  page.appendChild(outer);
  outer.x = 0;
  outer.y = 0;

  // Title
  const title = figma.createText();
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  title.fontName = { family: "Inter", style: "Bold" };
  title.fontSize = 32;
  title.characters = "Design System";
  outer.appendChild(title);

  // Resolve variables for color cells
  const allVariables = await figma.variables.getLocalVariablesAsync();
  const varById = new Map<string, Variable>();
  for (const v of allVariables) varById.set(v.id, v);

  const cellsCreated = { colors: 0, textStyles: 0 };

  // --- Colors section ---
  const colorEntries = Object.entries(manifest.colors);
  if (colorEntries.length > 0) {
    const section = figma.createFrame();
    section.name = "Colors";
    section.layoutMode = "VERTICAL";
    section.itemSpacing = 12;
    section.fills = [];
    section.primaryAxisSizingMode = "AUTO";
    section.counterAxisSizingMode = "AUTO";
    outer.appendChild(section);

    const sectionTitle = figma.createText();
    sectionTitle.fontName = { family: "Inter", style: "Bold" };
    sectionTitle.fontSize = 18;
    sectionTitle.characters = "Colors";
    section.appendChild(sectionTitle);

    const grid = figma.createFrame();
    grid.name = "Grid";
    grid.layoutMode = "HORIZONTAL";
    grid.layoutWrap = "WRAP";
    grid.itemSpacing = CELL_GAP;
    grid.counterAxisSpacing = CELL_GAP;
    grid.fills = [];
    grid.primaryAxisSizingMode = "FIXED";
    grid.counterAxisSizingMode = "AUTO";
    grid.resize(columns * (cellSize + 80), 1);
    section.appendChild(grid);

    for (const [, info] of colorEntries) {
      const cell = figma.createFrame();
      cell.name = info.variableName;
      cell.layoutMode = "VERTICAL";
      cell.itemSpacing = 6;
      cell.paddingTop = 8;
      cell.paddingBottom = 8;
      cell.paddingLeft = 8;
      cell.paddingRight = 8;
      cell.cornerRadius = 4;
      cell.fills = [];
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "AUTO";
      grid.appendChild(cell);

      const swatch = figma.createRectangle();
      swatch.name = "swatch";
      swatch.resize(cellSize, cellSize);
      swatch.cornerRadius = 4;
      // Bind fill to the color variable.
      const variable = varById.get(info.variableId);
      if (variable) {
        const fill = { type: "SOLID" as const, color: hexToRgb(info.hex) };
        swatch.fills = [fill as unknown as Paint];
        swatch.setBoundVariable("fills", { type: "VARIABLE_ALIAS" as const, id: variable.id });
      } else {
        swatch.fills = [{ type: "SOLID", color: hexToRgb(info.hex) }];
      }
      cell.appendChild(swatch);

      const label = figma.createText();
      label.fontName = { family: "Inter", style: "Regular" };
      label.fontSize = 11;
      label.characters = info.variableName;
      label.textAutoResize = "WIDTH_AND_HEIGHT";
      cell.appendChild(label);

      cellsCreated.colors++;
    }
  }

  // --- Text styles section ---
  const textEntries = Object.entries(manifest.textStyles);
  if (textEntries.length > 0) {
    const section = figma.createFrame();
    section.name = "Text Styles";
    section.layoutMode = "VERTICAL";
    section.itemSpacing = 12;
    section.fills = [];
    section.primaryAxisSizingMode = "AUTO";
    section.counterAxisSizingMode = "AUTO";
    outer.appendChild(section);

    const sectionTitle = figma.createText();
    sectionTitle.fontName = { family: "Inter", style: "Bold" };
    sectionTitle.fontSize = 18;
    sectionTitle.characters = "Text Styles";
    section.appendChild(sectionTitle);

    const grid = figma.createFrame();
    grid.name = "Grid";
    grid.layoutMode = "HORIZONTAL";
    grid.layoutWrap = "WRAP";
    grid.itemSpacing = CELL_GAP;
    grid.counterAxisSpacing = CELL_GAP;
    grid.fills = [];
    grid.primaryAxisSizingMode = "FIXED";
    grid.counterAxisSizingMode = "AUTO";
    grid.resize(columns * (cellSize + 80), 1);
    section.appendChild(grid);

    for (const [, info] of textEntries) {
      const cell = figma.createFrame();
      cell.name = info.styleName;
      cell.layoutMode = "VERTICAL";
      cell.itemSpacing = 4;
      cell.paddingTop = 8;
      cell.paddingBottom = 8;
      cell.paddingLeft = 12;
      cell.paddingRight = 12;
      cell.fills = [];
      cell.primaryAxisSizingMode = "AUTO";
      cell.counterAxisSizingMode = "AUTO";
      grid.appendChild(cell);

      const sample = figma.createText();
      // Load the font the style references so we can use it.
      try {
        await figma.loadFontAsync({ family: info.family, style: info.weight });
        sample.fontName = { family: info.family, style: info.weight };
      } catch {
        await figma.loadFontAsync({ family: "Inter", style: "Regular" });
        sample.fontName = { family: "Inter", style: "Regular" };
      }
      sample.fontSize = info.size;
      sample.characters = `Aa ${info.size}`;
      sample.textAutoResize = "WIDTH_AND_HEIGHT";
      // Bind to the created text style so updates propagate.
      try {
        sample.setTextStyleIdAsync(info.styleId);
      } catch {
        // font missing — leave unbound
      }
      cell.appendChild(sample);

      const label = figma.createText();
      label.fontName = { family: "Inter", style: "Regular" };
      label.fontSize = 11;
      label.characters = info.styleName;
      label.textAutoResize = "WIDTH_AND_HEIGHT";
      cell.appendChild(label);

      cellsCreated.textStyles++;
    }
  }

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      pageId: page.id,
      pageName: page.name,
      frameId: outer.id,
      cellsCreated,
    },
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}
