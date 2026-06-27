import type { ServerRequest, PluginResponse } from "../types";
import { resolveNode } from "../utils/dev-mode";
import { getManifest } from "../utils/ds-manifest";
import { paintHash, typographyHash, effectHash as effectHashLocal } from "../utils/ds-hash";
import { normalizeHex } from "../utils/ds-naming";
import type { TextStyleLike } from "../utils/ds-collect";

interface ApplyParams {
  manifestId: string;
  nodeIds: string[];
  options?: {
    dryRun?: boolean;
    skipMissing?: boolean;
  };
}

interface ApplyResult {
  applied: { fills: number; texts: number; radii: number };
  skipped: { fills: number; texts: number; radii: number };
  details?: Array<{
    nodeId: string;
    property: "fill" | "text" | "radius";
    originalValue: string;
    mappedTo: string;
  }>;
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

export async function handle(request: ServerRequest): Promise<PluginResponse> {
  const params = (request.params ?? {}) as ApplyParams;
  if (!params.manifestId) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "manifestId is required" } };
  }
  if (!params.nodeIds || params.nodeIds.length === 0) {
    return { type: request.type, requestId: request.requestId, error: { code: "VALIDATION_ERROR", message: "nodeIds is required" } };
  }
  const manifest = await getManifest(params.manifestId);
  if (!manifest) {
    return { type: request.type, requestId: request.requestId, error: { code: "NOT_FOUND", message: `Manifest not found: ${params.manifestId}` } };
  }

  const dryRun = params.options?.dryRun ?? false;
  const skipMissing = params.options?.skipMissing ?? false;
  const details: NonNullable<ApplyResult["details"]> = [];
  const counters = { applied: { fills: 0, texts: 0, radii: 0, effects: 0 }, skipped: { fills: 0, texts: 0, radii: 0, effects: 0 } };

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
    await walk(node, manifest, dryRun, skipMissing, counters, details);
  }

  const result: ApplyResult = {
    applied: counters.applied,
    skipped: counters.skipped,
  };
  result.applied.effects = counters.applied.effects;
  result.skipped.effects = counters.skipped.effects;
  if (dryRun) result.details = details;

  return { type: request.type, requestId: request.requestId, data: result };
}

async function walk(
  node: SceneNode,
  manifest: NonNullable<ReturnType<typeof getManifest>>,
  dryRun: boolean,
  skipMissing: boolean,
  counters: { applied: { fills: number; texts: number; radii: number }; skipped: { fills: number; texts: number; radii: number } },
  details: NonNullable<ApplyResult["details"]>,
): Promise<void> {
  await applyToNode(node, manifest, dryRun, skipMissing, counters, details);
  if ("children" in node) {
    for (const child of (node as ChildrenMixin).children) {
      await walk(child as SceneNode, manifest, dryRun, skipMissing, counters, details);
    }
  }
}

async function applyToNode(
  node: SceneNode,
  manifest: NonNullable<ReturnType<typeof getManifest>>,
  dryRun: boolean,
  skipMissing: boolean,
  counters: { applied: { fills: number; texts: number; radii: number }; skipped: { fills: number; texts: number; radii: number } },
  details: NonNullable<ApplyResult["details"]>,
): Promise<void> {
  // Fills
  if ("fills" in node) {
    const fills = (node as GeometryMixin).fills;
    if (Array.isArray(fills)) {
      for (const paint of fills as readonly Paint[]) {
        if (paint.type !== "SOLID") continue;
        const hex = normalizeHex(rgbToHex(paint.color));
        const colorVar = manifest.colors[hex];
        if (!colorVar) {
          if (!skipMissing) counters.skipped.fills++;
          continue;
        }
        if (dryRun) {
          details.push({ nodeId: node.id, property: "fill", originalValue: hex, mappedTo: colorVar.variableName });
        } else {
          try {
            const alias: VariableAlias = { type: "VARIABLE_ALIAS", id: colorVar.variableId };
            (node as GeometryMixin).setBoundVariable("fills", alias);
            counters.applied.fills++;
            details.push({ nodeId: node.id, property: "fill", originalValue: hex, mappedTo: colorVar.variableName });
          } catch {
            counters.skipped.fills++;
          }
        }
      }
    }
  }

  // Text styles
  if (node.type === "TEXT") {
    const text = node as TextNode;
    const style: TextStyleLike = {
      fontName: text.fontName as FontName | typeof figma.mixed,
      fontSize: text.fontSize as number | typeof figma.mixed,
      lineHeight: text.lineHeight as LineHeight | typeof figma.mixed,
      letterSpacing: text.letterSpacing as LetterSpacing | typeof figma.mixed,
      textCase: text.textCase as TextCase | typeof figma.mixed,
      textDecoration: text.textDecoration as TextDecoration | typeof figma.mixed,
    };
    const hash = typographyHash(style);
    const ts = manifest.textStyles[hash];
    if (!ts) {
      if (!skipMissing) counters.skipped.texts++;
    } else if (dryRun) {
      details.push({ nodeId: node.id, property: "text", originalValue: hash, mappedTo: ts.styleName });
    } else {
      try {
        await text.setTextStyleIdAsync(ts.styleId);
        counters.applied.texts++;
        details.push({ nodeId: node.id, property: "text", originalValue: hash, mappedTo: ts.styleName });
      } catch {
        counters.skipped.texts++;
      }
    }
  }

  // Effects (apply as EffectStyle — single style per node)
  if ("effects" in node) {
    const nodeEffects = (node as BlendMixin).effects;
    if (Array.isArray(nodeEffects) && nodeEffects.length > 0) {
      for (const eff of nodeEffects as readonly Effect[]) {
        if (eff.visible === false) continue;
        const hash = effectHashLocal(eff);
        const es = manifest.effects[hash];
        if (!es) {
          if (!skipMissing) counters.skipped.effects++;
          continue;
        }
        if (dryRun) {
          details.push({ nodeId: node.id, property: "effect", originalValue: eff.type, mappedTo: es.styleName });
        } else {
          try {
            (node as BlendMixin).effectStyleId = es.styleId;
            counters.applied.effects++;
            details.push({ nodeId: node.id, property: "effect", originalValue: eff.type, mappedTo: es.styleName });
          } catch {
            counters.skipped.effects++;
          }
        }
      }
    }
  }

  // Radii (per-corner for frames, single for rectangles)
  if ("topLeftRadius" in node) {
    const f = node as FrameNode;
    const corners = [
      ["topLeftRadius", f.topLeftRadius],
      ["topRightRadius", f.topRightRadius],
      ["bottomLeftRadius", f.bottomLeftRadius],
      ["bottomRightRadius", f.bottomRightRadius],
    ] as const;
    for (const [field, value] of corners) {
      if (typeof value !== "number") continue;
      const rad = manifest.radii[String(value)];
      if (!rad) {
        if (!skipMissing) counters.skipped.radii++;
        continue;
      }
      if (dryRun) {
        details.push({ nodeId: node.id, property: "radius", originalValue: String(value), mappedTo: rad.variableName });
      } else {
        try {
          (f as unknown as { setBoundVariable: (field: string, v: VariableAlias) => void }).setBoundVariable(
            field,
            { type: "VARIABLE_ALIAS", id: rad.variableId },
          );
          counters.applied.radii++;
          details.push({ nodeId: node.id, property: "radius", originalValue: String(value), mappedTo: rad.variableName });
        } catch {
          counters.skipped.radii++;
        }
      }
    }
  } else if ("cornerRadius" in node) {
    const value = (node as RectangleMixin).cornerRadius;
    if (typeof value === "number") {
      const rad = manifest.radii[String(value)];
      if (!rad) {
        if (!skipMissing) counters.skipped.radii++;
      } else if (dryRun) {
        details.push({ nodeId: node.id, property: "radius", originalValue: String(value), mappedTo: rad.variableName });
      } else {
        try {
          (node as RectangleMixin).setBoundVariable("topLeftRadius", { type: "VARIABLE_ALIAS", id: rad.variableId });
          counters.applied.radii++;
          details.push({ nodeId: node.id, property: "radius", originalValue: String(value), mappedTo: rad.variableName });
        } catch {
          counters.skipped.radii++;
        }
      }
    }
  }
}

function rgbToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}
