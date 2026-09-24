import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { CWEBP_MISSING_MESSAGE, encodeWebp } from "./webp.js";

/** CRC32 of a PNG chunk, the same table PNG itself uses. */
const crc32 = (buf: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/**
 * Builds a valid 1x1 opaque PNG, so the encoder under test has real input
 * without shipping a binary fixture.
 * @returns PNG bytes.
 */
const onePixelPng = (): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0); // width
  header.writeUInt32BE(1, 4); // height
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // Filter byte 0, then one RGBA pixel.
  const raw = Buffer.from([0, 255, 0, 0, 255]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

describe("encodeWebp", () => {
  it("encodes PNG bytes as a RIFF/WEBP container", async () => {
    const webp = await encodeWebp(onePixelPng());
    expect(webp.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(webp.subarray(8, 12).toString("ascii")).toBe("WEBP");
    // RIFF header carries the file length in its last field.
    expect(webp.readUInt32LE(4)).toBe(webp.length - 8);
  });

  it("names the fix when cwebp is not installed", async () => {
    await expect(
      encodeWebp(onePixelPng(), undefined, "cwebp-not-on-this-path")
    ).rejects.toThrowError(CWEBP_MISSING_MESSAGE);
  });

  it("reports a non-zero exit instead of returning broken bytes", async () => {
    await expect(
      encodeWebp(Buffer.from("not a png"), undefined, "cat")
    ).rejects.toThrowError(/cwebp exited with code/);
  });
});
