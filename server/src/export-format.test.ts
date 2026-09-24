import { describe, it, expect } from "vitest";
import {
  extensionForFormat,
  inferFormatFromPath,
  resolveExportFormat,
  wireFormatFor,
} from "./export-format.js";

describe("wireFormatFor", () => {
  it("passes every native format through untouched", () => {
    for (const format of ["PNG", "SVG", "JPG", "PDF"] as const) {
      expect(wireFormatFor(format), format).toBe(format);
    }
  });

  it("sends WEBP as PNG, since Figma cannot export webp", () => {
    expect(wireFormatFor("WEBP")).toBe("PNG");
  });
});

describe("extensionForFormat", () => {
  it("maps each format to its extension", () => {
    expect(extensionForFormat("PNG")).toBe("png");
    expect(extensionForFormat("SVG")).toBe("svg");
    expect(extensionForFormat("JPG")).toBe("jpg");
    expect(extensionForFormat("PDF")).toBe("pdf");
    expect(extensionForFormat("WEBP")).toBe("webp");
  });
});

describe("inferFormatFromPath", () => {
  it("reads the format off the extension, case-insensitively", () => {
    expect(inferFormatFromPath("out/shot.png")).toBe("PNG");
    expect(inferFormatFromPath("out/shot.SVG")).toBe("SVG");
    expect(inferFormatFromPath("out/shot.jpeg")).toBe("JPG");
    expect(inferFormatFromPath("out/shot.jpg")).toBe("JPG");
    expect(inferFormatFromPath("out/shot.pdf")).toBe("PDF");
    expect(inferFormatFromPath("out/shot.webp")).toBe("WEBP");
  });

  it("returns null when the extension says nothing", () => {
    expect(inferFormatFromPath("out/shot")).toBeNull();
    expect(inferFormatFromPath("out/shot.gif")).toBeNull();
    expect(inferFormatFromPath("out/shot.png.backup")).toBeNull();
  });
});

describe("resolveExportFormat", () => {
  it("lets an explicit format win when nothing contradicts it", () => {
    expect(resolveExportFormat("WEBP", "WEBP")).toBe("WEBP");
    expect(resolveExportFormat("WEBP", null)).toBe("WEBP");
    expect(resolveExportFormat(undefined, "WEBP")).toBe("WEBP");
  });

  it("falls back to PNG when neither is given", () => {
    expect(resolveExportFormat(undefined, null)).toBe("PNG");
  });

  it("refuses a format that contradicts the output path", () => {
    expect(() => resolveExportFormat("PNG", "WEBP")).toThrowError(
      /format PNG conflicts with outputPath extension \(WEBP\)/
    );
    expect(() => resolveExportFormat("WEBP", "PNG")).toThrowError(
      /format WEBP conflicts with outputPath extension \(PNG\)/
    );
  });
});
