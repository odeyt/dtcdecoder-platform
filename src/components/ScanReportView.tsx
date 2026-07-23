import { ResultSection } from "@/components/ResultSection";
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanReport } from "@/lib/types";

interface RankedCause {
  cause: string;
  probabilityPercent: number;
  rationale: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
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
  report: ScanReport;
}

// AI-generated content is always visually distinguished from extracted/
// user-entered data (the section headers below make this explicit) and is
// never presented as OEM service information — see docs/SCAN_REPORT_ANALYSIS.md.
export function ScanReportView({ scanCase, extraction, dtcRecords, report }: ScanReportViewProps) {
  const rankedCauses = report.ranked_causes as unknown as RankedCause[];
  const recommendedTests = report.recommended_tests as unknown as RecommendedTest[];
  const safetyFindings = report.safety_warnings as unknown as SafetyFinding[];

  return (
    <div className="flex flex-col gap-10 print:gap-6">
      <header className="print:hidden">
        <p className="font-mono text-xs uppercase tracking-wide text-[var(--text-muted)]">Diagnostic report</p>
        <div className="mt-2 flex items-center gap-3">
          <span className="rounded-full border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold text-[var(--text-secondary)]">
            AI-generated — not OEM service information
          </span>
        </div>
      </header>

      <ResultSection title="Vehicle information">
        <div className="glass-panel grid gap-2 rounded-[var(--radius-lg)] p-5 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
          <p>VIN: <span className="text-[var(--text-primary)]">{extraction?.vin ?? "not provided"}</span></p>
          <p>
            Vehicle:{" "}
            <span className="text-[var(--text-primary)]">
              {extraction?.model_year ?? "?"} {extraction?.make ?? ""} {extraction?.model ?? ""}
            </span>
          </p>
          {extraction?.engine && <p>Engine: <span className="text-[var(--text-primary)]">{extraction.engine}</span></p>}
          {extraction?.odometer_miles && (
            <p>Mileage: <span className="text-[var(--text-primary)]">{extraction.odometer_miles.toLocaleString()}</span></p>
          )}
        </div>
      </ResultSection>

      <ResultSection title="Customer complaint">
        <p className="text-sm text-[var(--text-secondary)]">{scanCase.complaint ?? "Not provided"}</p>
        {scanCase.symptoms.length > 0 && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">Symptoms: {scanCase.symptoms.join(", ")}</p>
        )}
      </ResultSection>

      <ResultSection title="DTCs found">
        <div className="flex flex-wrap gap-2">
          {dtcRecords.map((dtc) => (
            <span
              key={dtc.id}
              className="rounded-full border border-[var(--border-subtle)] px-3 py-1 font-mono text-xs text-[var(--text-secondary)]"
            >
              {dtc.code}
              {dtc.module ? ` (${dtc.module})` : ""}
            </span>
          ))}
          {dtcRecords.length === 0 && <p className="text-sm text-[var(--text-muted)]">None</p>}
        </div>
      </ResultSection>

      <ResultSection title="Ranked root causes (AI-generated)">
        <div className="flex flex-col gap-4">
          {rankedCauses.map((cause, i) => (
            <div key={i} className="glass-panel rounded-[var(--radius-lg)] p-5">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold"
                  style={{
                    borderColor: i === 0 ? "var(--accent-red)" : "var(--border-subtle)",
                    color: i === 0 ? "var(--accent-red)" : "var(--text-muted)",
                  }}
                >
                  {i === 0 ? "MOST LIKELY" : `#${i + 1}`} · {cause.probabilityPercent}%
                </span>
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
            </div>
          ))}
        </div>
      </ResultSection>

      <ResultSection title="Recommended test sequence (AI-generated)">
        <ol className="flex flex-col gap-3">
          {recommendedTests.map((test, i) => (
            <li key={i} className="glass-panel rounded-[var(--radius-lg)] p-4">
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                {i + 1}. {test.step}
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Purpose: {test.purpose}</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">Expected result: {test.expectedResult}</p>
            </li>
          ))}
          {recommendedTests.length === 0 && <p className="text-sm text-[var(--text-muted)]">None recommended.</p>}
        </ol>
      </ResultSection>

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

      {report.missing_information.length > 0 && (
        <ResultSection title="Missing information">
          <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)]">
            {report.missing_information.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </ResultSection>
      )}

      <ResultSection title="Confidence">
        <div className="glass-panel rounded-[var(--radius-lg)] p-5">
          <p className="text-2xl font-bold text-[var(--text-primary)]">{report.confidence}%</p>
          <ul className="mt-3 flex flex-col gap-1 text-xs text-[var(--text-secondary)]">
            {report.confidence_rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </ResultSection>

      {scanCase.technician_notes && (
        <ResultSection title="Technician notes">
          <p className="text-sm text-[var(--text-secondary)]">{scanCase.technician_notes}</p>
        </ResultSection>
      )}
    </div>
  );
}
