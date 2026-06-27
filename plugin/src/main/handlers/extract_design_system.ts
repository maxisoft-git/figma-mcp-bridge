import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import {
  collectStats,
  filterStatsByOccurrence,
  type CollectedStats,
} from "../utils/ds-collect";
import {
  colorTokenName,
  spacingTokenName,
  radiusTokenName,
  sanitizeTokenName,
} from "../utils/ds-naming";
import { storeManifest, type DesignManifest } from "../utils/ds-manifest";

interface ExtractParams {
  nodeId: string;
  collectionName?: string;
  minOccurrences?: number;
  skipHidden?: boolean;
}

const COLLECTION_DEFAULT = "Design System";
const HEX_SCALE_TO_NAME_BUCKETS: Array<[number, string]> = [
  [50, "50"], [100, "100"], [200, "200"], [300, "300"], [400, "400"],
  [500, "500"], [600, "600"], [700, "700"], [800, "800"], [900, "900"], [950, "950"],
];

/**
 * Find a Variable collection by name. If `createIfMissing`, create a
 * new one with the given name and a default "Light" mode (or add
 * the variable to the default mode if the collection exists).
 */
async function findOrCreateCollection(
  name: string,
  createIfMissing: boolean,
): Promise<VariableCollection> {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = all.find((c) => c.name === name);
  if (existing) return existing;
  if (!createIfMissing) {
    throw new Error(`Variable collection "${name}" not found`);
  }
  const created = figma.variables.createVariableCollection(name);
  // Default mode is already named "Mode 1" — rename to "Light".
  const defaultMode = created.modes[0]!.modeId;
  created.renameMode(defaultMode, "Light");
  return created;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ExtractParams;
  if (!params.nodeId) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeId is required for extract_design_system" },
    };
  }

  let root: SceneNode;
  try {
    root = await resolveNode(params.nodeId);
  } catch (err) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
    };
  }

  const collectionName = params.collectionName ?? COLLECTION_DEFAULT;
  const minOccurrences = Math.max(1, params.minOccurrences ?? 1);
  const skipHidden = params.skipHidden ?? true;

  // 1. Collect raw stats
  const rawStats: CollectedStats = collectStats(root, { skipHidden });
  const stats = minOccurrences > 1
    ? filterStatsByOccurrence(rawStats, minOccurrences)
    : rawStats;

  // 2. Find or create the collection
  const collection = await findOrCreateCollection(collectionName, true);
  const defaultMode = collection.modes[0]!.modeId;

  // 3. Create color variables (one per unique hex).
  // Group by hueName so e.g. multiple blues of different lightness each
  // get their own variable. If the same scale (e.g. 500) appears with two
  // distinct hexes in the same hue, we suffix the variable name.
  const colors: DesignManifest["colors"] = {};
  const colorVarNameCount = new Map<string, number>();
  for (const [hex] of stats.colors) {
    const { name: hueName, scale } = colorTokenName(hex);
    const baseName = `${hueName}/${scale}`;
    const occurrence = colorVarNameCount.get(baseName) ?? 0;
    const occurrenceKey = `${baseName}@${hex}`;
    if (colorVarNameCount.get(occurrenceKey) !== undefined) continue;
    colorVarNameCount.set(occurrenceKey, 1);
    const finalName = occurrence > 0 ? `${baseName}-${occurrence}` : baseName;
    const variable = figma.variables.createVariable(finalName, collection, "COLOR");
    variable.setValueForMode(defaultMode, hexToRgb(hex));
    colors[hex] = {
      variableId: variable.id,
      variableName: finalName,
      hex,
      scale,
      hue: hueName,
    };
  }

  // 4. Create text styles.
  const textStyles: DesignManifest["textStyles"] = {};
  for (const sample of stats.textStyles) {
    const size = typeof sample.style.fontSize === "number" ? sample.style.fontSize : 14;
    const family = typeof sample.style.fontName === "object"
      ? sample.style.fontName.family
      : "Inter";
    const style = typeof sample.style.fontName === "object"
      ? sample.style.fontName.style
      : "Regular";
    const familySlug = sanitizeTokenName(family);
    const styleSlug = sanitizeTokenName(style);
    const sizeSlug = String(Math.round(size));
    const styleName = `${familySlug}/${styleSlug}/${sizeSlug}`;
    const ts = figma.createTextStyle();
    ts.name = styleName;
    if (typeof sample.style.fontName === "object") {
      await figma.loadFontAsync(sample.style.fontName as FontName);
      ts.fontName = sample.style.fontName as FontName;
    }
    if (typeof sample.style.fontSize === "number") {
      ts.fontSize = sample.style.fontSize;
    }
    if (typeof sample.style.lineHeight !== "symbol") {
      ts.lineHeight = sample.style.lineHeight as LineHeight;
    }
    if (typeof sample.style.letterSpacing !== "symbol") {
      ts.letterSpacing = sample.style.letterSpacing as LetterSpacing;
    }
    if (typeof sample.style.textCase !== "symbol") {
      ts.textCase = sample.style.textCase as TextCase;
    }
    if (typeof sample.style.textDecoration !== "symbol") {
      ts.textDecoration = sample.style.textDecoration as TextDecoration;
    }
    textStyles[sample.hash] = {
      styleId: ts.id,
      styleName,
      family: familySlug,
      weight: styleSlug,
      size,
    };
  }

  // 5. Create spacing & radius variables (one per unique value).
  const spacing: DesignManifest["spacing"] = {};
  for (const [value] of stats.spacing) {
    const { name } = spacingTokenName(value);
    const variable = figma.variables.createVariable(name, collection, "FLOAT");
    variable.setValueForMode(defaultMode, value);
    spacing[String(value)] = { variableId: variable.id, variableName: name, value };
  }
  const radii: DesignManifest["radii"] = {};
  for (const [value] of stats.radii) {
    const { name } = radiusTokenName(value);
    const variable = figma.variables.createVariable(name, collection, "FLOAT");
    variable.setValueForMode(defaultMode, value);
    radii[String(value)] = { variableId: variable.id, variableName: name, value };
  }

  // 6. Persist manifest and return.
  const manifest: DesignManifest = { colors, textStyles, spacing, radii };
  const manifestId = storeManifest(manifest);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      manifestId,
      collectionId: collection.id,
      collectionName: collection.name,
      manifest,
      counts: {
        colors: Object.keys(colors).length,
        textStyles: Object.keys(textStyles).length,
        spacing: Object.keys(spacing).length,
        radii: Object.keys(radii).length,
      },
    },
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
    a: 1,
  };
}
