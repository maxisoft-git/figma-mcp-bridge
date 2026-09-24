import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeSaveScreenshots, type ScreenshotSender } from "./tools.js";

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
