// Plain-text rendering of an already-redacted ScanReportAccessResult for
// the "Copy" button (ScanCopyButton.tsx). Deliberately derives nothing new
// — every field here is already visible on the page via ScanReportView,
// this just re-serializes the same reportAccess.visibleResult the browser
// already has, so there is no server round-trip and nothing sensitive
// beyond what's already rendered ever gets touched.
import type { ScanReportAccessResult } from "@/lib/ai-diagnostics/redaction";

export function formatReportForClipboard(reportAccess: ScanReportAccessResult): string {
  const { visibleResult } = reportAccess;
  const lines: string[] = [];

  const vehicle = visibleResult.vehicleSummary;
  const vehicleParts = [
    vehicle.modelYear,
    vehicle.make,
    vehicle.model,
    vehicle.engine ? `(${vehicle.engine})` : null,
  ].filter(Boolean);
  lines.push("VEHICLE");
  if (vehicleParts.length > 0) lines.push(vehicleParts.join(" "));
  if (vehicle.vin) lines.push(`VIN: ${vehicle.vin}`);
  if (vehicle.odometerMiles != null) lines.push(`Odometer: ${vehicle.odometerMiles} miles`);
  lines.push("");

  lines.push("DIAGNOSTIC TROUBLE CODES");
  for (const dtc of visibleResult.dtcs) {
    lines.push(`- ${dtc.code}${dtc.module ? ` (${dtc.module})` : ""}${dtc.status ? ` — ${dtc.status}` : ""}`);
  }
  lines.push("");

  if (visibleResult.patterns.length > 0) {
    lines.push("KEY PATTERNS");
    for (const pattern of visibleResult.patterns) {
      lines.push(`- [${pattern.severity.toUpperCase()}] ${pattern.name}`);
    }
    lines.push("");
  }

  if (visibleResult.rankedCauses && visibleResult.rankedCauses.length > 0) {
    lines.push("DIAGNOSTIC FINDINGS — RANKED CAUSES");
    visibleResult.rankedCauses.forEach((cause, i) => {
      lines.push(`${i + 1}. ${cause.cause}`);
      lines.push(`   ${cause.rationale}`);
    });
    lines.push("");
  }

  if (visibleResult.recommendedTests && visibleResult.recommendedTests.length > 0) {
    lines.push("RECOMMENDED NEXT TESTS");
    visibleResult.recommendedTests.forEach((test, i) => {
      lines.push(`${i + 1}. ${test.step}`);
      lines.push(`   Purpose: ${test.purpose}`);
      lines.push(`   Expected result: ${test.expectedResult}`);
    });
    lines.push("");
  }

  if (visibleResult.safety.findings.length > 0) {
    lines.push("SAFETY WARNINGS");
    for (const finding of visibleResult.safety.findings) {
      lines.push(`- ${finding.message}`);
    }
    lines.push("");
  }

  if (visibleResult.missingInformation && visibleResult.missingInformation.length > 0) {
    lines.push("MISSING INFORMATION");
    for (const item of visibleResult.missingInformation) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  if (visibleResult.confidenceLevel) {
    lines.push(`DIAGNOSTIC CONFIDENCE: ${visibleResult.confidenceLevel}`);
    for (const reason of visibleResult.confidenceRationale ?? []) {
      lines.push(`- ${reason}`);
    }
  }

  return lines.join("\n").trim();
}
