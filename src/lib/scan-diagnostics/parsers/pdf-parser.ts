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

export const pdfParser: ScanReportParser = {
  id: "generic-pdf",
  version: "1.0.0",
  supportedFormats: ["pdf"],

  detect(_buffer, declaredFormat) {
    return declaredFormat === "pdf";
  },

  async parse(buffer): Promise<ParsedScanReport> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });

    const totalChars = text.reduce((sum, page) => sum + page.trim().length, 0);
    const avgCharsPerPage = totalPages > 0 ? totalChars / totalPages : 0;
    const imageOnlyPdf = avgCharsPerPage < IMAGE_ONLY_AVG_CHARS_PER_PAGE_THRESHOLD;

    if (imageOnlyPdf) {
      const report = buildParsedScanReportFromText("");
      report.imageOnlyPdf = true;
      report.warnings.push(IMAGE_ONLY_WARNING);
      return report;
    }

    return buildParsedScanReportFromText(text.join("\n"));
  },
};
