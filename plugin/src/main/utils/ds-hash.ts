/**
 * Stable hashes for design system objects.
 *
 * Used to match an existing paint / text style to its extracted
 * counterpart in the manifest. We hash the semantic content (not the
 * Figma node id) so the same value extracted from a different page
 * produces the same hash.
 */

import { normalizeHex } from "./ds-naming.js";

/** Stable string hash (FNV-1a 32-bit). Stable across runs, no deps. */
function fnv1a(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Hash a solid-color Paint. Ignores visibility (we filter those out). */
export function paintHash(paint: SolidPaint | Paint): string {
  if (paint.type === "SOLID") {
    const hex = normalizeHex(rgbToHex(paint.color));
    return `solid:${hex}`;
  }
  if (paint.type === "GRADIENT_LINEAR") {
    return `lin:${gradientStopsHash(paint.gradientStops)}`;
  }
  if (paint.type === "GRADIENT_RADIAL") {
    return `rad:${gradientStopsHash(paint.gradientStops)}`;
  }
  if (paint.type === "GRADIENT_ANGULAR") {
    return `ang:${gradientStopsHash(paint.gradientStops)}`;
  }
  if (paint.type === "GRADIENT_DIAMOND") {
    return `dia:${gradientStopsHash(paint.gradientStops)}`;
  }
  if (paint.type === "IMAGE") {
    return `img:${(paint as ImagePaint).imageHash}`;
  }
  return paint.type;
}

function gradientStopsHash(stops: readonly ColorStop[]): string {
  return stops
    .map((s) => `${normalizeHex(rgbToHex(s.color))}@${s.position.toFixed(3)}`)
    .join("|");
}

function rgbToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}

/** Hash a text style by its semantic properties (ignores node id / name). */
export function typographyHash(style: {
  fontName: FontName | typeof figma.mixed;
  fontSize: number | typeof figma.mixed;
  lineHeight: LineHeight | typeof figma.mixed;
  letterSpacing: LetterSpacing | typeof figma.mixed;
  textCase: TextCase | typeof figma.mixed;
  textDecoration: TextDecoration | typeof figma.mixed;
}): string {
  const family = typeof style.fontName === "symbol" ? "mixed" : style.fontName.family;
  const weight = typeof style.fontName === "symbol" ? "mixed" : style.fontName.style;
  const size = typeof style.fontSize === "symbol" ? "mixed" : style.fontSize.toFixed(2);
  const lh = lineHeightKey(style.lineHeight);
  const ls = letterSpacingKey(style.letterSpacing);
  return fnv1a(`text|${family}|${weight}|${size}|${lh}|${ls}`);
}

function lineHeightKey(lh: LineHeight | typeof figma.mixed): string {
  if (typeof lh === "symbol") return "lh-mixed";
  if ("value" in lh) return `lh-${lh.unit}-${lh.value.toFixed(2)}`;
  return `lh-${lh.unit}`;
}

function letterSpacingKey(ls: LetterSpacing | typeof figma.mixed): string {
  if (typeof ls === "symbol") return "ls-mixed";
  if ("value" in ls) return `ls-${ls.unit}-${ls.value.toFixed(2)}`;
  return `ls-${ls.unit}`;
}

/** Hash an Effect by its semantic properties (ignores node id / name). */
export function effectHash(effect: Effect): string {
  if (effect.type === "DROP_SHADOW" || effect.type === "INNER_SHADOW") {
    const { color, offset, radius, spread, blendMode, visible, showShadowBehindNode } = effect;
    const colorHex = normalizeHex(rgbToHex(color));
    return fnv1a(
      `shadow|${effect.type}|${colorHex}|${offset.x.toFixed(2)}|${offset.y.toFixed(2)}|${radius.toFixed(2)}|${(spread ?? 0).toFixed(2)}|${blendMode}|${visible}|${showShadowBehindNode ?? false}`,
    );
  }
  if (effect.type === "LAYER_BLUR" || effect.type === "BACKGROUND_BLUR") {
    const { radius, visible } = effect;
    return fnv1a(`blur|${effect.type}|${radius.toFixed(2)}|${visible}`);
  }
  return fnv1a(`effect|${effect.type}`);
}
