import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import {
  collectStats,
  filterStatsByOccurrence,
  type CollectedStats,
  type TextStyleLike,
} from "../utils/ds-collect";
import {
  colorTokenName,
  spacingTokenName,
  radiusTokenName,
  sanitizeTokenName,
} from "../utils/ds-naming";
import { storeManifest, type DesignManifest } from "../utils/ds-manifest";

interface BulkExtractParams {
  nodeIds: string[];
  collectionName?: string;
  minOccurrences?: number;
  skipHidden?: boolean;
}

const COLLECTION_DEFAULT = "Design System";

/** Find a Variable collection by name, or create one with a default "Light" mode. */
async function findOrCreateCollection(name: string): Promise<VariableCollection> {
  const all = await figma.variables.getLocalVariableCollectionsAsync();
  const existing = all.find((c) => c.name === name);
  if (existing) return existing;
  const created = figma.variables.createVariableCollection(name);
  const defaultMode = created.modes[0]!.modeId;
  created.renameMode(defaultMode, "Light");
  return created;
}

/** Merge multiple CollectedStats into one (counts add up per key). */
function mergeStats(statsList: CollectedStats[]): CollectedStats {
  const merged: CollectedStats = {
    colors: new Map(),
    colorNodeIds: new Map(),
    paintStyles: new Map(),
    textStyles: [],
    spacing: new Map(),
    radii: new Map(),
    effects: new Map(),
  };
  for (const s of statsList) {
    for (const [k, v] of s.colors) merged.colors.set(k, (merged.colors.get(k) ?? 0) + v);
    for (const [k, v] of s.colorNodeIds) {
      const arr = merged.colorNodeIds.get(k) ?? [];
      if (arr.length < 5) arr.push(v);
      merged.colorNodeIds.set(k, arr);
    }
    for (const [k, v] of s.paintStyles) {
      const existing = merged.paintStyles.get(k);
      if (existing) existing.count += v.count;
      else merged.paintStyles.set(k, v);
    }
    for (const ts of s.textStyles) {
      const existing = merged.textStyles.find((t) => t.hash === ts.hash);
      if (existing) existing.count += ts.count;
      else merged.textStyles.push({ ...ts });
    }
    for (const [k, v] of s.spacing) merged.spacing.set(k, (merged.spacing.get(k) ?? 0) + v);
    for (const [k, v] of s.radii) merged.radii.set(k, (merged.radii.get(k) ?? 0) + v);
    for (const [k, v] of s.effects) {
      const existing = merged.effects.get(k);
      if (existing) existing.count += v.count;
      else merged.effects.set(k, v);
    }
  }
  return merged;
}

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as BulkExtractParams;
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return {
      type: request.type,
      requestId: request.requestId,
      error: { code: "VALIDATION_ERROR", message: "nodeIds is required and must be non-empty for extract_design_system_bulk" },
    };
  }

  const collectionName = params.collectionName ?? COLLECTION_DEFAULT;
  const minOccurrences = Math.max(1, params.minOccurrences ?? 1);
  const skipHidden = params.skipHidden ?? true;

  // 1. Collect stats from every node (sequential — these are sandbox calls).
  const allStats: CollectedStats[] = [];
  for (const nodeId of params.nodeIds) {
    let node: SceneNode;
    try {
      node = await resolveNode(nodeId);
    } catch (err) {
      return {
        type: request.type,
        requestId: request.requestId,
        error: { code: "NODE_NOT_FOUND", message: err instanceof Error ? err.message : String(err) },
      };
    }
    allStats.push(collectStats(node, { skipHidden }));
  }

  // 2. Merge + filter.
  const rawMerged = mergeStats(allStats);
  const stats = minOccurrences > 1
    ? filterStatsByOccurrence(rawMerged, minOccurrences)
    : rawMerged;

  // 3. Collection.
  const collection = await findOrCreateCollection(collectionName);
  const defaultMode = collection.modes[0]!.modeId;

  // 4. Create color variables.
  const colors: DesignManifest["colors"] = {};
  const colorVarNameCount = new Map<string, number>();
  for (const [hex] of stats.colors) {
    const { name: hueName, scale } = colorTokenName(hex);
    const baseName = `${hueName}/${scale}`;
    const occurrenceKey = `${baseName}@${hex}`;
    if (colorVarNameCount.get(occurrenceKey) !== undefined) continue;
    colorVarNameCount.set(occurrenceKey, 1);
    const allOccurrences = colorVarNameCount.get(baseName) ?? 0;
    const finalName = allOccurrences > 0 ? `${baseName}-${allOccurrences}` : baseName;
    colorVarNameCount.set(baseName, allOccurrences + 1);
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

  // 5. Text styles.
  const textStyles: DesignManifest["textStyles"] = {};
  for (const sample of stats.textStyles) {
    const size = typeof sample.style.fontSize === "number" ? sample.style.fontSize : 14;
    const family = typeof sample.style.fontName === "object"
      ? sample.style.fontName.family
      : "Inter";
    const weight = typeof sample.style.fontName === "object"
      ? sample.style.fontName.style
      : "Regular";
    const familySlug = sanitizeTokenName(family);
    const styleSlug = sanitizeTokenName(weight);
    const sizeSlug = String(Math.round(size));
    const styleName = `${familySlug}/${styleSlug}/${sizeSlug}`;
    const ts = figma.createTextStyle();
    ts.name = styleName;
    if (typeof sample.style.fontName === "object") {
      await figma.loadFontAsync(sample.style.fontName as FontName);
      ts.fontName = sample.style.fontName as FontName;
    }
    if (typeof sample.style.fontSize === "number") ts.fontSize = sample.style.fontSize;
    if (typeof sample.style.lineHeight !== "symbol") ts.lineHeight = sample.style.lineHeight as LineHeight;
    if (typeof sample.style.letterSpacing !== "symbol") ts.letterSpacing = sample.style.letterSpacing as LetterSpacing;
    if (typeof sample.style.textCase !== "symbol") ts.textCase = sample.style.textCase as TextCase;
    if (typeof sample.style.textDecoration !== "symbol") ts.textDecoration = sample.style.textDecoration as TextDecoration;
    textStyles[sample.hash] = {
      styleId: ts.id,
      styleName,
      family: familySlug,
      weight: styleSlug,
      size,
    };
  }

  // 6. Spacing & radius variables.
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

  // 7. Effect styles.
  const effects: DesignManifest["effects"] = {};
  let effectIndex = 0;
  for (const [, sample] of stats.effects) {
    const base = sample.effect.type.toLowerCase().replace(/_/g, "-");
    const styleName = effectIndex === 0 ? base : `${base}-${effectIndex + 1}`;
    const es = figma.createEffectStyle();
    es.name = styleName;
    es.effects = [sample.effect];
    effects[sample.hash] = { styleId: es.id, styleName, type: sample.effect.type };
    effectIndex++;
  }

  // 8. Persist.
  const manifest: DesignManifest = { colors, textStyles, spacing, radii, effects };
  const manifestId = await storeManifest(manifest);

  return {
    type: request.type,
    requestId: request.requestId,
    data: {
      manifestId,
      collectionId: collection.id,
      collectionName: collection.name,
      sourceNodeCount: params.nodeIds.length,
      manifest,
      counts: {
        colors: Object.keys(colors).length,
        textStyles: Object.keys(textStyles).length,
        spacing: Object.keys(spacing).length,
        radii: Object.keys(radii).length,
        effects: Object.keys(effects).length,
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
