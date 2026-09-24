import path from "node:path";

/**
 * Export formats the tools accept.
 *
 * Figma's `exportAsync` emits PNG, SVG, JPG and PDF. WEBP is not one of them, so
 * a WEBP request is a PNG export the server re-encodes (see `webp.ts`).
 */
export type ExportFormat = "PNG" | "SVG" | "JPG" | "PDF" | "WEBP";

/** Formats Figma's `exportAsync` can produce on its own. */
export type WireExportFormat = Exclude<ExportFormat, "WEBP">;

/** Every accepted format, in the order the schemas list them. */
export const EXPORT_FORMATS = ["PNG", "SVG", "JPG", "PDF", "WEBP"] as const;

/** The extension each format is written with, without the leading dot. */
const EXTENSION_BY_FORMAT: Record<ExportFormat, string> = {
  PNG: "png",
  SVG: "svg",
  JPG: "jpg",
  PDF: "pdf",
  WEBP: "webp",
};

/** The format each file extension asks for. */
const FORMAT_BY_EXTENSION: Record<string, ExportFormat> = {
  ".png": "PNG",
  ".svg": "SVG",
  ".jpg": "JPG",
  ".jpeg": "JPG",
  ".pdf": "PDF",
  ".webp": "WEBP",
};

/**
 * Maps a requested format to the one the plugin should export.
 *
 * WEBP never reaches the plugin: Figma cannot export it, so the format travels
 * as PNG and the server encodes the result afterwards.
 * @param format - Format the caller asked for.
 * @returns Format to ask the plugin for.
 */
export function wireFormatFor(format: ExportFormat): WireExportFormat {
  return format === "WEBP" ? "PNG" : format;
}

/**
 * The file extension a format is written with.
 * @param format - The export format.
 * @returns Extension without the leading dot.
 */
export function extensionForFormat(format: ExportFormat): string {
  return EXTENSION_BY_FORMAT[format];
}

/**
 * Infers the export format from an output file's extension.
 * @param outputPath - Destination file path.
 * @returns The matching format, or null when the extension says nothing.
 */
export function inferFormatFromPath(outputPath: string): ExportFormat | null {
  return FORMAT_BY_EXTENSION[path.extname(outputPath).toLowerCase()] ?? null;
}

/**
 * Resolves the format to write with.
 *
 * An explicit format wins, an extension fills in when there is none, and the
 * two are refused together when they disagree — a `.webp` path asked for as PNG
 * would otherwise receive the wrong bytes silently.
 * @param format - Format the caller asked for, if any.
 * @param inferredFormat - Format the output path's extension implies, if any.
 * @returns The format to export with.
 */
export function resolveExportFormat(
  format: ExportFormat | undefined,
  inferredFormat: ExportFormat | null
): ExportFormat {
  if (format && inferredFormat && format !== inferredFormat) {
    throw new Error(
      `format ${format} conflicts with outputPath extension (${inferredFormat})`
    );
  }
  return format ?? inferredFormat ?? "PNG";
}
