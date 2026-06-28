import { describe, it, expect } from "vitest";
import {
  buildSprite,
  normalizeSvg,
  extractPathData,
  sanitizeSpriteId,
  type IconInput,
} from "./sprite.js";

function svg(width: number, height: number, paths: string[], fill?: string): string {
  const fillAttr = fill ? ` fill="${fill}"` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    ...paths.map((d) => `  <path${fillAttr} d="${d}"/>`),
    `</svg>`,
  ].join("\n");
}

describe("sanitizeSpriteId", () => {
  it("lowercases and kebab-cases input", () => {
    expect(sanitizeSpriteId("Edit Icon")).toBe("edit-icon");
    expect(sanitizeSpriteId("ic-24/edit")).toBe("ic-24-edit");
    expect(sanitizeSpriteId("Icon/24/Trash_Filled")).toBe("icon-24-trash-filled");
  });

  it("strips diacritics", () => {
    expect(sanitizeSpriteId("café")).toBe("cafe");
    expect(sanitizeSpriteId("naïve")).toBe("naive");
  });

  it("falls back when input is empty or non-ASCII", () => {
    expect(sanitizeSpriteId("")).toBe("i");
    expect(sanitizeSpriteId("---")).toBe("i");
    expect(sanitizeSpriteId("123")).toBe("i-123");
  });

  it("keeps leading letter for non-conforming input", () => {
    expect(sanitizeSpriteId("9-patch")).toBe("i-9-patch");
  });
});

describe("normalizeSvg", () => {
  it("strips fill, style, and whitespace differences", () => {
    const a = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="#000" d="M1 1"/></svg>`;
    const b = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="#FFF" style="opacity:1" d="M1 1"/></svg>`;
    expect(normalizeSvg(a)).toBe(normalizeSvg(b));
  });

  it("preserves path geometry differences", () => {
    const a = svg(24, 24, ["M1 1"]);
    const b = svg(24, 24, ["M2 2"]);
    expect(normalizeSvg(a)).not.toBe(normalizeSvg(b));
  });

  it("strips comments and metadata", () => {
    const a = `<svg xmlns="http://www.w3.org/2000/svg"><!-- hi --><metadata>x</metadata><path d="M1 1"/></svg>`;
    const result = normalizeSvg(a);
    expect(result).not.toContain("hi");
    expect(result).not.toContain("metadata");
  });
});

describe("extractPathData", () => {
  it("joins all path d attributes with |", () => {
    const s = `<svg><path d="M1 1"/><path d="M2 2"/><rect x="0" y="0" width="10" height="10"/></svg>`;
    expect(extractPathData(s)).toBe("M1 1|M2 2");
  });

  it("returns empty string when no paths", () => {
    expect(extractPathData(`<svg><rect/></svg>`)).toBe("");
  });
});

describe("buildSprite", () => {
  const baseIcon = (name: string, paths: string[], overrides: Partial<IconInput> = {}): IconInput => ({
    nodeId: `1:${name}`,
    name,
    width: 24,
    height: 24,
    svg: svg(24, 24, paths, "#000"),
    ...overrides,
  });

  it("returns empty sprite for empty input", () => {
    const r = buildSprite([]);
    expect(r.totalFound).toBe(0);
    expect(r.uniqueIcons).toBe(0);
    expect(r.duplicatesRemoved).toBe(0);
    expect(r.groups).toEqual([]);
    expect(r.sprite).toContain("<svg");
    expect(r.sprite).toContain("</svg>");
  });

  it("deduplicates icons with identical SVG (raw mode)", () => {
    const icons = [
      baseIcon("edit", ["M1 1"], { nodeId: "1:a" }),
      baseIcon("edit-2", ["M1 1"], { nodeId: "1:b" }),
      baseIcon("edit-3", ["M1 1"], { nodeId: "1:c" }),
    ];
    const r = buildSprite(icons, { dedupeMode: "raw" });
    expect(r.totalFound).toBe(3);
    expect(r.uniqueIcons).toBe(1);
    expect(r.duplicatesRemoved).toBe(2);
    expect(r.groups[0]!.count).toBe(3);
    expect(r.groups[0]!.nodeIds).toEqual(["1:a", "1:b", "1:c"]);
  });

  it("normalizes fill differences (default normalized mode)", () => {
    const a = baseIcon("trash", ["M2 2"], { svg: svg(24, 24, ["M2 2"], "#000") });
    const b = baseIcon("trash-white", ["M2 2"], { svg: svg(24, 24, ["M2 2"], "#FFF") });
    const r = buildSprite([a, b]);
    expect(r.uniqueIcons).toBe(1);
    expect(r.duplicatesRemoved).toBe(1);
  });

  it("normalized mode does NOT collapse different geometries", () => {
    const a = baseIcon("a", ["M1 1"]);
    const b = baseIcon("b", ["M2 2"]);
    const r = buildSprite([a, b]);
    expect(r.uniqueIcons).toBe(2);
  });

  it("none mode keeps every icon as its own sprite, no content dedup", () => {
    const a = baseIcon("edit", ["M1 1"], { nodeId: "1:a" });
    const b = baseIcon("edit-2", ["M1 1"], { nodeId: "1:b" });
    const c = baseIcon("edit-3", ["M1 1"], { nodeId: "1:c" });
    const r = buildSprite([a, b, c], { dedupeMode: "none" });
    expect(r.totalFound).toBe(3);
    expect(r.uniqueIcons).toBe(3);
    expect(r.duplicatesRemoved).toBe(0);
    const ids = r.groups.map((g) => g.spriteId).sort();
    expect(ids).toEqual(["edit", "edit-2", "edit-3"]);
  });

  it("none mode still auto-numbers name collisions", () => {
    const a = baseIcon("same", ["M1 1"], { nodeId: "1:a" });
    const b = baseIcon("same", ["M2 2"], { nodeId: "1:b" });
    const r = buildSprite([a, b], { dedupeMode: "none" });
    expect(r.uniqueIcons).toBe(2);
    const ids = r.groups.map((g) => g.spriteId).sort();
    expect(ids).toEqual(["same", "same-2"]);
  });

  it("paths mode collapses icons that share path data but differ in wrapper", () => {
    const a = baseIcon("a", ["M1 1"], { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><g transform="translate(0,0)"><path d="M1 1"/></g></svg>` });
    const b = baseIcon("b", ["M1 1"], { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M1 1"/></svg>` });
    const r = buildSprite([a, b], { dedupeMode: "paths" });
    expect(r.uniqueIcons).toBe(1);
  });

  it("treats 16x16 and 24x24 icons as separate (different viewBox)", () => {
    const a = baseIcon("a", ["M1 1"], { width: 16, height: 16, svg: svg(16, 16, ["M1 1"]) });
    const b = baseIcon("a-large", ["M1 1"], { width: 24, height: 24, svg: svg(24, 24, ["M1 1"]) });
    const r = buildSprite([a, b]);
    expect(r.uniqueIcons).toBe(2);
  });

  it("generates unique sprite ids when source names collide", () => {
    // Two distinct icons both named "edit" (different geometry).
    const a = baseIcon("edit", ["M1 1"]);
    const b = baseIcon("edit", ["M2 2"]);
    const r = buildSprite([a, b]);
    expect(r.uniqueIcons).toBe(2);
    const ids = r.groups.map((g) => g.spriteId).sort();
    expect(ids).toEqual(["edit", "edit-2"]);
  });

  it("outputs symbols by default", () => {
    const r = buildSprite([baseIcon("foo", ["M1 1"])]);
    expect(r.sprite).toContain("<symbol id=\"foo\" viewBox=\"0 0 24 24\">");
    expect(r.sprite).not.toContain("<g id=\"foo\">");
  });

  it("outputs groups when spriteFormat=g", () => {
    const r = buildSprite([baseIcon("foo", ["M1 1"])], { spriteFormat: "g" });
    expect(r.sprite).toContain("<g id=\"foo\">");
    expect(r.sprite).not.toContain("<symbol");
  });

  it("replaces path fill with currentColor by default", () => {
    const r = buildSprite([baseIcon("foo", ["M1 1"], { svg: svg(24, 24, ["M1 1"], "#000") })]);
    expect(r.sprite).toContain(`fill="currentColor"`);
    expect(r.sprite).not.toContain(`fill="#000"`);
  });

  it("preserves fills when fillStrategy=preserve", () => {
    const r = buildSprite([baseIcon("foo", ["M1 1"], { svg: svg(24, 24, ["M1 1"], "#abcdef") })], {
      fillStrategy: "preserve",
    });
    expect(r.sprite).toContain(`fill="#abcdef"`);
  });

  it("uses #000 when fillStrategy=black", () => {
    const r = buildSprite([baseIcon("foo", ["M1 1"], { svg: svg(24, 24, ["M1 1"], "#fff") })], {
      fillStrategy: "black",
    });
    expect(r.sprite).toContain(`fill="#000"`);
  });

  it("preserves a viewBox from the source SVG", () => {
    const customViewBox = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M1 1"/></svg>`;
    const r = buildSprite([baseIcon("foo", ["M1 1"], { width: 32, height: 32, svg: customViewBox })]);
    expect(r.sprite).toContain(`viewBox="0 0 32 32"`);
  });

  it("groups are sorted alphabetically for stable output", () => {
    const r = buildSprite([
      baseIcon("zebra", ["M1 1"]),
      baseIcon("alpha", ["M1 2"]),
      baseIcon("mango", ["M1 3"]),
    ]);
    const ids = r.groups.map((g) => g.spriteId);
    expect(ids).toEqual(["alpha", "mango", "zebra"]);
  });

  it("output is a valid (well-formed) SVG document", () => {
    const r = buildSprite([
      baseIcon("a", ["M1 1"]),
      baseIcon("b", ["M2 2"]),
    ]);
    expect(r.sprite.startsWith("<svg")).toBe(true);
    expect(r.sprite.endsWith("</svg>\n")).toBe(true);
    const symbolCount = (r.sprite.match(/<symbol /g) ?? []).length;
    expect(symbolCount).toBe(2);
  });
});
