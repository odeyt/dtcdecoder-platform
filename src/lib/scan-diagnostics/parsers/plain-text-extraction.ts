// Shared "build a ParsedScanReport from plain text" pass, reused by the
// TXT parser directly and by the HTML/XML/PDF parsers once they've reduced
// their source to plain text.
import {
  dedupeDtcCodes,
  extractDtcCodesFromText,
  extractVinFromText,
} from "@/lib/scan-diagnostics/parsers/dtc-extraction";
import { emptyParsedScanReport, type ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";

const MAKE_KEYWORDS = [
  "Toyota", "Honda", "Ford", "Chevrolet", "Chevy", "GMC", "BMW", "Mercedes-Benz", "Mercedes",
  "Audi", "Volkswagen", "VW", "Nissan", "Hyundai", "Kia", "Subaru", "Mazda", "Jeep", "Ram",
  "Dodge", "Chrysler", "Tesla", "Volvo", "Land Rover", "Jaguar", "Porsche", "Lexus", "Acura",
  "Infiniti", "Mitsubishi", "Buick", "Cadillac", "Lincoln",
];

function extractMake(text: string): string | undefined {
  for (const make of MAKE_KEYWORDS) {
    if (new RegExp(`\\b${make}\\b`, "i").test(text)) return make;
  }
  return undefined;
}

function extractModelYear(text: string): number | undefined {
  const match = text.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (!match) return undefined;
  const year = Number(match[0]);
  const currentYearCeiling = 2035; // generous static ceiling, avoids Date.now()
  return year <= currentYearCeiling ? year : undefined;
}

function extractOdometer(text: string): number | undefined {
  const match = text.match(/\b(?:mileage|odometer)\s*[:=]?\s*([\d,]{3,7})\s*(?:mi|miles)?\b/i);
  if (!match) return undefined;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export function buildParsedScanReportFromText(text: string): ParsedScanReport {
  const report = emptyParsedScanReport();

  report.vin = extractVinFromText(text);
  report.make = extractMake(text);
  report.modelYear = extractModelYear(text);
  report.odometerMiles = extractOdometer(text);
  report.dtcCodes = dedupeDtcCodes(extractDtcCodesFromText(text));

  if (text.trim().length === 0) {
    report.warnings.push("No readable text was found in this file.");
  }

  return report;
}
