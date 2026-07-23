// Validates an uploaded scan-report file before it ever touches storage.
// Never trusts the client-declared MIME type alone — every accepted file
// is also sniffed by its actual leading bytes, so a disguised extension
// (e.g. a zip renamed to .xml) is rejected regardless of what the browser
// claimed. Returns a typed result; never throws on a malformed upload.
import "server-only";
import { env } from "@/lib/env";
import type { ScanFileFormat } from "@/lib/types";

const ALLOWED_EXTENSIONS = new Set(["pdf", "txt", "csv", "json", "xml", "html", "htm"]);

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
  "application/octet-stream", // many scan tools export without a proper MIME type
]);

export type FileSignatureFormat = "pdf" | "zip" | "json" | "xml" | "html" | "text" | "unknown";

// Sniffs the actual file content rather than trusting the extension/MIME.
function sniffSignature(buffer: Buffer): FileSignatureFormat {
  if (buffer.length === 0) return "unknown";

  if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";

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
// "text" is compatible with every non-PDF format since scan-tool exports
// vary in how strictly they follow their own extension's syntax.
const COMPATIBLE_SIGNATURES: Record<string, FileSignatureFormat[]> = {
  pdf: ["pdf"],
  txt: ["text", "json", "xml", "html"],
  csv: ["text", "json"],
  json: ["json", "text"],
  xml: ["xml", "html", "text"],
  html: ["html", "xml", "text"],
  htm: ["html", "xml", "text"],
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
};

export function validateScanFile(
  buffer: Buffer,
  filename: string,
  declaredMimeType: string,
): FileValidationResult {
  if (buffer.length === 0) {
    return { ok: false, reason: "The uploaded file is empty." };
  }

  const maxBytes = env.scanFileMaxSizeBytes();
  if (buffer.length > maxBytes) {
    return {
      ok: false,
      reason: `The file exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB upload limit.`,
    };
  }

  const extension = extensionOf(filename);
  if (!extension || BLOCKED_EXTENSIONS.has(extension) || !ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      reason: "Unsupported file type. Supported formats: PDF, TXT, CSV, JSON, XML, HTML.",
    };
  }

  if (declaredMimeType && !ALLOWED_MIME_TYPES.has(declaredMimeType.toLowerCase())) {
    return { ok: false, reason: "Unsupported file type reported by the browser." };
  }

  const signature = sniffSignature(buffer);
  const compatible = COMPATIBLE_SIGNATURES[extension] ?? [];
  if (!compatible.includes(signature)) {
    return {
      ok: false,
      reason:
        "The file's contents don't match its extension. Please upload the original, unmodified scan report export.",
    };
  }

  return { ok: true, extension, signature, formatHint: EXTENSION_TO_FORMAT[extension] };
}
