import type { ScanFileFormat, ScanSystemStatus, ExtractedEvidence } from "@/lib/types";

export type { ExtractedEvidence };

export interface ParsedDtcCode {
  module?: string;
  code: string;
  status?: string;
  descriptionRaw?: string;
  // Provenance (migration 0028) — the system/section heading this DTC was
  // found under (e.g. "1.8T Engine System"), the source page (PDF only —
  // undefined for single-blob formats), and the raw source line, so a
  // technician or the admin inspection screen can trace every extracted
  // fact back to exactly where it came from.
  systemName?: string;
  sourcePage?: number;
  sourceText?: string;
  // Photo-upload provenance only (undefined for every other format) — the
  // 0-based index into the case's ordered photo set this code was read
  // from. See ExtractedEvidence below for the image-level counterpart.
  sourceImageIndex?: number;
}

// One detected "system" or "module" section from a multi-system scan
// report (e.g. LAUNCH-style "1.8T Engine System \n DTC (5)" headings, or a
// "The following systems are OK" list). dtcCountReported is the report's
// OWN declared count when stated ("DTC (14)"); dtcCountExtracted is how
// many this parser actually pulled out for that section — comparing the
// two is what extraction-completeness validation is built on.
export interface ParsedSystemSection {
  systemName: string;
  moduleName?: string;
  status: ScanSystemStatus;
  dtcCountReported?: number;
  dtcCountExtracted: number;
}

export interface ParsedExtractionQuality {
  pagesExpected?: number;
  pagesParsed?: number;
  systemsExpected?: number;
  systemsParsed?: number;
  dtcsExpected?: number;
  dtcsParsed?: number;
  truncated: boolean;
  confidence: "high" | "medium" | "low";
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
  // Scanner/report metadata (migration 0028) — e.g. LAUNCH X431's "Vehicle
  // Software Version:", "Diagnostic Application Version:", "Diagnostic
  // path:", "Test Time:". Generic label-based extraction, not tied to any
  // one scanner brand.
  scannerBrand?: string;
  diagnosticApplicationVersion?: string;
  vehicleSoftwareVersion?: string;
  diagnosticPath?: string;
  testTime?: string;
  reportType?: string;
  modules: { name: string; status?: string }[];
  dtcCodes: ParsedDtcCode[];
  systems: ParsedSystemSection[];
  freezeFrame: Record<string, unknown>[];
  liveData: Record<string, unknown>[];
  imageOnlyPdf: boolean;
  warnings: string[];
  extractionQuality: ParsedExtractionQuality;
  // Only populated by the photo-upload vision extraction path — undefined
  // (never an empty array) for every text-format parser, so "no evidence
  // field at all" stays a clean signal for "not a photo upload."
  evidence?: ExtractedEvidence[];
}

export function emptyParsedScanReport(): ParsedScanReport {
  return {
    modules: [],
    dtcCodes: [],
    systems: [],
    freezeFrame: [],
    liveData: [],
    imageOnlyPdf: false,
    warnings: [],
    extractionQuality: { truncated: false, confidence: "high" },
  };
}

export interface ScanReportParser {
  readonly id: string;
  readonly version: string;
  readonly supportedFormats: ScanFileFormat[];
  detect(buffer: Buffer, declaredFormat: ScanFileFormat, filename: string): boolean;
  parse(buffer: Buffer): Promise<ParsedScanReport>;
}
