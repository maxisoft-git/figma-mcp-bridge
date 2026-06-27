/**
 * Semantic design tokens.
 *
 * Map from semantic name → numeric value. Used to convert between
 * "use a medium gap" and the actual px value from the design system.
 *
 * - Defaults follow a Tailwind-style scale (4/8/12/16/24/32/48/64).
 * - `apply_design_system` with `aliasMapping: "semantic"` will rewrite
 *   spacing variables in nodes to their semantic equivalents.
 */

export type SemanticName = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";

export const SEMANTIC_SCALE: Record<SemanticName, number> = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
};

/** Find the closest semantic token for a numeric pixel value. */
export function nearestSemantic(value: number): SemanticName {
  let best: SemanticName = "md";
  let bestDelta = Math.abs(value - SEMANTIC_SCALE[best]);
  for (const [name, n] of Object.entries(SEMANTIC_SCALE) as Array<[SemanticName, number]>) {
    const delta = Math.abs(value - n);
    if (delta < bestDelta) {
      best = name;
      bestDelta = delta;
    }
  }
  return best;
}

/** Map value → semantic name (closest match). */
export function valueToSemantic(value: number): { name: SemanticName; px: number } {
  const name = nearestSemantic(value);
  return { name, px: SEMANTIC_SCALE[name] };
}

/** Validate that a string is one of the supported semantic names. */
export function isSemanticName(s: string): s is SemanticName {
  return Object.prototype.hasOwnProperty.call(SEMANTIC_SCALE, s);
}
