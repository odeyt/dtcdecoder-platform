// Normalizes an uploaded photo before it's sent to Claude's vision API —
// everything here operates on in-memory Buffers only; nothing is ever
// written to a temp file, so there's nothing to clean up after the request
// completes (the buffer is simply garbage-collected).
//
// Three responsibilities, always applied together:
//   1. HEIC/HEIF -> JPEG conversion (Claude's vision API doesn't accept
//      HEIC/HEIF at all — only jpeg/png/gif/webp).
//   2. EXIF orientation correction (a phone photo's pixels are very often
//      stored "sideways" with an EXIF tag saying how to rotate it for
//      display — sharp's .rotate() with no argument reads that tag and
//      bakes the rotation into the pixels, which Claude's vision API does
//      NOT read on its own).
//   3. Downscale-only resize (bounds per-image token cost / request size)
//      plus metadata stripping (sharp's default behavior: EXIF/ICC/XMP are
//      dropped unless .withMetadata() is explicitly called, which this
//      never does) — "unnecessary metadata" here means everything beyond
//      the pixels themselves; nothing this app reads depends on it.
import "server-only";
import sharp from "sharp";
import heicConvert from "heic-convert";
import { env } from "@/lib/env";
import type { ScanFileFormat } from "@/lib/types";

export type NormalizedImageFormat = "jpeg" | "png" | "webp" | "gif";

export interface NormalizedImage {
  buffer: Buffer;
  mediaType: `image/${NormalizedImageFormat}`;
  format: NormalizedImageFormat;
  width: number;
  height: number;
}

// Claude's vision API's exact four accepted formats — see
// docs.anthropic.com's Messages API image content-block reference. Every
// other format this app accepts on upload (heic/heif) is converted to one
// of these before ever reaching that call.
function outputFormatFor(declaredFormat: ScanFileFormat): NormalizedImageFormat {
  switch (declaredFormat) {
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "gif":
      return "gif";
    case "jpg":
    case "heic":
    case "heif":
    default:
      return "jpeg";
  }
}

export async function normalizeImage(buffer: Buffer, declaredFormat: ScanFileFormat): Promise<NormalizedImage> {
  let decodable = buffer;

  // heic-convert is a WASM libheif decoder — sharp's own prebuilt binary
  // cannot decode actual HEIC/HEVC-coded files (its "heif" format id is
  // AVIF-only; see file-validation.ts's comment on why the pixel-dimension
  // pre-check skips heic/heif). This is the ONE place that gap is bridged.
  if (declaredFormat === "heic" || declaredFormat === "heif") {
    const converted = await heicConvert({ buffer: new Uint8Array(buffer), format: "JPEG", quality: 0.92 });
    decodable = Buffer.from(converted);
  }

  const outputFormat = outputFormatFor(declaredFormat);
  const maxDimension = env.scanImageDownscaleMaxDimension();

  // animated:false — a GIF/WebP source's later frames are irrelevant here;
  // Claude's vision API only ever sees one static image, so reading past
  // the first frame would just waste decode time.
  let pipeline = sharp(decodable, { animated: false })
    .rotate() // no-op when there's no EXIF orientation tag to apply
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });

  switch (outputFormat) {
    case "jpeg":
      pipeline = pipeline.jpeg({ quality: 90 });
      break;
    case "png":
      pipeline = pipeline.png();
      break;
    case "webp":
      pipeline = pipeline.webp({ quality: 90 });
      break;
    case "gif":
      pipeline = pipeline.gif();
      break;
  }

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    mediaType: `image/${outputFormat}`,
    format: outputFormat,
    width: info.width,
    height: info.height,
  };
}
