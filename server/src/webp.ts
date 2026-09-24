import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * WEBP encoding for the export tools.
 *
 * Figma's `exportAsync` cannot emit webp, so a WEBP request is a PNG export
 * re-encoded here with `cwebp` (libwebp) rather than a native image dependency,
 * which keeps the server dependency-free.
 */

/** Quality `cwebp` is asked for when the caller does not pick one. */
export const DEFAULT_WEBP_QUALITY = 82;

/** Error raised when libwebp is not installed, with the fix for each platform. */
export const CWEBP_MISSING_MESSAGE =
  "WEBP export needs the `cwebp` binary (libwebp), which was not found on PATH. " +
  "Install it (macOS: `brew install webp`, Debian/Ubuntu: `apt install webp`) " +
  "or export PNG/JPG instead.";

const isErrnoException = (err: unknown): err is NodeJS.ErrnoException =>
  err instanceof Error && "code" in err;

/**
 * Encodes PNG bytes as WEBP using the `cwebp` binary.
 * @param png - PNG bytes to encode.
 * @param quality - cwebp quality (0-100).
 * @param binary - Binary to run, injectable for tests.
 * @returns WEBP-encoded bytes.
 * @throws When `cwebp` is missing (with install instructions) or exits non-zero.
 */
export async function encodeWebp(
  png: Buffer,
  quality: number = DEFAULT_WEBP_QUALITY,
  binary = "cwebp"
): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "figma-bridge-webp-"));
  const src = path.join(dir, "in.png");
  const dst = path.join(dir, "out.webp");
  try {
    await writeFile(src, png);
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(binary, ["-quiet", "-q", String(quality), src, "-o", dst]);
      let stderr = "";
      proc.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      proc.on("error", (err) => {
        reject(
          isErrnoException(err) && err.code === "ENOENT"
            ? new Error(CWEBP_MISSING_MESSAGE)
            : err
        );
      });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `cwebp exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`
            )
          );
        }
      });
    });
    return await readFile(dst);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
