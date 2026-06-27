import { describe, it, expect } from "vitest";
import {
  parseHex,
  normalizeHex,
  colorTokenName,
  textStyleName,
  spacingTokenName,
  radiusTokenName,
  sanitizeTokenName,
} from "./ds-naming.js";

describe("parseHex / normalizeHex", () => {
  it("parses valid 6-digit hex", () => {
    expect(parseHex("#FF0000")).toEqual([255, 0, 0]);
    expect(parseHex("00ff00")).toEqual([0, 255, 0]);
    expect(parseHex("  #0000FF  ")).toEqual([0, 0, 255]);
  });

  it("throws on malformed hex", () => {
    expect(() => parseHex("red")).toThrow();
    expect(() => parseHex("#FFF")).toThrow();
    expect(() => parseHex("#GGGGGG")).toThrow();
  });

  it("normalizeHex returns lowercase #rrggbb", () => {
    expect(normalizeHex("#FF0000")).toBe("#ff0000");
    expect(normalizeHex("aabbcc")).toBe("#aabbcc");
  });
});

describe("colorTokenName (HSL bucket)", () => {
  it("returns neutral/50 for near-black", () => {
    const { name, scale } = colorTokenName("#101010");
    expect(name).toBe("neutral");
    expect(scale).toBe(950);
  });

  it("returns neutral/50 for near-white (high lightness, low sat)", () => {
    const { name, scale } = colorTokenName("#fafafa");
    expect(name).toBe("neutral");
    expect(scale).toBe(50);
  });

  it("returns a blue-family name for a mid blue", () => {
    const { name, scale } = colorTokenName("#3b82f6");
    expect(["blue", "sky"]).toContain(name);
    expect(scale).toBeGreaterThanOrEqual(400);
    expect(scale).toBeLessThanOrEqual(600);
  });

  it("returns a red-family name for a mid red", () => {
    const { name, scale } = colorTokenName("#ef4444");
    expect(["red", "rose"]).toContain(name);
    expect(scale).toBeGreaterThanOrEqual(300);
    expect(scale).toBeLessThanOrEqual(600);
  });

  it("returns a green-family name for a mid green", () => {
    const { name, scale } = colorTokenName("#22c55e");
    expect(["green", "lime", "emerald"]).toContain(name);
    expect(scale).toBeGreaterThanOrEqual(400);
    expect(scale).toBeLessThanOrEqual(600);
  });
});

describe("textStyleName (size tiers)", () => {
  it("h1 for >= 40", () => {
    const { bucket, size } = textStyleName("Inter", "Bold", 48);
    expect(bucket).toBe("heading");
    expect(size).toBe("h1");
  });

  it("h3 for 26-31", () => {
    const { size } = textStyleName("Inter", "Regular", 28);
    expect(size).toBe("h3");
  });

  it("h5 for 18, h6 for 17, body/md for 16", () => {
    const { size: s18 } = textStyleName("Inter", "Regular", 18);
    expect(s18).toBe("h5");
    const { size: s17 } = textStyleName("Inter", "Regular", 17);
    expect(s17).toBe("h6");
    const { size: s16 } = textStyleName("Inter", "Regular", 16);
    expect(s16).toBe("md");
  });

  it("caption/xs for <= 11", () => {
    const { bucket, size } = textStyleName("Inter", "Regular", 10);
    expect(bucket).toBe("caption");
    expect(size).toBe("xs");
  });
});

describe("spacingTokenName (Tailwind scale)", () => {
  it("snaps 4 to spacing/4", () => {
    expect(spacingTokenName(4).name).toBe("spacing/4");
  });
  it("snaps 8 to spacing/8", () => {
    expect(spacingTokenName(8).name).toBe("spacing/8");
  });
  it("snaps 16 to spacing/16", () => {
    expect(spacingTokenName(16).name).toBe("spacing/16");
  });
  it("snaps 3 to spacing/2 (nearest of 2 vs 4)", () => {
    expect(spacingTokenName(3).name).toBe("spacing/2");
  });
  it("snaps 100 to spacing/96", () => {
    expect(spacingTokenName(100).name).toBe("spacing/96");
  });
  it("handles negative values", () => {
    expect(spacingTokenName(-8).name).toBe("-spacing/8");
  });
});

describe("radiusTokenName (buckets)", () => {
  it("0 → radius/none", () => {
    expect(radiusTokenName(0).name).toBe("radius/none");
  });
  it("2 → radius/sm", () => {
    expect(radiusTokenName(2).name).toBe("radius/sm");
  });
  it("6 → radius/md", () => {
    expect(radiusTokenName(6).name).toBe("radius/md");
  });
  it("12 → radius/lg", () => {
    expect(radiusTokenName(12).name).toBe("radius/lg");
  });
  it("999 → radius/full", () => {
    expect(radiusTokenName(999).name).toBe("radius/full");
  });
});

describe("sanitizeTokenName", () => {
  it("lowercases and strips spaces", () => {
    expect(sanitizeTokenName("Inter Bold")).toBe("inter-bold");
  });
  it("collapses runs of separators", () => {
    expect(sanitizeTokenName("Foo  --  Bar")).toBe("foo-bar");
  });
  it("returns 'untitled' for empty input", () => {
    expect(sanitizeTokenName("")).toBe("untitled");
    expect(sanitizeTokenName("!!!")).toBe("untitled");
  });
  it("strips leading/trailing hyphens", () => {
    expect(sanitizeTokenName("---foo---")).toBe("foo");
  });
});
