// Validates an uploaded scan-report file before it ever touches storage.
// Never trusts the client-declared MIME type alone — every accepted file
// is also sniffed by its actual leading bytes, so a disguised extension
// (e.g. a zip renamed to .xml) is rejected regardless of what the browser
// claimed. Returns a typed result; never throws on a malformed upload.
import "server-only";
import sharp from "sharp";
import { env } from "@/lib/env";
import type { ScanFileFormat } from "@/lib/types";

const ALLOWED_EXTENSIONS = new Set([
  "pdf", "txt", "csv", "json", "xml", "html", "htm",
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif",
]);

// Explicit denylist kept alongside the allowlist above (belt-and-suspenders):
// anything here is rejected even if somehow allow-listed elsewhere.
const BLOCKED_EXTENSIONS = new Set([
  "exe", "msi", "bat", "cmd", "sh", "ps1", "js", "mjs", "cjs", "jar", "apk",
  "dmg", "iso", "dll", "so", "zip", "rar", "7z", "gz", "tar",
  "docm", "xlsm", "pptm", "vbs", "scr", "com",
]);

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/json",
  "text/json",
  "application/xml",
  "text/xml",
  "text/html",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/octet-stream", // many scan tools/cameras export without a proper MIME type
]);

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);

export type FileSignatureFormat =
  | "pdf" | "zip" | "json" | "xml" | "html" | "text"
  | "jpeg" | "png" | "webp" | "gif" | "heic"
  | "unknown";

// Sniffs the actual file content rather than trusting the extension/MIME.
function sniffSignature(buffer: Buffer): FileSignatureFormat {
  if (buffer.length === 0) return "unknown";

  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";

  // JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A) — standard magic numbers.
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    return "png";
  }
  // WebP: "RIFF"....{"WEBP"} — bytes 0-4 and 8-12.
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "webp";
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("latin1"))) {
    return "gif";
  }
  // HEIC/HEIF: an ISOBMFF "ftyp" box (bytes 4-8) with a HEIC-family major
  // brand (bytes 8-12) — "avif"/"avis" (a different codec entirely, not
  // supported here) uses the exact same container and is deliberately
  // excluded so it isn't misidentified as HEIC.
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(brand)) {
      return "heic";
    }
  }

  // ZIP local-file-header magic number — catches docx/xlsx/actual zips
  // disguised under a text-format extension.
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  ) {
    return "zip";
  }

  const head = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf8").trimStart();
  if (head.startsWith("<?xml")) return "xml";
  if (/^<!doctype html/i.test(head) || /^<html[\s>]/i.test(head)) return "html";
  if (head.startsWith("{") || head.startsWith("[")) return "json";
  if (head.startsWith("<")) return "xml"; // untagged XML fragments (many scan-tool exports)

  // Reject binary-looking content masquerading as text: a real text/CSV
  // export shouldn't contain NUL bytes in its first chunk.
  if (buffer.subarray(0, Math.min(buffer.length, 512)).includes(0)) return "unknown";

  return "text";
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx + 1).toLowerCase();
}

// Which sniffed signatures are acceptable for a given claimed extension.
// "text" is compatible with every non-PDF text format since scan-tool
// exports vary in how strictly they follow their own extension's syntax.
// Images are strict (photo formats don't have this "loose export" problem).
const COMPATIBLE_SIGNATURES: Record<string, FileSignatureFormat[]> = {
  pdf: ["pdf"],
  txt: ["text", "json", "xml", "html"],
  csv: ["text", "json"],
  json: ["json", "text"],
  xml: ["xml", "html", "text"],
  html: ["html", "xml", "text"],
  htm: ["html", "xml", "text"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  png: ["png"],
  webp: ["webp"],
  gif: ["gif"],
  heic: ["heic"],
  heif: ["heic"],
};

export interface FileValidationOk {
  ok: true;
  extension: string;
  signature: FileSignatureFormat;
  formatHint: ScanFileFormat;
}

export interface FileValidationRejected {
  ok: false;
  reason: string;
}

export type FileValidationResult = FileValidationOk | FileValidationRejected;

const EXTENSION_TO_FORMAT: Record<string, ScanFileFormat> = {
  pdf: "pdf",
  txt: "txt",
  csv: "csv",
  json: "json",
  xml: "xml",
  html: "html",
  htm: "html",
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  gif: "gif",
  heic: "heic",
  heif: "heif",
};

// Async because jpg/png/webp/gif get a real decode-validity + pixel-
// dimension check via sharp — heic/heif deliberately do NOT (sharp's
// prebuilt binary only decodes AVIF under the "heif" format id, not actual
// HEIC/HEVC-coded files; see image-processing.ts, which uses heic-convert
// instead). A corrupt HEIC that passes the magic-byte check here is caught
// later, when image-processing.ts actually attempts the conversion —
// surfaced as a normal extraction failure, same as any other parser error.
export async function validateScanFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string,
  t: Record<string, string>,
): Promise<FileValidationResult> {
  if (buffer.length === 0) {
    return { ok: false, reason: t.fileEmpty };
  }

  const extension = extensionOf(filename);
  const isImage = IMAGE_EXTENSIONS.has(extension);

  const maxBytes = isImage ? env.scanImageMaxSizeBytes() : env.scanFileMaxSizeBytes();
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      reason: t.fileTooLargeLimit.replace("{maxMb}", String(Math.floor(maxBytes / (1024 * 1024)))),
    };
  }

  if (!extension || BLOCKED_EXTENSIONS.has(extension) || !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, reason: t.unsupportedFileType };
  }

  if (declaredMimeType && !ALLOWED_MIME_TYPES.has(declaredMimeType.toLowerCase())) {
    return { ok: false, reason: t.unsupportedMimeType };
  }

  const signature = sniffSignature(buffer);
  const compatible = COMPATIBLE_SIGNATURES[extension] ?? [];
  if (!compatible.includes(signature)) {
    return {
      ok: false,
      reason: isImage ? t.invalidImageFile : t.fileContentsMismatch,
    };
  }

  // Decode-validity + pixel-dimension check — jpg/png/webp/gif only (see
  // the function comment above for why heic/heif skip this).
  if (isImage && signature !== "heic") {
    const maxDimension = env.scanImageMaxPixelDimension();
    try {
      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) {
        return { ok: false, reason: t.imageUnreadable };
      }
      if (metadata.width > maxDimension || metadata.height > maxDimension) {
        return {
          ok: false,
          reason: t.imageResolutionTooLarge
            .replace("{width}", String(metadata.width))
            .replace("{height}", String(metadata.height)),
        };
      }
    } catch {
      return { ok: false, reason: t.imageCorrupted };
    }
  }

  return { ok: true, extension, signature, formatHint: EXTENSION_TO_FORMAT[extension] };
}
