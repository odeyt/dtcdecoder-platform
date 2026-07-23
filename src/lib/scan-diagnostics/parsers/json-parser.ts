import type { ScanReportParser, ParsedScanReport, ParsedDtcCode } from "@/lib/scan-diagnostics/parsers/types";
import { emptyParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import {
  dedupeDtcCodes,
  extractDtcCodesFromText,
  extractVinFromText,
  normalizeDtcCode,
} from "@/lib/scan-diagnostics/parsers/dtc-extraction";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

// Recursively searches an arbitrary JSON tree for the first key whose name
// matches one of the given patterns, returning its value. Scan-tool JSON
// exports vary wildly in shape, so this is deliberately structure-agnostic
// rather than assuming a fixed schema.
function findValueByKey(node: JsonValue, patterns: RegExp[]): JsonValue | undefined {
  if (node === null || typeof node !== "object") return undefined;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findValueByKey(item, patterns);
      if (found !== undefined) return found;
    }
    return undefined;
  }

  for (const [key, value] of Object.entries(node)) {
    if (patterns.some((p) => p.test(key))) return value;
  }
  for (const value of Object.values(node)) {
    const found = findValueByKey(value, patterns);
    if (found !== undefined) return found;
  }
  return undefined;
}

function asString(value: JsonValue | undefined): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

function asNumber(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function asArray(value: JsonValue | undefined): JsonValue[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function extractDtcCodesFromArray(items: JsonValue[]): ParsedDtcCode[] {
  const results: ParsedDtcCode[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const code =
      asString(item.code) ?? asString(item.dtc) ?? asString(item.dtcCode) ?? asString(item.fault);
    if (!code) continue;
    results.push({
      code: normalizeDtcCode(code),
      module: asString(item.module) ?? asString(item.ecu) ?? asString(item.system),
      status: asString(item.status) ?? asString(item.state),
      descriptionRaw: asString(item.description) ?? asString(item.meaning) ?? asString(item.definition),
    });
  }
  return results;
}

function extractModulesFromArray(items: JsonValue[]): { name: string; status?: string }[] {
  const modules: { name: string; status?: string }[] = [];
  for (const item of items) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const name = asString(item.name) ?? asString(item.module) ?? asString(item.ecu);
    if (!name) continue;
    modules.push({ name, status: asString(item.status) });
  }
  return modules;
}

function asRecordArray(value: JsonValue[] | undefined): Record<string, unknown>[] {
  if (!value) return [];
  return value.filter(
    (v): v is { [key: string]: JsonValue } => v !== null && typeof v === "object" && !Array.isArray(v),
  ) as Record<string, unknown>[];
}

export const jsonParser: ScanReportParser = {
  id: "generic-json",
  version: "1.0.0",
  supportedFormats: ["json"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "json";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const text = buffer.toString("utf8");
    const report = emptyParsedScanReport();

    let data: JsonValue;
    try {
      data = JSON.parse(text);
    } catch {
      report.warnings.push("This file's contents could not be parsed as JSON; used a raw-text scan instead.");
      report.dtcCodes = dedupeDtcCodes(extractDtcCodesFromText(text));
      report.vin = extractVinFromText(text);
      return report;
    }

    report.vin = asString(findValueByKey(data, [/^vin$/i, /vehicle.?identification/i]));
    report.make = asString(findValueByKey(data, [/^make$/i, /^manufacturer$/i]));
    report.model = asString(findValueByKey(data, [/^model$/i]));
    report.modelYear = asNumber(findValueByKey(data, [/^(model.?)?year$/i]));
    report.engine = asString(findValueByKey(data, [/^engine$/i]));
    report.odometerMiles = asNumber(findValueByKey(data, [/^(odometer|mileage)$/i]));

    const dtcArray = asArray(findValueByKey(data, [/^dtcs?$/i, /codes/i, /faults?/i, /troubleCodes/i]));
    let dtcCodes = dtcArray ? extractDtcCodesFromArray(dtcArray) : [];
    if (dtcCodes.length === 0) {
      dtcCodes = extractDtcCodesFromText(text);
      if (dtcCodes.length > 0) {
        report.warnings.push("No dedicated DTC array found; codes were pattern-matched from raw text.");
      }
    }
    report.dtcCodes = dedupeDtcCodes(dtcCodes);

    const moduleArray = asArray(findValueByKey(data, [/^modules?$/i, /^ecus?$/i]));
    if (moduleArray) report.modules = extractModulesFromArray(moduleArray);

    report.freezeFrame = asRecordArray(asArray(findValueByKey(data, [/freeze.?frame/i])));
    report.liveData = asRecordArray(asArray(findValueByKey(data, [/live.?data/i])));

    if (!report.vin) report.vin = extractVinFromText(text);
    if (report.dtcCodes.length === 0) {
      report.warnings.push("No DTC codes were found in this JSON export.");
    }

    return report;
  },
};
