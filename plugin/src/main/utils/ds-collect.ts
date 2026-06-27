/**
 * Recursive walk + frequency analysis for design system extraction.
 *
 * Collects:
 *   - Solid color paints  → Map<hex, count>
 *   - Text style props    → Map<typographyHash, { style, count, sample }>
 *   - Spacing values      → Map<value, count>  (from auto-layout padding/gap)
 *   - Radius values       → Map<value, count>  (from cornerRadius)
 */

import { paintHash, typographyHash, effectHash } from "./ds-hash.js";
import { normalizeHex } from "./ds-naming.js";

export interface CollectOptions {
  /** Skip nodes where `visible === false`. Default true. */
  skipHidden?: boolean;
  /** Only count occurrences ≥ this threshold. Default 1 (include all). */
  minOccurrences?: number;
}

export interface TextStyleSample {
  hash: string;
  style: TextStyleLike;
  count: number;
  /** First node id where this style was seen — useful for naming/debugging. */
  sampleNodeId: string;
}

export interface EffectSample {
  hash: string;
  effect: Effect;
  count: number;
  sampleNodeId: string;
}

export interface CollectedStats {
  /** hex (lowercase) → count of unique nodes using this color. */
  colors: Map<string, number>;
  /** hex → list of nodeIds (capped at 5 for memory). */
  colorNodeIds: Map<string, string[]>;
  /** paintHash → sample. */
  paintStyles: Map<string, { hash: string; paint: SolidPaint; count: number; sampleNodeId: string }>;
  /** typographyHash → sample. */
  textStyles: TextStyleSample[];
  /** value → count (auto-layout padding/gap). */
  spacing: Map<number, number>;
  /** value → count (corner radius). */
  radii: Map<number, number>;
  /** effectHash → sample. */
  effects: Map<string, EffectSample>;
}

export interface TextStyleLike {
  fontName: FontName | typeof figma.mixed;
  fontSize: number | typeof figma.mixed;
  lineHeight: LineHeight | typeof figma.mixed;
  letterSpacing: LetterSpacing | typeof figma.mixed;
  textCase: TextCase | typeof figma.mixed;
  textDecoration: TextDecoration | typeof figma.mixed;
}

const NODE_ID_SAMPLE_CAP = 5;

function bumpMap<V>(m: Map<V, number>, key: V): number {
  return (m.get(key) ?? 0) + 1;
}

function trackNodeIds(m: Map<string, string[]>, key: string, nodeId: string): void {
  const arr = m.get(key);
  if (!arr) {
    m.set(key, [nodeId]);
  } else if (arr.length < NODE_ID_SAMPLE_CAP) {
    arr.push(nodeId);
  }
}

/** Recursive walk that collects design-system stats. */
export function collectStats(
  root: SceneNode,
  options: CollectOptions = {},
): CollectedStats {
  const skipHidden = options.skipHidden ?? true;
  const result: CollectedStats = {
    colors: new Map(),
    colorNodeIds: new Map(),
    paintStyles: new Map(),
    textStyles: [],
    spacing: new Map(),
    radii: new Map(),
    effects: new Map(),
  };
  // Map hash → index in result.textStyles for dedup.
  const textStyleIndex = new Map<string, number>();

  walk(root, skipHidden);

  return result;

  function walk(node: SceneNode): void {
    if (skipHidden && node.visible === false) return;
    collectFromNode(node);
    if ("children" in node) {
      for (const child of (node as ChildrenMixin).children) {
        walk(child as SceneNode);
      }
    }
  }

  function collectFromNode(node: SceneNode): void {
    // Fills (colors + paint styles)
    if ("fills" in node) {
      const fills = (node as GeometryMixin).fills;
      if (Array.isArray(fills)) {
        for (const paint of fills as readonly Paint[]) {
          if (paint.type === "SOLID" && paint.visible !== false) {
            const hex = normalizeHex(rgbToHex(paint.color));
            bumpMap(result.colors, hex);
            trackNodeIds(result.colorNodeIds, hex, node.id);
            const hash = paintHash(paint);
            if (!result.paintStyles.has(hash)) {
              result.paintStyles.set(hash, {
                hash,
                paint: paint as SolidPaint,
                count: 0,
                sampleNodeId: node.id,
              });
            }
            result.paintStyles.get(hash)!.count++;
          }
        }
      }
    }

    // Typography (text styles)
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
      const idx = textStyleIndex.get(hash);
      if (idx === undefined) {
        textStyleIndex.set(hash, result.textStyles.length);
        result.textStyles.push({ hash, style, count: 1, sampleNodeId: node.id });
      } else {
        result.textStyles[idx]!.count++;
      }
    }

    // Corner radius
    if ("cornerRadius" in node) {
      const r = (node as RectangleMixin).cornerRadius;
      if (typeof r === "number") bumpMap(result.radii, r);
    } else if ("topLeftRadius" in node) {
      // Per-corner values (FrameNode): collect the max across the 4 corners.
      const f = node as FrameNode;
      const corners = [f.topLeftRadius, f.topRightRadius, f.bottomLeftRadius, f.bottomRightRadius];
      for (const c of corners) {
        if (typeof c === "number") bumpMap(result.radii, c);
      }
    }

    // Spacing (auto-layout padding + itemSpacing)
    if (node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE") {
      const f = node as FrameNode;
      if (f.layoutMode && f.layoutMode !== "NONE") {
        bumpMap(result.spacing, f.paddingTop);
        bumpMap(result.spacing, f.paddingBottom);
        bumpMap(result.spacing, f.paddingLeft);
        bumpMap(result.spacing, f.paddingRight);
        bumpMap(result.spacing, f.itemSpacing);
        if (f.layoutMode === "VERTICAL") {
          bumpMap(result.spacing, f.counterAxisSpacing);
        }
      }
    }

    // Effects (shadows, blurs)
    if ("effects" in node) {
      const effects = (node as BlendMixin).effects;
      if (Array.isArray(effects) && effects.length > 0) {
        for (const eff of effects as readonly Effect[]) {
          if (eff.visible === false) continue;
          const hash = effectHash(eff);
          const existing = result.effects.get(hash);
          if (existing) {
            existing.count++;
          } else {
            result.effects.set(hash, { hash, effect: eff, count: 1, sampleNodeId: node.id });
          }
        }
      }
    }
  }
}

function rgbToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

/** Filter stats by minimum occurrence count. */
export function filterStatsByOccurrence(
  stats: CollectedStats,
  minOccurrences: number,
): CollectedStats {
  const colors = new Map<string, number>();
  for (const [k, v] of stats.colors) if (v >= minOccurrences) colors.set(k, v);
  const paintStyles = new Map<string, CollectedStats["paintStyles"] extends Map<string, infer V> ? V : never>();
  for (const [k, v] of stats.paintStyles) if (v.count >= minOccurrences) paintStyles.set(k, v);
  const textStyles = stats.textStyles.filter((s) => s.count >= minOccurrences);
  const spacing = new Map<number, number>();
  for (const [k, v] of stats.spacing) if (v >= minOccurrences) spacing.set(k, v);
  const radii = new Map<number, number>();
  for (const [k, v] of stats.radii) if (v >= minOccurrences) radii.set(k, v);
  const effects = new Map<string, EffectSample>();
  for (const [k, v] of stats.effects) if (v.count >= minOccurrences) effects.set(k, v);
  return { colors, colorNodeIds: stats.colorNodeIds, paintStyles, textStyles, spacing, radii, effects };
}
