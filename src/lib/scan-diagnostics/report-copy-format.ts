// Pure formatter for the Case Header's "Copy report" action — turns the
// already-redacted ScanReportVisibleResult into plain text. Never invents
// content: every line either echoes a real field or is omitted when that
// field is absent, matching how the report itself renders "Not provided in
// report" rather than fabricating a value.
import type { ScanReportVisibleResult } from "@/lib/ai-diagnostics/redaction";

export function formatReportForCopy(result: ScanReportVisibleResult): string {
  const lines: string[] = [];
  const { vehicleSummary } = result;

  lines.push("DIAGNOSTIC REPORT — prepared by DTC Technician (not OEM service information)");
  lines.push("");
  lines.push(
    `Vehicle: ${[vehicleSummary.modelYear, vehicleSummary.make, vehicleSummary.model].filter(Boolean).join(" ") || "Not provided in report"}`,
  );
  lines.push(`VIN: ${vehicleSummary.vin ?? "Not provided in report"}`);
  if (vehicleSummary.engine) lines.push(`Engine: ${vehicleSummary.engine}`);
  lines.push("");

  lines.push(
    `DTCs: ${result.dtcs.length > 0 ? result.dtcs.map((d) => (d.module ? `${d.code} (${d.module})` : d.code)).join(", ") : "None recorded"}`,
  );
  lines.push("");

  if (result.rankedCauses && result.rankedCauses.length > 0) {
    lines.push("LIKELY CAUSES");
    result.rankedCauses.forEach((cause, i) => {
      lines.push(`${i + 1}. ${cause.cause}${cause.confidenceLevel ? ` (confidence: ${cause.confidenceLevel})` : ""}`);
      lines.push(`   ${cause.rationale}`);
    });
    lines.push("");
  }

  if (result.recommendedTests && result.recommendedTests.length > 0) {
    lines.push("RECOMMENDED TESTS");
    result.recommendedTests.forEach((test, i) => {
      lines.push(`${i + 1}. ${test.step} — expected: ${test.expectedResult}`);
    });
    lines.push("");
  }

  if (result.safety.findings.length > 0) {
    lines.push("SAFETY WARNINGS");
    result.safety.findings.forEach((f) => lines.push(`[${f.severity.toUpperCase()}] ${f.message}`));
    lines.push("");
  }

  return lines.join("\n").trim();
}
