// Shared "build a ParsedScanReport from plain text" pass, reused by the
// TXT parser directly and by the HTML/XML/PDF parsers once they've reduced
// their source to plain text. Accepts either a single text blob (txt/csv/
// json/html/xml — no meaningful page boundary) or an array of per-page text
// (PDF, so DTCs can carry a source page number).
import { dedupeDtcCodes, extractVinFromText } from "@/lib/scan-diagnostics/parsers/dtc-extraction";
import { extractSystemSections } from "@/lib/scan-diagnostics/parsers/system-sections";
import { emptyParsedScanReport, type ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";

const MAKE_KEYWORDS = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Chevy", "GMC", "BMW", "Mercedes-Benz", "Mercedes",
  "Audi", "Volkswagen", "VW", "Nissan", "Hyundai", "Kia", "Subaru", "Mazda", "Jeep", "Ram",
  "Dodge", "Chrysler", "Tesla", "Volvo", "Land Rover", "Jaguar", "Porsche", "Lexus", "Acura",
  "Infiniti", "Mitsubishi", "Buick", "Cadillac", "Lincoln",
];

// Best-effort, non-exhaustive — used only to fill in vehicle Make when the
// source has no explicit "Make:" label at all (rare; most scan-tool
// exports DO label it) and instead just mentions a well-known brand name in
// prose. Never the primary extraction path — see extractLabeledField below,
// which works for ANY brand the source explicitly labels.
function extractMakeFromProse(text: string): string | undefined {
  for (const make of MAKE_KEYWORDS) {
    if (new RegExp(`\\b${make}\\b`, "i").test(text)) return make;
  }
  return undefined;
}

// Generic "Label: value" line extractor — works for any vehicle brand or
// scanner tool, unlike a hardcoded keyword whitelist. Fixes
// docs/FULL_SCAN_DATA_LOSS_AUDIT.md findings #3/#4/#7: a report explicitly
// labeling "Make:ZOTYE" or "Model:Domy X7" is read directly rather than
// requiring the value to already be on a known-brand whitelist, and this is
// the ONLY way Model is ever extracted (no whitelist exists for models).
function extractLabeledField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const pattern = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^\\r\\n]+)`, "i");
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim();
      if (value) return value;
    }
  }
  return undefined;
}

function extractLabeledYear(text: string): number | undefined {
  const labeled = extractLabeledField(text, ["Year"]);
  if (labeled) {
    const year = Number(labeled.match(/\d{4}/)?.[0]);
    if (Number.isFinite(year)) return year;
  }
  // Fallback: a bare 4-digit year anywhere in the text, generic ceiling to
  // avoid Date.now() (see docs/FULL_SCAN_DATA_LOSS_AUDIT.md — this path was
  // already correct; the year was extracted but hidden by a display bug).
  const match = text.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  const currentYearCeiling = 2035;
  return year <= currentYearCeiling ? year : undefined;
}

// Sanity ceiling mirrors ExtractionReviewInputSchema's odometerMiles.max()
// (schemas.ts) — an extracted value this implausible is far more likely to
// be a parsing artifact than a real reading, and letting it through just
// means the review-form submission fails validation later with no
// indication of which field was the problem.
const MAX_PLAUSIBLE_ODOMETER_MILES = 1_000_000;

function extractOdometer(text: string): number | undefined {
  const labeled = extractLabeledField(text, ["Mileage", "Odometer"]);
  if (labeled) {
    // Take only the first digit run (with optional thousands separators),
    // not every digit character anywhere in the rest of the line —
    // extractLabeledField captures to end-of-line, and on multi-column
    // scan-tool reports flattened to plain text, unrelated data can end up
    // on the same line and get concatenated in if every digit is kept.
    const digits = labeled.match(/[\d,]{1,7}(?:\.\d+)?/);
    if (digits) {
      const value = Number(digits[0].replace(/,/g, ""));
      if (Number.isFinite(value) && value >= 0 && value <= MAX_PLAUSIBLE_ODOMETER_MILES) return value;
    }
  }
  const match = text.match(/\b(?:mileage|odometer)\s*[:=]?\s*([\d,]{3,7})\s*(?:mi|miles)?\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value <= MAX_PLAUSIBLE_ODOMETER_MILES ? value : undefined;
}

// Best-effort scanner-brand detection — a report's brand is often rendered
// as a logo image (no extractable text) rather than a text label, so this
// is deliberately non-exhaustive and never fabricates a brand when none of
// these appear in the text layer.
const SCANNER_BRAND_KEYWORDS = [
  "LAUNCH", "Autel", "Snap-on", "Snap-On", "Bosch", "Innova", "OBDLink", "Foxwell", "Topdon",
  "ANCEL", "Matco", "OTC", "Actron", "BlueDriver", "Carly",
];

function extractScannerBrand(text: string): string | undefined {
  for (const brand of SCANNER_BRAND_KEYWORDS) {
    if (new RegExp(`\\b${brand}\\b`, "i").test(text)) return brand;
  }
  return undefined;
}

function extractReportType(text: string): string | undefined {
  const match = text.match(/\b(pre-repair|post-repair)\b/i);
  return match ? match[0] : undefined;
}

export function buildParsedScanReportFromText(input: string | string[]): ParsedScanReport {
  const pages = Array.isArray(input) ? input : [input];
  const report = emptyParsedScanReport();
  const fullText = pages.join("\n");

  report.vin = extractVinFromText(fullText);
  report.make = extractLabeledField(fullText, ["Make"]) ?? extractMakeFromProse(fullText);
  report.model = extractLabeledField(fullText, ["Model"]);
  report.modelYear = extractLabeledYear(fullText);
  report.engine = extractLabeledField(fullText, ["Engine"]);
  report.odometerMiles = extractOdometer(fullText);
  report.scannerBrand = extractScannerBrand(fullText);
  report.diagnosticApplicationVersion = extractLabeledField(fullText, ["Diagnostic Application Version"]);
  report.vehicleSoftwareVersion = extractLabeledField(fullText, ["Vehicle Software Version"]);
  report.diagnosticPath = extractLabeledField(fullText, ["Diagnostic path", "Diagnostic Path"]);
  report.testTime = extractLabeledField(fullText, ["Test Time"]);
  report.reportType = extractReportType(fullText);

  // System-section detection runs per page (so DTCs carry a real source
  // page number for multi-page PDFs) and results are merged — a system
  // heading is rare enough to split across a page boundary that per-page
  // detection is the right tradeoff over joining all pages into one blob
  // and losing page provenance entirely.
  const allSystems: ParsedScanReport["systems"] = [];
  const systemByName = new Map<string, (typeof allSystems)[number]>();
  let allDtcs: ReturnType<typeof extractSystemSections>["dtcCodes"] = [];

  pages.forEach((pageText, idx) => {
    const pageNumber = pages.length > 1 ? idx + 1 : undefined;
    const { systems, dtcCodes } = extractSystemSections(pageText, pageNumber);
    for (const system of systems) {
      const existing = systemByName.get(system.systemName);
      if (existing) {
        existing.dtcCountExtracted += system.dtcCountExtracted;
        existing.dtcCountReported = existing.dtcCountReported ?? system.dtcCountReported;
      } else {
        systemByName.set(system.systemName, { ...system });
        allSystems.push(systemByName.get(system.systemName)!);
      }
    }
    allDtcs = allDtcs.concat(dtcCodes);
  });

  report.systems = allSystems;
  report.dtcCodes = dedupeDtcCodes(allDtcs);

  // Any DTC that fell outside a detected system section (no heading found
  // above it — either a simple flat report with no system structure at
  // all, or a heading this heuristic missed) still counts toward
  // dtcsExpected/Parsed via its own presence, just without a system tag.
  const dtcsExpected = allSystems.reduce((sum, s) => sum + (s.dtcCountReported ?? 0), 0);
  const dtcsParsed = report.dtcCodes.length;
  const truncated = allSystems.some(
    (s) => s.dtcCountReported !== undefined && s.dtcCountExtracted < s.dtcCountReported,
  );

  report.extractionQuality = {
    systemsExpected: allSystems.length || undefined,
    systemsParsed: allSystems.length || undefined,
    dtcsExpected: dtcsExpected || undefined,
    dtcsParsed,
    truncated,
    confidence: truncated ? "low" : dtcsExpected > 0 ? "high" : "medium",
  };

  if (fullText.trim().length === 0) {
    report.warnings.push("No readable text was found in this file.");
  }
  if (truncated) {
    const shortfalls = allSystems
      .filter((s) => s.dtcCountReported !== undefined && s.dtcCountExtracted < s.dtcCountReported)
      .map((s) => `${s.systemName} (declared ${s.dtcCountReported}, extracted ${s.dtcCountExtracted})`);
    report.warnings.push(
      `Extraction may be incomplete — the source report declared more DTCs than were extracted for: ${shortfalls.join("; ")}.`,
    );
  }

  return report;
}
