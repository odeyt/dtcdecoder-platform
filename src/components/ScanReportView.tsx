import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { ResultSection } from "@/components/ResultSection";
import { UpgradeCard } from "@/components/UpgradeCard";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { ResultPill } from "@/components/ResultPill";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { CopyReportButton } from "@/components/scan-report/CopyReportButton";
import { ReportViewedTracker } from "@/components/scan-report/ReportViewedTracker";
import { WorkbenchSaveStatusProvider, SaveStatusIndicator } from "@/components/scan-report/WorkbenchSaveStatus";
import { TestPlanSection } from "@/components/scan-report/TestPlanSection";
import { LikelyCausesSection } from "@/components/scan-report/LikelyCausesSection";
import { TechnicianNotesSection } from "@/components/scan-report/TechnicianNotesSection";
import { VerificationChecklistSection } from "@/components/scan-report/VerificationChecklistSection";
import { CaseCompletionSection } from "@/components/scan-report/CaseCompletionSection";
import { classifyDtcCategories } from "@/lib/scan-diagnostics/parsers/category-classification";
import { isLegacyReport } from "@/lib/scan-diagnostics/report-presentation";
import type { DtcCategory } from "@/lib/scan-diagnostics/schemas";
import type { CompletionSummary } from "@/lib/scan-diagnostics/workbench";
import type { ScanReportAccessResult } from "@/lib/ai-diagnostics/redaction";
import type {
  ScanCase,
  ScanCaseNote,
  ScanCaseVerification,
  ScanDtcRecord,
  ScanExtraction,
  ScanReportCauseStatus,
  ScanReportTestProgress,
} from "@/lib/types";

interface SafetyFinding {
  ruleId: string;
  severity: "block" | "warn";
  message: string;
}

// Populated only when accessLevel === "full" and a completed report exists
// — see src/app/(app)/diagnostics/[caseId]/page.tsx. A Free-preview viewer
// or a case with no report yet gets no Workbench data at all, never an
// empty-but-present shell of it.
interface WorkbenchData {
  testProgress: ScanReportTestProgress[];
  causeStatus: ScanReportCauseStatus[];
  notes: ScanCaseNote[];
  verification: ScanCaseVerification | null;
  completionSummary: CompletionSummary;
}

interface ScanReportViewProps {
  scanCase: ScanCase;
  extraction: ScanExtraction | null;
  dtcRecords: ScanDtcRecord[];
  // Already server-redacted for the viewer's real, current plan — never
  // the raw ScanReport row. See src/lib/scan-diagnostics/report-access.ts.
  reportAccess: ScanReportAccessResult;
  workbench?: WorkbenchData;
}

function CategoryBadge({
  label,
  category,
  foundLabel,
  noneReportedLabel,
  notStatedLabel,
}: {
  label: string;
  category: DtcCategory;
  foundLabel: string;
  noneReportedLabel: string;
  notStatedLabel: string;
}) {
  const found = category.status === "found";
  const noneReported = category.status === "none_reported";
  return (
    <div className="glass-panel flex flex-col gap-1 rounded-[var(--radius-lg)] p-4">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
      <p
        className="font-mono text-xs font-semibold uppercase tracking-wide"
        style={{ color: found ? "var(--accent-red)" : "var(--text-muted)" }}
      >
        {found ? foundLabel : noneReported ? noneReportedLabel : notStatedLabel}
      </p>
      {found && category.codes.length > 0 && (
        <p className="font-mono text-sm font-semibold text-[var(--text-secondary)]">{category.codes.join(", ")}</p>
      )}
    </div>
  );
}

// Content prepared by DTC Technician is always visually distinguished from
// extracted/user-entered data (the section headers below make this
// explicit) and is never presented as OEM service information — see
// docs/SCAN_REPORT_ANALYSIS.md and docs/DIAGNOSTIC_SAFETY_RULES.md.
export async function ScanReportView({ scanCase, extraction, dtcRecords, reportAccess, workbench }: ScanReportViewProps) {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "scanReport" });
  const { visibleResult, accessLevel, lockedSections } = reportAccess;
  const isFull = accessLevel === "full";
  const safetyFindings = visibleResult.safety.findings as unknown as SafetyFinding[];
  const categories = classifyDtcCategories(dtcRecords, extraction?.modules ?? []);
  const legacyReport = isFull
    ? isLegacyReport({ schema_version: visibleResult.schemaVersion, confidence_level: visibleResult.confidenceLevel ?? null })
    : false;
  const isComplete = Boolean(scanCase.technician_completed_at);
  const freezeFrames = extraction?.freeze_frame ?? [];

  const moduleStatusLabel: Record<string, string> = {
    faulted: t("statusFaulted"),
    ok: t("statusOk"),
    unknown: t("statusUnknown"),
  };
  const patternSeverityLabel: Record<string, string> = {
    info: t("severityInfo"),
    warn: t("severityWarn"),
    critical: t("severityCritical"),
  };
  const ruleSeverityLabel: Record<string, string> = {
    block: t("ruleSeverityBlock"),
    warn: t("ruleSeverityWarn"),
  };
  const confidenceKey: Record<string, string> = {
    high: "confidenceHigh",
    medium: "confidenceMedium",
    low: "confidenceLow",
    insufficient_evidence: "confidenceInsufficientEvidence",
  };

  return (
    <WorkbenchSaveStatusProvider>
      <ReportViewedTracker accessLevel={accessLevel} />
      <div className="flex flex-col gap-10 print:gap-6" data-testid="diagnostic-report-content">
        {/* --- Case Header --- */}
        <header className="print:hidden">
          <p className="font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">{t("eyebrow")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
              {t("preparedBadge")}
            </span>
            {!isFull && (
              <span className="rounded-full border border-[var(--border-red)] px-3 py-1 text-xs font-semibold text-[var(--accent-red)]">
                {t("freePreviewBadge")}
              </span>
            )}
          </div>
          <p className="mt-3 max-w-2xl text-sm text-[var(--text-muted)]">{t("disclosure")}</p>

          {isFull && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <CopyReportButton result={visibleResult} />
              {!isComplete && (
                <>
                  <a href="#technician-notes" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {t("addNote")}
                  </a>
                  <a href="#case-completion" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    {t("markComplete")}
                  </a>
                </>
              )}
              <SaveStatusIndicator />
            </div>
          )}
        </header>

        {!isFull && <UpgradeCard reason={t("upgradeReason")} />}

        {/* --- Status Summary --- */}
        <ResultSection title={t("statusSummaryTitle")}>
          <div className="flex flex-wrap gap-2">
            <ResultPill
              category="status"
              value={isComplete ? "confirmed" : "in_progress"}
              label={isComplete ? t("caseComplete") : t("inProgress")}
            />
            {safetyFindings.length > 0 && (
              <ResultPill category="status" value="action_required" label={t("safetyWarningsPresent")} />
            )}
            {legacyReport && <ResultPill category="status" value="unverified" label={t("legacyReportBadge")} />}
          </div>
        </ResultSection>

        <ResultSection title={t("vehicleInfoTitle")}>
          <div className="glass-panel grid gap-2 rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
            <p>
              {t("vin")} <span className="text-[var(--text-primary)]">{visibleResult.vehicleSummary.vin ?? t("notProvidedInReport")}</span>
            </p>
            <p>
              {t("vehicle")}{" "}
              <span className="text-[var(--text-primary)]">
                {[visibleResult.vehicleSummary.modelYear, visibleResult.vehicleSummary.make, visibleResult.vehicleSummary.model]
                  .filter(Boolean)
                  .join(" ") || t("notProvidedInReport")}
              </span>
            </p>
            <p>
              {t("engine")}{" "}
              <span className="text-[var(--text-primary)]">{visibleResult.vehicleSummary.engine ?? t("notProvidedInReport")}</span>
            </p>
            <p>
              {t("mileage")}{" "}
              <span className="text-[var(--text-primary)]">
                {visibleResult.vehicleSummary.odometerMiles
                  ? visibleResult.vehicleSummary.odometerMiles.toLocaleString()
                  : t("notProvidedInReport")}
              </span>
            </p>
            {(visibleResult.scannerMeta.scannerBrand ||
              visibleResult.scannerMeta.vehicleSoftwareVersion ||
              visibleResult.scannerMeta.diagnosticApplicationVersion ||
              visibleResult.scannerMeta.testTime) && (
              <>
                <p>
                  {t("scanner")}{" "}
                  <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.scannerBrand ?? t("notIdentified")}</span>
                </p>
                <p>
                  {t("vehicleSoftware")}{" "}
                  <span className="text-[var(--text-primary)]">
                    {visibleResult.scannerMeta.vehicleSoftwareVersion ?? t("notProvided")}
                  </span>
                </p>
                <p>
                  {t("scanTime")}{" "}
                  <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.testTime ?? t("notProvided")}</span>
                </p>
                <p>
                  {t("reportType")}{" "}
                  <span className="text-[var(--text-primary)]">{visibleResult.scannerMeta.reportType ?? t("notStated")}</span>
                </p>
              </>
            )}
          </div>
          {visibleResult.extractionQuality.truncated && (
            <p
              role="alert"
              className="mt-3 rounded-[var(--radius-md)] border p-3 text-sm text-[var(--text-secondary)]"
              style={{ borderColor: "var(--accent-amber)", background: "rgba(217, 154, 63, 0.08)" }}
            >
              {t("truncatedWarning")}
            </p>
          )}
        </ResultSection>

        {/* --- Vehicle Health Summary --- */}
        <ResultSection title={t("healthSummaryTitle")}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t("faultedSystems"), value: visibleResult.healthSummary.faultedSystemCount },
              { label: t("systemsOk"), value: visibleResult.healthSummary.okSystemCount },
              { label: t("totalDtcs"), value: visibleResult.healthSummary.totalDtcCount },
              { label: t("current"), value: visibleResult.healthSummary.currentCount },
              { label: t("history"), value: visibleResult.healthSummary.historyCount },
              { label: t("permanentActive"), value: visibleResult.healthSummary.permanentCount },
              { label: t("intermittentActive"), value: visibleResult.healthSummary.intermittentCount },
              { label: t("networkFaults"), value: visibleResult.healthSummary.networkCount },
              { label: t("batteryVoltage"), value: visibleResult.healthSummary.batteryVoltageCount },
              { label: t("safetyCritical"), value: visibleResult.healthSummary.safetyCriticalCount },
            ].map(({ label, value }) => (
              <div key={label} className="glass-panel rounded-[var(--radius-lg)] p-4 text-center">
                <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{label}</p>
              </div>
            ))}
          </div>
        </ResultSection>

        {visibleResult.moduleHealthTable.length > 0 && (
          <ResultSection title={t("moduleHealthTitle")}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-[var(--text-secondary)]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-xs uppercase text-[var(--text-muted)]">
                    <th className="py-2 pr-4">{t("systemModule")}</th>
                    <th className="py-2 pr-4">{t("status")}</th>
                    <th className="py-2 pr-4">{t("dtcsColumn")}</th>
                    <th className="py-2 pr-4">{t("extractionColumn")}</th>
                    <th className="py-2">{t("highestPriority")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleResult.moduleHealthTable.map((row) => (
                    <tr key={row.systemName} className="border-b border-[var(--border-subtle)] last:border-0">
                      <td className="py-2 pr-4 text-[var(--text-primary)]">{row.systemName}</td>
                      <td className="py-2 pr-4">
                        <span
                          className="whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-xs font-semibold uppercase"
                          style={{
                            borderColor: row.status === "faulted" ? "var(--accent-red)" : "var(--border-subtle)",
                            color: row.status === "faulted" ? "var(--accent-red)" : "var(--text-muted)",
                          }}
                        >
                          {moduleStatusLabel[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="py-2 pr-4 font-mono text-sm">
                        {row.dtcCountExtracted}
                        {row.dtcCountReported != null ? ` / ${row.dtcCountReported}` : ""}
                      </td>
                      <td className="py-2 pr-4 text-sm">
                        {row.extractionComplete ? (
                          t("completeStatus")
                        ) : (
                          <span style={{ color: "var(--accent-amber)" }}>{t("incompleteStatus")}</span>
                        )}
                      </td>
                      <td className="py-2 font-mono text-sm font-semibold text-[var(--text-primary)]">{row.highestPriorityFault ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ResultSection>
        )}

        {visibleResult.patterns.length > 0 && (
          <ResultSection title={t("patternsTitle")}>
            <div className="flex flex-col gap-2">
              {visibleResult.patterns.map((pattern) => (
                <div key={pattern.patternType} className="glass-panel rounded-[var(--radius-lg)] p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-xs font-semibold uppercase"
                      style={{
                        borderColor: pattern.severity === "critical" ? "var(--accent-red)" : "var(--accent-amber)",
                        color: pattern.severity === "critical" ? "var(--accent-red)" : "var(--accent-amber)",
                      }}
                    >
                      {patternSeverityLabel[pattern.severity] ?? pattern.severity}
                    </span>
                    <p className="text-sm font-semibold text-[var(--text-primary)]">{pattern.name}</p>
                  </div>
                  {pattern.affectedModules.length > 0 && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      {t("affected")} {pattern.affectedModules.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ResultSection>
        )}

        {/* --- Priority Findings --- */}
        {isFull && visibleResult.priority && (
          <ResultSection title={t("priorityFindingsTitle")}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: t("fixFirst"), codes: visibleResult.priority.fixFirstCodes, severity: "critical" as const },
                { label: t("diagnoseNext"), codes: visibleResult.priority.diagnoseNextCodes, severity: "medium" as const },
                { label: t("monitorRecheck"), codes: visibleResult.priority.monitorRecheckCodes, severity: "low" as const },
                {
                  label: t("historicalReference"),
                  codes: visibleResult.priority.historicalReferenceCodes,
                  severity: "informational" as const,
                },
              ].map(({ label, codes, severity }) => (
                <div key={label} className="glass-panel rounded-[var(--radius-lg)] p-4">
                  <ResultPill category="severity" value={severity} label={label} />
                  <p className="mt-2 font-mono text-sm font-semibold text-[var(--text-primary)]">
                    {codes.length > 0 ? codes.join(", ") : t("none")}
                  </p>
                </div>
              ))}
            </div>
          </ResultSection>
        )}

        <ResultSection title={t("customerComplaintTitle")}>
          <div className="glass-panel rounded-[var(--radius-lg)] p-5">
            {scanCase.complaint ? (
              <p className="text-lg font-semibold leading-7 text-[var(--text-primary)]">{scanCase.complaint}</p>
            ) : (
              <p className="text-base font-medium text-[var(--text-muted)]">{t("notProvidedPlain")}</p>
            )}
            {scanCase.symptoms.length > 0 && (
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text-primary)]">{t("symptoms")} </span>
                {scanCase.symptoms.join(", ")}
              </p>
            )}
          </div>
        </ResultSection>

        <ResultSection title={t("faultCategoriesTitle")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CategoryBadge
              label={t("pendingCodes")}
              category={categories.pendingCodes}
              foundLabel={t("found")}
              noneReportedLabel={t("noneReported")}
              notStatedLabel={t("notStatedInReport")}
            />
            <CategoryBadge
              label={t("permanentCodes")}
              category={categories.permanentCodes}
              foundLabel={t("found")}
              noneReportedLabel={t("noneReported")}
              notStatedLabel={t("notStatedInReport")}
            />
            <CategoryBadge
              label={t("networkFaults")}
              category={categories.networkFaults}
              foundLabel={t("found")}
              noneReportedLabel={t("noneReported")}
              notStatedLabel={t("notStatedInReport")}
            />
            <CategoryBadge
              label={t("lostCommFaults")}
              category={categories.lostCommunicationFaults}
              foundLabel={t("found")}
              noneReportedLabel={t("noneReported")}
              notStatedLabel={t("notStatedInReport")}
            />
            <CategoryBadge
              label={t("batteryRelatedFaults")}
              category={categories.batteryRelatedFaults}
              foundLabel={t("found")}
              noneReportedLabel={t("noneReported")}
              notStatedLabel={t("notStatedInReport")}
            />
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{t("categoryFootnote")}</p>
        </ResultSection>

        <ResultSection title={t("dtcsRecordedTitle")}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {visibleResult.dtcs.map((dtc, i) => (
              <div
                key={i}
                className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2"
              >
                <p className="font-mono text-lg font-bold tracking-tight text-[var(--text-primary)]">{dtc.code}</p>
                {(dtc.module || dtc.status) && (
                  <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                    {[dtc.module, dtc.status].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            ))}
            {visibleResult.dtcs.length === 0 && <p className="text-sm text-[var(--text-muted)]">{t("noDtcRecords")}</p>}
          </div>
        </ResultSection>

        {isFull ? (
          <>
            {visibleResult.requestedLocale && visibleResult.requestedLocale !== "en" && (
              <p className="text-xs text-[var(--text-muted)]">
                {visibleResult.fallbackUsed
                  ? t("translatedFallback", { locale: visibleResult.requestedLocale })
                  : t("translatedSuccess", { locale: visibleResult.resolvedLocale ?? "" })}
              </p>
            )}

            {/* --- Evidence Panel --- */}
            <ResultSection title={t("evidencePanelTitle")}>
              <div className="flex flex-col gap-3">
                {visibleResult.missingInformation && visibleResult.missingInformation.length > 0 && (
                  <div className="glass-panel rounded-[var(--radius-lg)] p-4">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{t("missingInformation")}</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-[var(--text-secondary)]">
                      {visibleResult.missingInformation.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {visibleResult.extractionQuality.warnings.length > 0 && (
                  <div className="glass-panel rounded-[var(--radius-lg)] p-4">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{t("extractionWarnings")}</p>
                    <ul className="mt-1 list-disc pl-5 text-sm text-[var(--text-secondary)]">
                      {visibleResult.extractionQuality.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {freezeFrames.length > 0 && (
                  <div className="glass-panel rounded-[var(--radius-lg)] p-4">
                    <p className="text-xs font-semibold text-[var(--text-primary)]">{t("freezeFrameData")}</p>
                    <div className="mt-2 flex flex-col gap-2">
                      {freezeFrames.map((frame, i) => (
                        <div key={i} className="font-mono text-sm leading-6 text-[var(--text-secondary)]">
                          {Object.entries(frame)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(", ")}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(!visibleResult.missingInformation || visibleResult.missingInformation.length === 0) &&
                  visibleResult.extractionQuality.warnings.length === 0 &&
                  freezeFrames.length === 0 && <p className="text-sm text-[var(--text-muted)]">{t("noEvidence")}</p>}
              </div>
            </ResultSection>

            {/* --- Likely Causes --- */}
            <ResultSection title={t("likelyCausesTitle")}>
              <div data-testid="scan-analysis-content">
                <LikelyCausesSection
                  caseId={scanCase.id}
                  causes={visibleResult.rankedCauses ?? []}
                  initialStatus={workbench?.causeStatus ?? []}
                />
              </div>
            </ResultSection>

            {/* --- Repair Recommendation --- */}
            {visibleResult.rankedCauses && visibleResult.rankedCauses.length > 0 && (
              <ResultSection title={t("repairRecommendationTitle")}>
                <div className="glass-panel rounded-[var(--radius-lg)] p-5">
                  <p className="text-sm text-[var(--text-muted)]">{t("basedOnTopCause")}</p>
                  <p className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{visibleResult.rankedCauses[0].cause}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">{t("confirmBeforeRepairing")} </span>
                    {visibleResult.rankedCauses[0].confirmationTestsRequired &&
                    visibleResult.rankedCauses[0].confirmationTestsRequired!.length > 0
                      ? visibleResult.rankedCauses[0].confirmationTestsRequired!.join("; ")
                      : t("seeTestSequence")}
                  </p>
                </div>
              </ResultSection>
            )}

            {/* --- Interactive Diagnostic Test Plan --- */}
            <ResultSection title={t("testPlanTitle")}>
              <TestPlanSection
                caseId={scanCase.id}
                tests={visibleResult.recommendedTests ?? []}
                initialProgress={workbench?.testProgress ?? []}
              />
            </ResultSection>
          </>
        ) : (
          <ResultSection title={t("lockedTitle")}>
            <div className="glass-panel rounded-[var(--radius-lg)] p-5">
              <p className="text-sm text-[var(--text-secondary)]">{t("lockedBody")}</p>
            </div>
          </ResultSection>
        )}

        {safetyFindings.length > 0 && (
          <ResultSection title={t("safetyWarningsTitle")}>
            <div
              role="alert"
              className="rounded-[var(--radius-lg)] border-2 p-5"
              style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
            >
              <ul className="flex flex-col gap-2 text-sm text-[var(--text-primary)]">
                {safetyFindings.map((f, i) => (
                  <li key={i}>
                    <span className="font-mono text-xs font-semibold uppercase text-[var(--accent-red)]">
                      {ruleSeverityLabel[f.severity] ?? f.severity}
                    </span>{" "}
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          </ResultSection>
        )}

        {isFull && (
          <ResultSection title={t("diagnosticConfidenceTitle")}>
            <div className="glass-panel rounded-[var(--radius-lg)] p-5">
              {legacyReport ? (
                <>
                  <p className="text-lg font-bold text-[var(--text-muted)]">{t("notEstablished")}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{t("legacyConfidenceBody")}</p>
                </>
              ) : (
                <>
                  <ConfidenceBadge
                    level={visibleResult.confidenceLevel ?? undefined}
                    label={
                      visibleResult.confidenceLevel && confidenceKey[visibleResult.confidenceLevel]
                        ? t(confidenceKey[visibleResult.confidenceLevel])
                        : undefined
                    }
                  />
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm leading-6 text-[var(--text-secondary)]">
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
          <ResultSection title={t("lockedInPreviewTitle")}>
            <LockedResultPanel sections={lockedSections} />
          </ResultSection>
        )}

        {scanCase.technician_notes && (
          <ResultSection title={t("notesFromUploadTitle")}>
            <p className="text-sm text-[var(--text-secondary)]">{scanCase.technician_notes}</p>
          </ResultSection>
        )}

        {isFull && workbench && (
          <>
            {/* --- Technician Notes --- */}
            <ResultSection id="technician-notes" title={t("technicianNotesTitle")}>
              <TechnicianNotesSection caseId={scanCase.id} initialNotes={workbench.notes} />
            </ResultSection>

            {/* --- Verification Checklist --- */}
            <ResultSection title={t("verificationChecklistTitle")}>
              <VerificationChecklistSection caseId={scanCase.id} initialVerification={workbench.verification} />
            </ResultSection>

            {/* --- Case Completion --- */}
            <ResultSection id="case-completion" title={t("caseCompletionTitle")}>
              <CaseCompletionSection
                caseId={scanCase.id}
                summary={workbench.completionSummary}
                initialCompletedAt={scanCase.technician_completed_at}
              />
            </ResultSection>
          </>
        )}
      </div>
    </WorkbenchSaveStatusProvider>
  );
}
