import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

vi.mock("@/lib/env", () => ({
  env: { scanImageDownscaleMaxDimension: () => 2400 },
}));

// heic-convert is a WASM libheif decoder — real HEIC bytes aren't available
// in this environment, so this mock stands in for it, returning a real,
// sharp-decodable JPEG. This still exercises the real question these tests
// care about: does normalizeImage route heic/heif through heic-convert
// (rather than handing raw HEIC bytes straight to sharp, which can't decode
// them — see file-validation.ts's comment on why) and correctly treat its
// output as the source for the rest of the pipeline. Variable name is
// "mock"-prefixed because vitest's static hoisting only allows referencing
// outer variables from inside a vi.mock factory when they follow that
// convention.
const mockHeicConvert = vi.fn(async () =>
  sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 10, g: 20, b: 200 } } })
    .jpeg()
    .toBuffer(),
);
vi.mock("heic-convert", () => ({ default: () => mockHeicConvert() }));

const { normalizeImage } = await import("@/lib/scan-diagnostics/image-processing");

describe("normalizeImage", () => {
  it("downscales an oversized image to the configured max dimension, preserving aspect ratio", async () => {
    const buffer = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: { r: 120, g: 120, b: 120 } },
    })
      .jpeg()
      .toBuffer();

    const result = await normalizeImage(buffer, "jpg");

    expect(result.width).toBeLessThanOrEqual(2400);
    expect(result.height).toBeLessThanOrEqual(2400);
    expect(result.width / result.height).toBeCloseTo(4000 / 3000, 2);
  });

  it("never upscales an image smaller than the max dimension", async () => {
    const buffer = await sharp({
      create: { width: 100, height: 80, channels: 3, background: { r: 5, g: 5, b: 5 } },
    })
      .png()
      .toBuffer();

    const result = await normalizeImage(buffer, "png");

    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
  });

  it("outputs the format matching the declared format for non-HEIC images", async () => {
    const buffer = await sharp({
      create: { width: 50, height: 50, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .webp()
      .toBuffer();

    const result = await normalizeImage(buffer, "webp");

    expect(result.format).toBe("webp");
    expect(result.mediaType).toBe("image/webp");
  });

  it("bakes in EXIF orientation rather than leaving it for the caller to apply", async () => {
    // Orientation 6 = rotate 90deg clockwise for display. A 300x100 source
    // becomes 100x300 once sharp's .rotate() (auto-orient) bakes it into
    // the actual pixels, which is what Claude's vision API needs — it does
    // not read EXIF tags itself.
    const buffer = await sharp({
      create: { width: 300, height: 100, channels: 3, background: { r: 200, g: 0, b: 0 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await normalizeImage(buffer, "jpg");

    expect(result.width).toBe(100);
    expect(result.height).toBe(300);
  });

  it("routes HEIC input through heic-convert before sharp ever decodes it", async () => {
    mockHeicConvert.mockClear();
    // Arbitrary bytes — heic-convert is mocked, so sharp only ever sees the
    // mock's real-JPEG return value, never these raw bytes.
    const rawHeicBytes = Buffer.from([0, 0, 0, 0]);

    const result = await normalizeImage(rawHeicBytes, "heic");

    expect(mockHeicConvert).toHaveBeenCalledTimes(1);
    expect(result.format).toBe("jpeg");
    expect(result.mediaType).toBe("image/jpeg");
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it("routes HEIF input through heic-convert the same way as HEIC", async () => {
    mockHeicConvert.mockClear();
    const result = await normalizeImage(Buffer.from([1, 1, 1, 1]), "heif");

    expect(mockHeicConvert).toHaveBeenCalledTimes(1);
    expect(result.format).toBe("jpeg");
  });
});
