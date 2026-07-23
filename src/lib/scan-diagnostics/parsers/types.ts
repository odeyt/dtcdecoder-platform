import type { ScanFileFormat } from "@/lib/types";

export interface ParsedDtcCode {
  module?: string;
  code: string;
  status?: string;
  descriptionRaw?: string;
}

// Everything a parser is able to extract, before any user review. Never
// contains fabricated data — a missing field is `undefined`/empty, not a
// guess.
export interface ParsedScanReport {
  vin?: string;
  make?: string;
  model?: string;
  modelYear?: number;
  engine?: string;
  odometerMiles?: number;
  modules: { name: string; status?: string }[];
  dtcCodes: ParsedDtcCode[];
  freezeFrame: Record<string, unknown>[];
  liveData: Record<string, unknown>[];
  imageOnlyPdf: boolean;
  warnings: string[];
}

export function emptyParsedScanReport(): ParsedScanReport {
  return {
    modules: [],
    dtcCodes: [],
    freezeFrame: [],
    liveData: [],
    imageOnlyPdf: false,
    warnings: [],
  };
}

export interface ScanReportParser {
  readonly id: string;
  readonly version: string;
  readonly supportedFormats: ScanFileFormat[];
  detect(buffer: Buffer, declaredFormat: ScanFileFormat, filename: string): boolean;
  parse(buffer: Buffer): Promise<ParsedScanReport>;
}
