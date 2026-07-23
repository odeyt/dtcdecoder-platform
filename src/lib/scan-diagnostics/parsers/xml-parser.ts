import { XMLParser, XMLValidator } from "fast-xml-parser";
import type { ScanReportParser, ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";

// fast-xml-parser is a pure state-machine parser with no filesystem/network
// access, so it can't itself fetch an external DTD/entity — but a
// DOCTYPE-declared internal entity expansion ("billion laughs") is still a
// cheap DoS to construct, so any DOCTYPE block is stripped before parsing
// as defense in depth, regardless of what the library actually supports.
function stripDoctype(xml: string): string {
  return xml.replace(/<!DOCTYPE[^[>]*(\[[\s\S]*?\])?>/gi, "");
}

function flattenXmlText(node: unknown, acc: string[]): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    acc.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) flattenXmlText(item, acc);
    return;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) flattenXmlText(value, acc);
  }
}

export const xmlParser: ScanReportParser = {
  id: "generic-xml",
  version: "1.0.0",
  supportedFormats: ["xml"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "xml";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const raw = buffer.toString("utf8");
    const sanitized = stripDoctype(raw);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      processEntities: true,
      allowBooleanAttributes: true,
    });

    let plainText: string;
    // fast-xml-parser's XMLParser is lenient and can silently drop
    // malformed fragments (e.g. an unclosed tag) rather than throwing, so
    // structure is validated up front — invalid XML falls straight through
    // to a raw-text scan instead of risking silently-dropped DTC content.
    if (XMLValidator.validate(sanitized) !== true) {
      plainText = sanitized;
    } else {
      try {
        const parsed = parser.parse(sanitized) as unknown;
        const parts: string[] = [];
        flattenXmlText(parsed, parts);
        plainText = parts.join("\n");
      } catch {
        plainText = sanitized;
      }
    }

    const report = buildParsedScanReportFromText(plainText);
    if (!plainText.trim()) {
      report.warnings.push("This XML file had no extractable text content.");
    }
    return report;
  },
};
