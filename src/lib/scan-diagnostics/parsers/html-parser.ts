import type { ScanReportParser, ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";

// Hand-rolled tag stripper — deliberately no DOM/cheerio dependency and no
// HTML rendering anywhere in this pipeline. Uploaded HTML is never
// rendered; only the plain text extracted here ever reaches the client.
const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

// Tags whose closing implies a line break, so DTC-per-line extraction
// (extractDtcCodesFromText scans line by line) still works on table/list
// markup instead of everything collapsing onto one line.
const BLOCK_CLOSE_PATTERN = /<\/(p|div|tr|li|h[1-6]|section|article)>/gi;
const LINE_BREAK_PATTERN = /<br\s*\/?>/gi;

function decodeEntities(text: string): string {
  let decoded = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    decoded = decoded.split(entity).join(char);
  }
  return decoded;
}

function stripHtmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(LINE_BREAK_PATTERN, "\n")
    .replace(BLOCK_CLOSE_PATTERN, "\n")
    .replace(/<[^>]+>/g, " ");

  text = decodeEntities(text);
  return text.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export const htmlParser: ScanReportParser = {
  id: "generic-html",
  version: "1.0.0",
  supportedFormats: ["html"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "html";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const plainText = stripHtmlToText(buffer.toString("utf8"));
    const report = buildParsedScanReportFromText(plainText);
    if (!plainText) {
      report.warnings.push("This HTML file had no extractable text content.");
    }
    return report;
  },
};
