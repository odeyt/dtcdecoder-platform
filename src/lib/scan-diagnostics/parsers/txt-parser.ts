import type { ScanReportParser, ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";

export const txtParser: ScanReportParser = {
  id: "generic-txt",
  version: "1.0.0",
  supportedFormats: ["txt"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "txt";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const text = buffer.toString("utf8");
    return buildParsedScanReportFromText(text);
  },
};
