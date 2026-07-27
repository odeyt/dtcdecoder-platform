import { ResultSection } from "@/components/ResultSection";
import { UpgradeCard } from "@/components/UpgradeCard";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import { CONFIDENCE_LABEL, isLegacyReport, resolveConfidenceLabel } from "@/lib/scan-diagnostics/report-presentation";
import type { DtcCategory } from "@/lib/scan-diagnostics/schemas";
import type { ScanReportAccessResult } from "@/lib/ai-diagnostics/redaction";
import type { ScanCase, ScanDtcRecord, ScanExtraction } from "@/lib/types";
import { BRAND_DISCLOSURE } from "@/lib/branding/terminology";

// Confidence/rank fields are all OPTIONAL here on purpose: a schema_version
// "1.0" report row (written before Diagnostic Safety v2) has neither
// confidenceLevel nor confirmationTestsRequired — only the deprecated
// numeric probabilityPercent. Legacy rows must still render without
// crashing; they just never display a fabricated or reinterpreted number.
// See docs/DIAGNOSTIC_SCHEMA_V2.md.
interface RankedCause {
  cause: string;
  confidenceLevel?: "high" | "medium" | "low" | "insufficient_evidence";
  rationale: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  confirmationTestsRequired?: string[];
}

interface RecommendedTest {
  step: string;
  purpose: string;
  expectedResult: string;
}

interface SafetyFinding {
  ruleId: string;
  severity: "block" | "warn";
  message: string;
}

interface ScanReportViewProps {
  scanCase: ScanCase;
  extraction: ScanExtraction | null;
  dtcRecords: ScanDtcRecord[];
  // Already server-redacted for the viewer's real, current plan — never
  // the raw ScanReport row. See src/lib/scan-diagnostics/report-access.ts.
  reportAccess: ScanReportAccessResult;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "var(--severity-low)",
  medium: "var(--accent-amber)",
  low: "var(--severity-high)",
  insufficient_evidence: "var(--text-muted)",
};

function ConfidenceBadge({ level }: { level?: string | null }) {
  const label = resolveConfidenceLabel(level);
  const isEstablished = level && CONFIDENCE_LABEL[level];
  return (
    <span
      aria-label={`Diagnostic confidence: ${label}`}
      className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
      style={{
        borderColor: isEstablished ? CONFIDENCE_COLOR[level as string] : "var(--border-subtle)",
        color: isEstablished ? CONFIDENCE_COLOR[level as string] : "var(--text-muted)",
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

function CategoryBadge({ label, category }: { label: string; category: DtcCategory }) {
  const found = category.status === "found";
  const noneReported = category.status === "none_reported";
  return (
    <div className="glass-panel flex flex-col gap-1 rounded-[var(--radius-lg)] p-4">
      <p className="text-xs font-semibold text-[var(--text-primary)]">{label}</p>
      <p
        className="font-mono text-[10px] uppercase tracking-wide"
        style={{ color: found ? "var(--accent-red)" : "var(--text-muted)" }}
      >
        {found ? "Found" : noneReported ? "None reported" : "Not stated in report"}
      </p>
      {found && category.codes.length > 0 && (
        <p className="font-mono text-xs text-[var(--text-secondary)]">{category.codes.join(", ")}</p>
      )}
    </div>
  );
}

// Content prepared by DTC Technician is always visually distinguished from
// extracted/user-entered data (the section headers below make this
// explicit) and is never presented as OEM service information — see
// docs/SCAN_REPORT_ANALYSIS.md and docs/DIAGNOSTIC_SAFETY_RULES.md.
export function ScanReportView({ scanCase, extraction, dtcRecords, reportAccess }: ScanReportViewProps) {
  const { visibleResult, accessLevel, lockedSections } = reportAccess;
  const isFull = accessLevel === "full";
  const safetyFindings = visibleResult.safety.findings as unknown as SafetyFinding[];
  const categories = classifyDtcCategories(dtcRecords, extraction?.modules ?? []);
  const legacyReport = isFull
    ? isLegacyReport({ schema_version: visibleResult.schemaVersion, confidence_level: visibleResult.confidenceLevel ?? null })
    : false;

  return (
    <div className="flex flex-col gap-10 print:gap-6">
      <header className="print:hidden">
        <p className="font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">Professional Diagnostic Report</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            Prepared by DTC Technician™ — not OEM service information
          </span>
          {!isFull && (
            <span className="rounded-full border border-[var(--border-red)] px-3 py-1 text-xs font-semibold text-[var(--accent-red)]">
              Free preview
            </span>
          )}
        </div>
        <p className="mt-3 max-w-2xl text-xs text-[var(--text-muted)]">{BRAND_DISCLOSURE}</p>
      </header>

      {!isFull && (
        <UpgradeCard reason="This is a limited free preview. Upgrade to Pro Technician for the complete root-cause ranking, full test sequence, expected readings, and programming/calibration guidance." />
      )}

      <ResultSection title="Vehicle information">
        <div className="glass-panel grid gap-2 rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
          <p>VIN: <span className="text-[var(--text-primary)]">{visibleResult.vehicleSummary.vin ?? "Not provided in report"}</span></p>
          <p>
            Vehicle:{" "}
            <span className="text-[var(--text-primary)]">
              {[visibleResult.vehicleSummary.modelYear, visibleResult.vehicleSummary.make, visibleResult.vehicleSummary.model]
                .filter(Boolean)
                .join(" ") || "Not provided in report"}
            </span>
          </p>
          <p>Engine: <span className="text-[var(--text-primary)]">{visibleResult.vehicleSummary.engine ?? "Not provided in report"}</span></p>
          <p>
            Mileage:{" "}
            <span className="text-[var(--text-primary)]">
              {visibleResult.vehicleSummary.odometerMiles ? visibleResult.vehicleSummary.odometerMiles.toLocaleString() : "Not provided in report"}
            </span>
          </p>
          {(visibleResult.scannerMeta.scannerBrand ||
            visibleResult.scannerMeta.vehicleSoftwareVersion ||
            visibleResult.scannerMeta.diagnosticApplicationVersion ||
            visibleResult.scannerMeta.testTime) && (
            <>
              <p>
                Scanner:{" "}
                <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.scannerBrand ?? "Not identified"}</span>
              </p>
              <p>
                Vehicle software:{" "}
                <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.vehicleSoftwareVersion ?? "Not provided"}</span>
              </p>
              <p>
                Scan time:{" "}
                <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.testTime ?? "Not provided"}</span>
              </p>
              <p>
                Report type:{" "}
                <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.reportType ?? "Not stated"}</span>
              </p>
            </>
          )}
        </div>
        {visibleResult.extractionQuality.truncated && (
          <p
            role="alert"
            className="mt-3 rounded-[var(--radius-md)] border p-3 text-xs text-[var(--text-secondary)]"
            style={{ borderColor: "var(--accent-amber)", background: "rgba(217, 154, 63, 0.08)" }}
          >
            Extraction may be incomplete — the source report declared more DTCs for at least one system than were
            extracted. Do not treat the DTC list on this case as exhaustive.
          </p>
        )}
      </ResultSection>

      <ResultSection title="Vehicle health summary">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Faulted systems", value: visibleResult.healthSummary.faultedSystemCount },
            { label: "Systems OK", value: visibleResult.healthSummary.okSystemCount },
            { label: "Total DTCs", value: visibleResult.healthSummary.totalDtcCount },
            { label: "Current", value: visibleResult.healthSummary.currentCount },
            { label: "History", value: visibleResult.healthSummary.historyCount },
            { label: "Network faults", value: visibleResult.healthSummary.networkCount },
            { label: "Battery/voltage", value: visibleResult.healthSummary.batteryVoltageCount },
            { label: "Safety-critical", value: visibleResult.healthSummary.safetyCriticalCount },
          ].map(({ label, value }) => (
            <div key={label} className="glass-panel rounded-[var(--radius-lg)] p-4 text-center">
              <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{label}</p>
            </div>
          ))}
        </div>
      </ResultSection>

      {visibleResult.moduleHealthTable.length > 0 && (
        <ResultSection title="Module health">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-[var(--text-secondary)]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)]">
                  <th className="py-2 pr-4">System / module</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">DTCs</th>
                  <th className="py-2 pr-4">Extraction</th>
                  <th className="py-2">Highest priority</th>
                </tr>
              </thead>
              <tbody>
                {visibleResult.moduleHealthTable.map((row) => (
                  <tr key={row.systemName} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-2 pr-4 text-[var(--text-primary)]">{row.systemName}</td>
                    <td className="py-2 pr-4">
                      <span
                        className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase"
                        style={{
                          borderColor: row.status === "faulted" ? "var(--accent-red)" : "var(--border-subtle)",
                          color: row.status === "faulted" ? "var(--accent-red)" : "var(--text-muted)",
                        }}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      {row.dtcCountExtracted}
                      {row.dtcCountReported != null ? ` / ${row.dtcCountReported}` : ""}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {row.extractionComplete ? (
                        "Complete"
                      ) : (
                        <span style={{ color: "var(--accent-amber)" }}>Incomplete</span>
                      )}
                    </td>
                    <td className="py-2 font-mono text-xs">{row.highestPriorityFault ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ResultSection>
      )}

      {visibleResult.patterns.length > 0 && (
        <ResultSection title="Key patterns (deterministic, not prepared by DTC Technician)">
          <div className="flex flex-col gap-2">
            {visibleResult.patterns.map((pattern) => (
              <div key={pattern.patternType} className="glass-panel rounded-[var(--radius-lg)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase"
                    style={{
                      borderColor: pattern.severity === "critical" ? "var(--accent-red)" : "var(--accent-amber)",
                      color: pattern.severity === "critical" ? "var(--accent-red)" : "var(--accent-amber)",
                    }}
                  >
                    {pattern.severity}
                  </span>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{pattern.name}</p>
                </div>
                {pattern.affectedModules.length > 0 && (
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Affected: {pattern.affectedModules.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      {isFull && visibleResult.priority && (
        <ResultSection title="Diagnostic priority">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Fix first", codes: visibleResult.priority.fixFirstCodes, color: "var(--accent-red)" },
              { label: "Diagnose next", codes: visibleResult.priority.diagnoseNextCodes, color: "var(--accent-amber)" },
              { label: "Monitor / recheck after repair", codes: visibleResult.priority.monitorRecheckCodes, color: "var(--text-secondary)" },
              { label: "Historical / reference-only", codes: visibleResult.priority.historicalReferenceCodes, color: "var(--text-muted)" },
            ].map(({ label, codes, color }) => (
              <div key={label} className="glass-panel rounded-[var(--radius-lg)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>
                  {label}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                  {codes.length > 0 ? codes.join(", ") : "None"}
                </p>
              </div>
            ))}
          </div>
        </ResultSection>
      )}

      <ResultSection title="Customer complaint">
        <p className="text-sm text-[var(--text-secondary)]">{scanCase.complaint ?? "Not provided"}</p>
        {scanCase.symptoms.length > 0 && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">Symptoms: {scanCase.symptoms.join(", ")}</p>
        )}
      </ResultSection>

      <ResultSection title="Fault code categories">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <CategoryBadge label="Pending codes" category={categories.pendingCodes} />
          <CategoryBadge label="Permanent codes" category={categories.permanentCodes} />
          <CategoryBadge label="Network faults" category={categories.networkFaults} />
          <CategoryBadge label="Lost-communication faults" category={categories.lostCommunicationFaults} />
          <CategoryBadge label="Battery-related faults" category={categories.batteryRelatedFaults} />
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          &ldquo;Not stated in report&rdquo; means the source report gave no evidence either way — it is not the same
          as the report confirming zero findings in that category.
        </p>
      </ResultSection>

      <ResultSection title="DTCs recorded for this case">
        <div className="flex flex-wrap gap-2">
          {visibleResult.dtcs.map((dtc, i) => (
            <span
              key={i}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-mono text-xs text-[var(--text-secondary)]"
            >
              {dtc.code}
              {dtc.module ? ` (${dtc.module})` : ""}
            </span>
          ))}
          {visibleResult.dtcs.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No DTC records for this case.</p>
          )}
        </div>
      </ResultSection>

      {isFull ? (
        <>
          {visibleResult.requestedLocale && visibleResult.requestedLocale !== "en" && (
            <p className="text-xs text-[var(--text-muted)]">
              {visibleResult.fallbackUsed
                ? `Requested in ${visibleResult.requestedLocale}, but the translation was unavailable — showing the English report below.`
                : `Translated from the English canonical report into ${visibleResult.resolvedLocale}.`}
            </p>
          )}
          <ResultSection title="Diagnostic Findings (prepared by DTC Technician™, not confirmed)">
            <div className="flex flex-col gap-4">
              {(visibleResult.rankedCauses as unknown as RankedCause[])!.map((cause, i) => (
                <div key={i} className="glass-panel rounded-[var(--radius-lg)] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
                      style={{
                        borderColor: i === 0 ? "var(--accent-red)" : "var(--border-subtle)",
                        color: i === 0 ? "var(--accent-red)" : "var(--text-muted)",
                      }}
                    >
                      {i === 0 ? "TOP CANDIDATE" : `CANDIDATE #${i + 1}`}
                    </span>
                    <ConfidenceBadge level={cause.confidenceLevel} />
                  </div>
                  <p className="mt-2 font-semibold text-[var(--text-primary)]">{cause.cause}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{cause.rationale}</p>
                  {cause.supportingEvidence.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Supporting evidence: </span>
                      {cause.supportingEvidence.join("; ")}
                    </div>
                  )}
                  {cause.contradictingEvidence.length > 0 && (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Contradicting evidence: </span>
                      {cause.contradictingEvidence.join("; ")}
                    </div>
                  )}
                  <div className="mt-2 text-xs text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">Required before replacing anything: </span>
                    {cause.confirmationTestsRequired && cause.confirmationTestsRequired.length > 0
                      ? cause.confirmationTestsRequired.join("; ")
                      : "Not established for this legacy result — see recommended test sequence below."}
                  </div>
                </div>
              ))}
            </div>
          </ResultSection>

          <ResultSection title="Recommended Next Tests (prepared by DTC Technician™)">
            <ol className="flex flex-col gap-3">
              {(visibleResult.recommendedTests as unknown as RecommendedTest[])!.map((test, i) => (
                <li key={i} className="glass-panel rounded-[var(--radius-lg)] p-4">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {i + 1}. {test.step}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Purpose: {test.purpose}</p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">Expected result: {test.expectedResult}</p>
                </li>
              ))}
              {visibleResult.recommendedTests!.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">None recommended.</p>
              )}
            </ol>
          </ResultSection>
        </>
      ) : (
        <ResultSection title="Professional Diagnostic Report locked">
          <div className="glass-panel rounded-[var(--radius-lg)] p-5">
            <p className="text-sm text-[var(--text-secondary)]">
              DTC Technician&apos;s root-cause findings and test steps for this case are available on Pro Technician or
              Workshop. The Free plan doesn&apos;t include Professional Diagnostic Report generation or access to
              previously generated reports.
            </p>
          </div>
        </ResultSection>
      )}

      {safetyFindings.length > 0 && (
        <ResultSection title="Safety warnings">
          <div
            role="alert"
            className="rounded-[var(--radius-lg)] border-2 p-5"
            style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
          >
            <ul className="flex flex-col gap-2 text-sm text-[var(--text-primary)]">
              {safetyFindings.map((f, i) => (
                <li key={i}>
                  <span className="font-mono text-[10px] uppercase text-[var(--accent-red)]">{f.severity}</span>{" "}
                  {f.message}
                </li>
              ))}
            </ul>
          </div>
        </ResultSection>
      )}

      {isFull && visibleResult.missingInformation!.length > 0 && (
        <ResultSection title="Missing information">
          <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)]">
            {visibleResult.missingInformation!.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </ResultSection>
      )}

      {isFull && (
        <ResultSection title="Diagnostic confidence">
          <div className="glass-panel rounded-[var(--radius-lg)] p-5">
            {legacyReport ? (
              <>
                <p className="text-lg font-bold text-[var(--text-muted)]">Not established</p>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">
                  This report was generated before categorical confidence levels were introduced. Numerical confidence
                  is not shown because the available evidence at the time did not support a calibrated probability, and
                  the original number is not reinterpreted here as a level.
                </p>
              </>
            ) : (
              <>
                <ConfidenceBadge level={visibleResult.confidenceLevel ?? undefined} />
                <ul className="mt-3 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
                  {visibleResult.confidenceRationale!
                    .filter((r) => !/^Internal score/.test(r))
                    .map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                </ul>
              </>
            )}
          </div>
        </ResultSection>
      )}

      {!isFull && lockedSections.length > 0 && (
        <ResultSection title="Locked in this preview">
          <LockedResultPanel sections={lockedSections} />
        </ResultSection>
      )}

      {scanCase.technician_notes && (
        <ResultSection title="Technician notes">
          <p className="text-sm text-[var(--text-secondary)]">{scanCase.technician_notes}</p>
        </ResultSection>
      )}
    </div>
  );
}
