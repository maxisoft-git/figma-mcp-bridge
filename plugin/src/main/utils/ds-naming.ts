/**
 * Design System naming conventions.
 *
 * All tokens follow a Tailwind-style `{category}/{name}/{scale}` pattern
 * (e.g. `color/primary/500`, `text/heading/h1`, `spacing/4`).
 */

const HUE_NAMES: Array<{ name: string; hue: number; tolerance: number }> = [
  { name: "red",     hue: 0,   tolerance: 15 },
  { name: "orange",  hue: 30,  tolerance: 15 },
  { name: "amber",   hue: 45,  tolerance: 10 },
  { name: "yellow",  hue: 55,  tolerance: 10 },
  { name: "lime",    hue: 90,  tolerance: 20 },
  { name: "green",   hue: 140, tolerance: 30 },
  { name: "teal",    hue: 175, tolerance: 15 },
  { name: "cyan",    hue: 195, tolerance: 20 },
  { name: "sky",     hue: 210, tolerance: 15 },
  { name: "blue",    hue: 230, tolerance: 20 },
  { name: "indigo",  hue: 245, tolerance: 15 },
  { name: "violet",  hue: 270, tolerance: 20 },
  { name: "purple",  hue: 285, tolerance: 15 },
  { name: "fuchsia", hue: 320, tolerance: 20 },
  { name: "pink",    hue: 340, tolerance: 15 },
  { name: "rose",    hue: 355, tolerance: 15 },
];

/** Lightness bucket → Tailwind-style scale. */
const LIGHTNESS_BUCKETS: Array<{ maxL: number; scale: number }> = [
  { maxL: 8,   scale: 950 },
  { maxL: 18,  scale: 900 },
  { maxL: 28,  scale: 800 },
  { maxL: 38,  scale: 700 },
  { maxL: 48,  scale: 600 },
  { maxL: 58,  scale: 500 },
  { maxL: 68,  scale: 400 },
  { maxL: 78,  scale: 300 },
  { maxL: 88,  scale: 200 },
  { maxL: 95,  scale: 100 },
  { maxL: 101, scale: 50  },
];

/** Standard Tailwind spacing scale. */
const SPACING_SCALE = [0, 1, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128] as const;

/** Standard radius scale. */
const RADIUS_BUCKETS: Array<{ max: number; name: string }> = [
  { max: 0,   name: "none" },
  { max: 2,   name: "sm" },
  { max: 6,   name: "md" },
  { max: 12,  name: "lg" },
  { max: 24,  name: "xl" },
  { max: 32,  name: "2xl" },
  { max: Infinity, name: "full" },
];

/** RGB → HSL conversion. Returns h [0..360], s [0..100], l [0..100]. */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h: h % 360, s: s * 100, l: l * 100 };
}

/** #RRGGBB → [r,g,b] in 0..255. Throws on malformed input. */
export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim();
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Normalize hex to lowercase #rrggbb. */
export function normalizeHex(hex: string): string {
  const [r, g, b] = parseHex(hex);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Hue (0..360) → nearest Tailwind-style color name. */
function hueToName(hue: number): string {
  let best = HUE_NAMES[0]!;
  let bestDelta = 360;
  for (const candidate of HUE_NAMES) {
    const delta = Math.min(
      Math.abs(candidate.hue - hue),
      360 - Math.abs(candidate.hue - hue),
    );
    if (delta < bestDelta && delta <= candidate.tolerance) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.name;
}

/** Lightness (0..100) → Tailwind-style scale (50..950). */
function lightnessToScale(lightness: number): number {
  for (const bucket of LIGHTNESS_BUCKETS) {
    if (lightness <= bucket.maxL) return bucket.scale;
  }
  return 500;
}

/** Generate a Tailwind-style color name from a hex color. */
export function colorTokenName(hex: string): { name: string; scale: number } {
  const [r, g, b] = parseHex(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Near-grayscale → "neutral"
  if (s < 8) return { name: "neutral", scale: lightnessToScale(l) };
  return { name: hueToName(h), scale: lightnessToScale(l) };
}

/** Figma font style + size → Tailwind-style text name. */
export function textStyleName(
  fontFamily: string,
  fontStyle: string,
  size: number,
): { name: string; bucket: string; size: number } {
  const family = sanitizeTokenName(fontFamily.split(/[\s,]+/)[0] ?? "sans");
  const role = pickTextRole(fontStyle, size);
  return { name: `text/${role.path}/${role.tier}`, bucket: role.path, size: role.tier, family };
}

/** Pick "heading/body/caption" role and size tier from font style + size. */
function pickTextRole(style: string, size: number): { path: string; tier: string } {
  const lower = style.toLowerCase();
  const isBold = /bold|black|semibold|medium|heavy/i.test(lower);

  if (size >= 40) return { path: "heading", tier: "h1" };
  if (size >= 32) return { path: "heading", tier: "h2" };
  if (size >= 26) return { path: "heading", tier: "h3" };
  if (size >= 22) return { path: "heading", tier: "h4" };
  if (size >= 18) return { path: "heading", tier: "h5" };
  if (size >= 17) return { path: "heading", tier: "h6" };

  if (size <= 11) return { path: "caption", tier: isBold ? "sm" : "xs" };
  if (size <= 13) return { path: "caption", tier: "sm" };
  if (size <= 15) return { path: "body", tier: "sm" };
  return { path: "body", tier: "md" };
}

/** Snap a spacing value to the nearest Tailwind scale bucket. */
export function spacingTokenName(value: number): { name: string; value: number } {
  if (value < 0) {
    // Negative margins — keep sign, use the magnitude's bucket.
    const pos = spacingTokenName(-value);
    return { name: `-spacing/${pos.name.split("/")[1]}`, value };
  }
  let best = SPACING_SCALE[0]!;
  let bestDelta = Math.abs(value - best);
  for (const candidate of SPACING_SCALE) {
    const delta = Math.abs(value - candidate);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  // Use exact value for the variable, name reflects bucket.
  return { name: `spacing/${best}`, value };
}

/** Snap a corner radius to the nearest bucket. */
export function radiusTokenName(value: number): { name: string; value: number } {
  for (const bucket of RADIUS_BUCKETS) {
    if (value <= bucket.max) {
      if (value === 0) return { name: "radius/none", value };
      return { name: `radius/${bucket.name}`, value };
    }
  }
  return { name: "radius/full", value };
}

/** Sanitize a string for use in a Figma token name (no slashes, lowercase). */
export function sanitizeTokenName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64) || "untitled";
}
