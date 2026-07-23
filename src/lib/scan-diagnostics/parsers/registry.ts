import type { ScanFileFormat } from "@/lib/types";
import type { ParsedScanReport, ScanReportParser } from "@/lib/scan-diagnostics/parsers/types";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";
import { txtParser } from "@/lib/scan-diagnostics/parsers/txt-parser";
import { csvParser } from "@/lib/scan-diagnostics/parsers/csv-parser";
import { jsonParser } from "@/lib/scan-diagnostics/parsers/json-parser";

// Ordered by specificity: a future vendor-specific parser (Autel, Launch,
// ...) would be prepended here so its detect() gets first refusal before
// the generic format parsers below — no rewrite of runExtraction() needed
// to add one later.
export const PARSERS: ScanReportParser[] = [txtParser, csvParser, jsonParser];

export function selectParser(
  buffer: Buffer,
  declaredFormat: ScanFileFormat,
  filename: string,
): ScanReportParser | undefined {
  return PARSERS.find((parser) => parser.detect(buffer, declaredFormat, filename));
}

export interface ExtractionResult {
  parserId: string;
  parserVersion: string;
  report: ParsedScanReport;
}

// Never a hard failure: an unrecognized format or a parser that throws
// falls back to a raw-text DTC/VIN scan rather than blocking the user.
export async function runExtraction(
  buffer: Buffer,
  declaredFormat: ScanFileFormat,
  filename: string,
): Promise<ExtractionResult> {
  const parser = selectParser(buffer, declaredFormat, filename);

  if (!parser) {
    const report = buildParsedScanReportFromText(buffer.toString("utf8"));
    report.warnings.push("No dedicated parser matched this file; used a raw-text scan instead.");
    return { parserId: "generic-fallback", parserVersion: "1.0.0", report };
  }

  try {
    const report = await parser.parse(buffer);
    return { parserId: parser.id, parserVersion: parser.version, report };
  } catch (err) {
    console.error(`[scan-diagnostics] parser "${parser.id}" threw during parse`, err);
    const report = buildParsedScanReportFromText(buffer.toString("utf8"));
    report.warnings.push(
      `The ${parser.id} parser failed on this file; used a raw-text scan instead.`,
    );
    return { parserId: "generic-fallback", parserVersion: "1.0.0", report };
  }
}
