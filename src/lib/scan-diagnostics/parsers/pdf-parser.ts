import { extractText, getDocumentProxy } from "unpdf";
import type { ScanReportParser, ParsedScanReport } from "@/lib/scan-diagnostics/parsers/types";
import { buildParsedScanReportFromText } from "@/lib/scan-diagnostics/parsers/plain-text-extraction";

// Below this average characters-per-page, the PDF is treated as scanned
// images with no real text layer rather than pretending extraction
// succeeded. No OCR is implemented — see src/lib/scan-diagnostics/ocr/types.ts
// for the documented, unimplemented extension point.
const IMAGE_ONLY_AVG_CHARS_PER_PAGE_THRESHOLD = 20;

const IMAGE_ONLY_WARNING =
  "This PDF appears to be scanned images with no extractable text. OCR is not yet supported — please enter the vehicle info and DTCs manually below.";

// A pathological/adversarial PDF (deeply nested objects, huge page count)
// could otherwise hang parsing indefinitely within a request's lifetime.
// runExtraction() in registry.ts already falls back to a raw-text scan on
// any thrown error, so timing out here degrades gracefully rather than
// hanging the whole analyze/extract request.
const PDF_PARSE_TIMEOUT_MS = 20_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}

export const pdfParser: ScanReportParser = {
  id: "generic-pdf",
  version: "1.0.0",
  supportedFormats: ["pdf"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "pdf";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const pdf = await withTimeout(
      getDocumentProxy(new Uint8Array(buffer)),
      PDF_PARSE_TIMEOUT_MS,
      "PDF document loading",
    );
    const { totalPages, text } = await withTimeout(
      extractText(pdf, { mergePages: false }),
      PDF_PARSE_TIMEOUT_MS,
      "PDF text extraction",
    );

    const totalChars = text.reduce((sum, page) => sum + page.trim().length, 0);
    const avgCharsPerPage = totalPages > 0 ? totalChars / totalPages : 0;
    const imageOnlyPdf = avgCharsPerPage < IMAGE_ONLY_AVG_CHARS_PER_PAGE_THRESHOLD;

    if (imageOnlyPdf) {
      const report = buildParsedScanReportFromText("");
      report.imageOnlyPdf = true;
      report.warnings.push(IMAGE_ONLY_WARNING);
      report.extractionQuality.pagesExpected = totalPages;
      report.extractionQuality.pagesParsed = 0;
      report.extractionQuality.confidence = "low";
      return report;
    }

    const report = buildParsedScanReportFromText(text);
    report.extractionQuality.pagesExpected = totalPages;
    report.extractionQuality.pagesParsed = text.length;
    return report;
  },
};
