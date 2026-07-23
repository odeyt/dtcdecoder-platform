import Papa from "papaparse";
import type { ScanReportParser, ParsedScanReport, ParsedDtcCode } from "@/lib/scan-diagnostics/parsers/types";
import { emptyParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import {
  dedupeDtcCodes,
  extractDtcCodesFromText,
  extractVinFromText,
  normalizeDtcCode,
} from "@/lib/scan-diagnostics/parsers/dtc-extraction";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";

function findColumn(headers: string[], pattern: RegExp): string | undefined {
  return headers.find((h) => pattern.test(h));
}

function firstNonEmpty(rows: Record<string, string>[], column: string | undefined): string | undefined {
  if (!column) return undefined;
  for (const row of rows) {
    const value = row[column]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const csvParser: ScanReportParser = {
  id: "generic-csv",
  version: "1.0.0",
  supportedFormats: ["csv"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "csv";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const text = buffer.toString("utf8");
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });

    const rows = parsed.data.filter((row) => row && Object.keys(row).length > 0);
    const report = emptyParsedScanReport();

    if (rows.length === 0 || parsed.meta.fields === undefined) {
      // No recognizable header row — fall back to a raw-text scan rather
      // than failing outright.
      const fallback = buildParsedScanReportFromText(text);
      fallback.warnings.push("CSV had no recognizable header row; used a raw-text scan instead.");
      return fallback;
    }

    const headers = parsed.meta.fields;
    const codeCol = findColumn(headers, /code|dtc|fault/i);
    const moduleCol = findColumn(headers, /module|ecu|system/i);
    const statusCol = findColumn(headers, /status|state/i);
    const descCol = findColumn(headers, /desc|meaning|definition/i);
    const vinCol = findColumn(headers, /^vin$/i) ?? findColumn(headers, /vehicle identification number/i);

    report.vin = firstNonEmpty(rows, vinCol) ?? extractVinFromText(text);

    let dtcCodes: ParsedDtcCode[] = [];
    if (codeCol) {
      for (const row of rows) {
        const rawCode = row[codeCol]?.trim();
        if (!rawCode) continue;
        dtcCodes.push({
          code: normalizeDtcCode(rawCode),
          module: moduleCol ? row[moduleCol]?.trim() || undefined : undefined,
          status: statusCol ? row[statusCol]?.trim() || undefined : undefined,
          descriptionRaw: descCol ? row[descCol]?.trim() || undefined : undefined,
        });
      }
    }

    if (dtcCodes.length === 0) {
      // The CSV had a header but no code-shaped column — scan every cell's
      // raw text as a fallback rather than reporting zero codes found.
      dtcCodes = extractDtcCodesFromText(text);
      if (dtcCodes.length > 0) {
        report.warnings.push("No dedicated DTC code column found; codes were pattern-matched from raw text.");
      }
    }

    report.dtcCodes = dedupeDtcCodes(dtcCodes);
    if (report.dtcCodes.length === 0) {
      report.warnings.push("No DTC codes were found in this CSV export.");
    }

    return report;
  },
};
