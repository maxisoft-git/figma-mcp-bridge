/**
 * Pure logic for building an SVG icon sprite from a list of icons.
 *
 * No Figma, no Node IO — everything is plain string manipulation so the
 * dedup algorithm can be unit-tested in isolation.
 *
 * Pipeline:
 *   1. Compute a content key for each icon (mode-dependent).
 *   2. Group icons by key. The first node in a group is the "kept" one.
 *   3. Sanitize node names into unique sprite IDs (kebab-case, deduped).
 *   4. Build the final <svg><symbol/></svg> document.
 */

export type DedupeMode = "raw" | "normalized" | "paths" | "none";
export type SpriteFormat = "symbol" | "g";
export type FillStrategy = "currentColor" | "preserve" | "black";

export interface IconInput {
  /** Original Figma node id. */
  nodeId: string;
  /** Raw node name (will be sanitized into a sprite id). */
  name: string;
  /** Icon bounding-box width in px. */
  width: number;
  /** Icon bounding-box height in px. */
  height: number;
  /** Raw SVG string as returned by figma `exportAsync({ format: "SVG_STRING" })`. */
  svg: string;
}

export interface IconGroup {
  /** Final sprite id (unique within the document). */
  spriteId: string;
  /** Number of source nodes collapsed into this group. */
  count: number;
  /** All node ids in this group (kept + duplicates). */
  nodeIds: string[];
  /** The source node whose name won the sprite id. */
  keptNodeId: string;
  /** The source name the sprite id was derived from. */
  keptName: string;
  /** Final width/height used for the symbol's viewBox. */
  width: number;
  height: number;
}

export interface BuildSpriteOptions {
  /** How to compare icons for equivalence. Default: "normalized". */
  dedupeMode?: DedupeMode;
  /** Output container shape. Default: "symbol". */
  spriteFormat?: SpriteFormat;
  /** How to set fill on the generated shapes. Default: "currentColor". */
  fillStrategy?: FillStrategy;
}

export interface BuildSpriteResult {
  sprite: string;
  totalFound: number;
  uniqueIcons: number;
  duplicatesRemoved: number;
  groups: IconGroup[];
}

/** FNV-1a 32-bit hash. Stable across runs, no dependencies. */
function fnv1a(s: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Lowercase, kebab-case, ASCII-only — drops everything else. */
export function sanitizeSpriteId(raw: string, fallbackPrefix = "i"): string {
  const ascii = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length === 0) return fallbackPrefix;
  if (!/^[a-z]/.test(ascii)) return `${fallbackPrefix}-${ascii}`;
  return ascii;
}

/**
 * Reduce an SVG to a comparable string for dedup. Strips:
 *  - xml prolog / metadata blocks / comments
 *  - paint-affecting attributes (fill, stroke, style, class, id, clip-path, mask, opacity)
 *  - xmlns declarations
 *  - whitespace
 * Path geometry (`d=`) and shape structure are preserved.
 */
export function normalizeSvg(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "")
    .replace(/\s+(fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|stroke-miterlimit|stroke-dasharray|stroke-opacity|fill-opacity|fill-rule|opacity|clip-path|mask|class|id|data-name)="[^"]*"/gi, "")
    .replace(/style="[^"]*"/gi, "")
    .replace(/xmlns(:\w+)?="[^"]*"/gi, "")
    .replace(/width="[^"]*"/gi, "")
    .replace(/height="[^"]*"/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Extract only the `d` attribute from <path> elements, then hash. */
export function extractPathData(svg: string): string {
  const out: string[] = [];
  const re = /<path\b[^>]*\bd="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    out.push(m[1]!);
  }
  return out.join("|");
}

function contentKey(icon: IconInput, mode: DedupeMode): string {
  // Include dimensions in the key so that a 16×16 and a 24×24 icon with
  // identical paths are kept as separate entries (they ARE different icons
  // for downstream consumers — different viewBoxes).
  const sizePrefix = `${Math.round(icon.width)}x${Math.round(icon.height)}`;
  switch (mode) {
    case "raw":
      return `${sizePrefix}|${icon.svg}`;
    case "paths":
      return `${sizePrefix}|${extractPathData(icon.svg)}`;
    case "normalized":
    default:
      return `${sizePrefix}|${normalizeSvg(icon.svg)}`;
  }
}

/** Extract the viewBox attribute from an SVG, defaulting to "0 0 W H". */
function viewBoxOf(svg: string, width: number, height: number): string {
  const m = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/i);
  if (m) return m[1]!.trim();
  return `0 0 ${width} ${height}`;
}

/** Extract just the inner content of the root <svg>...</svg>. */
function innerContent(svg: string): string {
  const m = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/i);
  if (!m) return svg;
  return m[1]!.trim();
}

/**
 * Apply a fill strategy to the inner SVG content by rewriting the first
 * `fill=` attribute on a <path> (or inserting one). This is intentionally
 * conservative: it only touches a single fill attribute per path so that
 * complex icons with mixed fills aren't mangled.
 */
function applyFill(inner: string, strategy: FillStrategy): string {
  if (strategy === "preserve") return inner;
  const targetFill = strategy === "black" ? "#000" : "currentColor";
  let replaced = false;
  const out = inner.replace(/<path\b([^>]*?)\sfill="[^"]*"/i, (_match, attrs: string) => {
    replaced = true;
    return `<path${attrs} fill="${targetFill}"`;
  });
  if (replaced) return out;
  // No fill on any path — add one to the first <path>.
  return inner.replace(/<path\b/i, `<path fill="${targetFill}"`);
}

interface MutableGroup {
  spriteId: string;
  count: number;
  nodeIds: string[];
  keptNodeId: string;
  keptName: string;
  width: number;
  height: number;
  representative: IconInput;
}

/**
 * Build a deduplicated SVG sprite from a list of icons.
 *
 * Strategy:
 *  - Group icons by their content key.
 *  - First icon in a group wins; remaining are counted as duplicates.
 *  - Sprite ids are derived from the kept icon's name (sanitized to
 *    kebab-case ASCII). Conflicts across groups (e.g. two different
 *    icons both named "edit") are resolved by suffixing -2, -3, ...
 *  - The generated sprite is a single <svg> document with one <symbol>
 *    (or <g>, per `spriteFormat`) per group.
 */
export function buildSprite(
  icons: IconInput[],
  options: BuildSpriteOptions = {},
): BuildSpriteResult {
  const dedupeMode = options.dedupeMode ?? "normalized";
  const spriteFormat = options.spriteFormat ?? "symbol";
  const fillStrategy = options.fillStrategy ?? "currentColor";

  const groups = new Map<string, MutableGroup>();
  const usedIds = new Set<string>();

  // Sort by name first so that the lowest-named duplicate wins the id.
  const sorted = [...icons].sort((a, b) => a.name.localeCompare(b.name));

  for (const icon of sorted) {
    // "none" disables content-based deduplication: every icon is its own
    // group (sprite). The caller asked for the raw export so they can
    // inspect / dedup themselves later.
    const key = dedupeMode === "none" ? `${icon.nodeId}::${icons.indexOf(icon)}` : contentKey(icon, dedupeMode);
    const existing = groups.get(key);
    if (existing && dedupeMode !== "none") {
      existing.count++;
      existing.nodeIds.push(icon.nodeId);
      continue;
    }
    const baseId = sanitizeSpriteId(icon.name);
    let spriteId = baseId;
    let n = 2;
    while (usedIds.has(spriteId)) {
      spriteId = `${baseId}-${n++}`;
    }
    usedIds.add(spriteId);
    groups.set(key, {
      spriteId,
      count: 1,
      nodeIds: [icon.nodeId],
      keptNodeId: icon.nodeId,
      keptName: icon.name,
      width: icon.width,
      height: icon.height,
      representative: icon,
    });
  }

  // Stable order: alphabetical by spriteId for deterministic output.
  const ordered = [...groups.values()].sort((a, b) => a.spriteId.localeCompare(b.spriteId));

  const totalFound = icons.length;
  const uniqueIcons = ordered.length;
  const duplicatesRemoved = totalFound - uniqueIcons;

  const body = ordered
    .map((g) => {
      const inner = innerContent(g.representative.svg);
      const painted = applyFill(inner, fillStrategy);
      const vb = viewBoxOf(g.representative.svg, g.width, g.height);
      if (spriteFormat === "g") {
        return `  <g id="${g.spriteId}">\n    ${painted}\n  </g>`;
      }
      return `  <symbol id="${g.spriteId}" viewBox="${vb}">\n    ${painted}\n  </symbol>`;
    })
    .join("\n");

  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">\n${body}\n</svg>\n`;

  return {
    sprite,
    totalFound,
    uniqueIcons,
    duplicatesRemoved,
    groups: ordered.map((g) => ({
      spriteId: g.spriteId,
      count: g.count,
      nodeIds: g.nodeIds,
      keptNodeId: g.keptNodeId,
      keptName: g.keptName,
      width: g.width,
      height: g.height,
    })),
  };
}
