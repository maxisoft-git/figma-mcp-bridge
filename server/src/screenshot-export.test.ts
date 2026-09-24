import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  devImageContent,
  executeSaveScreenshots,
  screenshotContent,
  type ScreenshotSender,
} from "./tools.js";

/**
 * The repo's own logo, used as real PNG bytes so the export path is exercised
 * end to end without shipping a binary fixture.
 */
const logoBase64 = readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../logo.png"
  )
).toString("base64");

/** Inside the server cwd, which is what resolveAndValidateOutputPath allows. */
const outDir = path.resolve(".tmp-screenshot-export-test");

/**
 * A sender that answers every screenshot request with the logo as PNG, and
 * records the params it was asked for.
 * @param requests - Receives the params of each request.
 * @returns A sender for executeSaveScreenshots.
 */
const logoSender = (requests: Record<string, unknown>[]): ScreenshotSender => ({
  async sendWithParams(_requestType, _nodeIds, params) {
    requests.push(params ?? {});
    return {
      type: "get_screenshot",
      requestId: "test",
      data: {
        exports: [
          {
            nodeId: "1:2",
            nodeName: "Logo",
            format: "PNG",
            base64: logoBase64,
            width: 1376,
            height: 768,
          },
        ],
      },
    };
  },
});

afterAll(async () => {
  await rm(outDir, { recursive: true, force: true });
});

describe("executeSaveScreenshots", () => {
  it("asks the plugin for PNG and writes webp bytes for a WEBP request", async () => {
    const requests: Record<string, unknown>[] = [];
    const outputPath = path.join(".tmp-screenshot-export-test", "logo.webp");

    const result = await executeSaveScreenshots(
      logoSender(requests),
      [{ nodeId: "1:2", outputPath }],
      "WEBP"
    );

    expect(result.failed).toBe(0);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].format).toBe("WEBP");
    // WEBP never reaches the plugin: Figma cannot export it.
    expect(requests[0].format).toBe("PNG");

    const written = await readFile(path.join(outDir, "logo.webp"));
    expect(written.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(written.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(result.results[0].bytesWritten).toBe(written.length);
  });

  it("writes the plugin's bytes untouched when the format is native", async () => {
    const requests: Record<string, unknown>[] = [];
    const outputPath = path.join(".tmp-screenshot-export-test", "logo.png");

    const result = await executeSaveScreenshots(
      logoSender(requests),
      [{ nodeId: "1:2", outputPath }]
    );

    expect(result.failed).toBe(0);
    expect(requests[0].format).toBe("PNG");
    const written = await readFile(path.join(outDir, "logo.png"));
    expect(written.toString("base64")).toBe(logoBase64);
  });

  it("refuses a format that contradicts the output extension", async () => {
    const outputPath = path.join(".tmp-screenshot-export-test", "logo.webp");

    const result = await executeSaveScreenshots(
      logoSender([]),
      [{ nodeId: "1:2", outputPath, format: "PNG" }]
    );

    expect(result.failed).toBe(1);
    expect(result.hasErrors).toBe(true);
    expect(result.results[0].error).toMatch(
      /format PNG conflicts with outputPath extension \(WEBP\)/
    );
  });

  it("refuses to write outside the server working directory", async () => {
    const result = await executeSaveScreenshots(
      logoSender([]),
      [{ nodeId: "1:2", outputPath: path.join("..", "escape.png") }]
    );

    expect(result.failed).toBe(1);
    expect(result.results[0].error).toMatch(/must be inside/i);
  });
});

describe("screenshotContent", () => {
  /** screenshotContent appends the JSON metadata text part last. */
  const metaOf = (content: ReturnType<typeof screenshotContent>): unknown[] => {
    const last = content[content.length - 1];
    if (last.type !== "text") throw new Error("expected a trailing text metadata part");
    return JSON.parse(last.text);
  };

  it("returns raster exports as image content plus JSON metadata", () => {
    const content = screenshotContent({
      exports: [
        {
          nodeId: "1:2",
          nodeName: "Logo",
          format: "PNG",
          base64: logoBase64,
          width: 1376,
          height: 768,
        },
      ],
    });

    expect(content[0]).toEqual({
      type: "image",
      data: logoBase64,
      mimeType: "image/png",
    });
    const meta = metaOf(content);
    expect(meta).toHaveLength(1);
    expect(meta[0]).toMatchObject({ nodeId: "1:2", format: "PNG", bytes: expect.any(Number) });
  });

  it("returns SVG as decoded text source, not as an image", () => {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg'/>";
    const content = screenshotContent({
      exports: [
        {
          nodeId: "1:2",
          nodeName: "Icon",
          format: "SVG",
          base64: Buffer.from(svg).toString("base64"),
          width: 24,
          height: 24,
        },
      ],
    });

    expect(content[0]).toEqual({ type: "text", text: svg });
    expect(content.some((part) => part.type === "image")).toBe(false);
  });

  it("drops PDF bytes and leaves a note pointing at outputPath", () => {
    const content = screenshotContent({
      nodeId: "1:2",
      nodeName: "Doc",
      format: "PDF",
      base64: Buffer.from("%PDF-1.4").toString("base64"),
      width: 100,
      height: 100,
    });

    expect(content).toHaveLength(1);
    const meta = metaOf(content);
    expect((meta[0] as { note: string }).note).toMatch(/outputPath/);
  });
});

describe("devImageContent", () => {
  it("returns the bitmap as image content and metadata without base64", () => {
    const base64 = Buffer.from("jpeg").toString("base64");
    const content = devImageContent({
      nodeId: "1:2",
      nodeName: "Photo",
      nodeType: "RECTANGLE",
      mime: "image/jpeg",
      source: "node",
      scaleMode: "FILL",
      bytes: 4,
      base64,
    });

    expect(content[0]).toEqual({ type: "image", data: base64, mimeType: "image/jpeg" });
    const last = content[content.length - 1];
    if (last.type !== "text") throw new Error("expected a trailing text metadata part");
    const meta = JSON.parse(last.text);
    expect(meta).not.toHaveProperty("base64");
    expect(meta).toMatchObject({ nodeId: "1:2", source: "node" });
  });

  it("rejects a non-image mime instead of dumping base64 into the context", () => {
    expect(() =>
      devImageContent({ nodeId: "1:2", mime: "application/pdf", base64: "AAAA" })
    ).toThrow(/Unsupported dev image mime/);
  });
});
