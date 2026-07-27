import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildCanonicalVehicleScan } from "@/lib/scan-diagnostics/canonical-scan";
import { detectPatterns } from "@/lib/scan-diagnostics/patterns";
import { computeDiagnosticPriority } from "@/lib/scan-diagnostics/priority";
import { buildCanonicalDiagnosticInput } from "@/lib/scan-diagnostics/canonical-input";
import { buildUserPrompt } from "@/lib/scan-diagnostics/ai/anthropic-provider";
import type { ScanCase, ScanDtcRecord, ScanExtraction, ScanPattern, ScanSystem } from "@/lib/types";

export const metadata: Metadata = { title: "Scan Inspection" };

type Props = { searchParams: Promise<{ caseId?: string }> };

// Admin-only debugging tool (see (app)/admin/layout.tsx for the
// isAllowedAdminEmail gate every /admin/* route inherits) — surfaces the
// full extraction pipeline for one case: canonical vehicle fields, per-
// system declared-vs-extracted DTC counts, derived categories, detected
// patterns, extraction warnings/quality, parser/prompt versions, and the
// EXACT AI prompt text that would be sent (rebuilt from the same
// buildUserPrompt the live analyze route calls — not a paraphrase). No raw
// uploaded-file text is stored anywhere in this schema (only structured
// extracted fields), so "raw extracted text" isn't shown — the canonical
// structured view below is the actual source of truth this app acts on.
export default async function ScanInspectionPage({ searchParams }: Props) {
  const { caseId } = await searchParams;

  if (!caseId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white">Scan Inspection</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Paste a scan_cases.id (visible in the URL of any /diagnostics/[caseId] page, or in Supabase) to inspect its
          full extraction pipeline.
        </p>
        <form className="mt-6 flex gap-2">
          <input
            name="caseId"
            placeholder="00000000-0000-0000-0000-000000000000"
            className="min-h-11 flex-1 rounded-md border border-white/10 bg-white/5 px-3 font-mono text-sm text-white"
          />
          <button type="submit" className="min-h-11 rounded-md bg-white px-5 text-sm font-semibold text-zinc-900">
            Inspect
          </button>
        </form>
      </div>
    );
  }

  const admin = createAdminClient();
  const [
    { data: scanCase },
    { data: extraction },
    { data: dtcRecords },
    { data: systems },
    { data: patternRows },
    { data: aiRuns },
  ] = await Promise.all([
    admin.from("scan_cases").select("*").eq("id", caseId).maybeSingle(),
    admin.from("scan_extractions").select("*").eq("case_id", caseId).maybeSingle(),
    admin.from("scan_dtc_records").select("*").eq("case_id", caseId).order("code"),
    admin.from("scan_systems").select("*").eq("case_id", caseId),
    admin.from("scan_patterns").select("*").eq("case_id", caseId),
    admin.from("scan_ai_runs").select("*").eq("case_id", caseId).order("completed_at", { ascending: false }),
  ]);

  if (!scanCase) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-white">Scan Inspection</h1>
        <p className="mt-2 text-sm text-red-400">No case found for id {caseId}.</p>
      </div>
    );
  }

  const typedCase = scanCase as ScanCase;
  const typedExtraction = (extraction as ScanExtraction | null) ?? null;
  const typedDtcRecords = (dtcRecords as ScanDtcRecord[]) ?? [];
  const typedSystems = (systems as ScanSystem[]) ?? [];
  const typedPatternRows = (patternRows as ScanPattern[]) ?? [];

  const canonicalScan = buildCanonicalVehicleScan(typedCase, typedExtraction, typedDtcRecords, typedSystems);
  const livePatterns = detectPatterns(canonicalScan);
  const priority = computeDiagnosticPriority(canonicalScan, livePatterns);
  const aiInput = buildCanonicalDiagnosticInput(typedCase, typedExtraction, typedDtcRecords, typedSystems);
  const promptText = buildUserPrompt(aiInput, new Map());

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">Scan Inspection — {caseId}</h1>
      <p className="mt-1 text-xs text-zinc-500">Status: {typedCase.status}</p>

      <Section title="Vehicle (canonical)">
        <Kv label="VIN" value={canonicalScan.vehicle.vin} />
        <Kv label="Year" value={canonicalScan.vehicle.year} />
        <Kv label="Make" value={canonicalScan.vehicle.make} />
        <Kv label="Model" value={canonicalScan.vehicle.model} />
        <Kv label="Engine" value={canonicalScan.vehicle.engine} />
        <Kv label="Mileage" value={canonicalScan.vehicle.mileage} />
        <Kv label="Scanner brand" value={canonicalScan.source.scannerBrand} />
        <Kv label="Vehicle software version" value={canonicalScan.source.vehicleSoftwareVersion} />
        <Kv label="Diagnostic app version" value={canonicalScan.source.diagnosticApplicationVersion} />
        <Kv label="Test time" value={canonicalScan.source.testTime} />
        <Kv label="Report type" value={canonicalScan.source.reportType} />
        <Kv label="Parser" value={typedExtraction ? `${typedExtraction.parser_id} v${typedExtraction.parser_version}` : null} />
      </Section>

      <Section title="Extraction quality">
        <Kv label="Truncated" value={String(canonicalScan.extractionQuality.truncated)} />
        <Kv label="Confidence" value={canonicalScan.extractionQuality.confidence} />
        <Kv label="Pages expected / parsed" value={`${canonicalScan.extractionQuality.pagesExpected ?? "—"} / ${canonicalScan.extractionQuality.pagesParsed ?? "—"}`} />
        <Kv label="Systems expected / parsed" value={`${canonicalScan.extractionQuality.systemsExpected ?? "—"} / ${canonicalScan.extractionQuality.systemsParsed ?? "—"}`} />
        <Kv label="DTCs expected / parsed" value={`${canonicalScan.extractionQuality.dtcsExpected ?? "—"} / ${canonicalScan.extractionQuality.dtcsParsed ?? "—"}`} />
        {canonicalScan.extractionQuality.warnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-amber-400">
            {canonicalScan.extractionQuality.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Systems parsed (${canonicalScan.systems.length})`}>
        <table className="mt-2 w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 text-zinc-500">
              <th className="py-1 pr-3">System</th>
              <th className="py-1 pr-3">Status</th>
              <th className="py-1 pr-3">Reported</th>
              <th className="py-1 pr-3">Extracted</th>
              <th className="py-1">Complete</th>
            </tr>
          </thead>
          <tbody>
            {canonicalScan.systems.map((s) => (
              <tr key={s.systemName} className="border-b border-white/5">
                <td className="py-1 pr-3 font-mono text-zinc-300">{s.systemName}</td>
                <td className="py-1 pr-3 text-zinc-300">{s.status}</td>
                <td className="py-1 pr-3 text-zinc-300">{s.dtcCountReported ?? "—"}</td>
                <td className="py-1 pr-3 text-zinc-300">{s.dtcCountExtracted}</td>
                <td className="py-1 text-zinc-300">
                  {s.extractionComplete ? "yes" : <span className="text-amber-400">no</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Derived categories">
        <Kv label="Current codes" value={canonicalScan.derivedCategories.currentCodes.join(", ") || "none"} />
        <Kv label="History codes" value={canonicalScan.derivedCategories.historyCodes.join(", ") || "none"} />
        <Kv label="Reference-only codes" value={canonicalScan.derivedCategories.referenceOnlyCodes.join(", ") || "none"} />
        <Kv label="Unknown-status codes" value={canonicalScan.derivedCategories.unknownStatusCodes.join(", ") || "none"} />
        <Kv label="Network faults" value={canonicalScan.derivedCategories.networkFaults.join(", ") || "none"} />
        <Kv label="Lost-communication faults" value={canonicalScan.derivedCategories.lostCommunicationFaults.join(", ") || "none"} />
        <Kv label="Battery/voltage faults" value={canonicalScan.derivedCategories.batteryVoltageFaults.join(", ") || "none"} />
        <Kv label="Bus-off faults" value={canonicalScan.derivedCategories.busOffFaults.join(", ") || "none"} />
        <Kv label="Safety-system faults" value={canonicalScan.derivedCategories.safetySystemFaults.join(", ") || "none"} />
      </Section>

      <Section title={`Detected patterns — live recompute (${livePatterns.length}), persisted (${typedPatternRows.length})`}>
        {livePatterns.length === 0 ? (
          <p className="text-xs text-zinc-500">None detected.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {livePatterns.map((p) => (
              <li key={p.patternType} className="text-xs text-zinc-300">
                <span className="font-mono uppercase text-amber-400">{p.severity}</span> — {p.name} (affected:{" "}
                {p.affectedModules.join(", ") || "n/a"})
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Diagnostic priority (live recompute)">
        <Kv label="Fix first" value={priority.fixFirst.map((d) => d.normalizedCode).join(", ") || "none"} />
        <Kv label="Diagnose next" value={priority.diagnoseNext.map((d) => d.normalizedCode).join(", ") || "none"} />
        <Kv label="Monitor / recheck" value={priority.monitorRecheck.map((d) => d.normalizedCode).join(", ") || "none"} />
        <Kv label="Historical / reference" value={priority.historicalReference.map((d) => d.normalizedCode).join(", ") || "none"} />
      </Section>

      <Section title={`AI runs (${aiRuns?.length ?? 0})`}>
        {(aiRuns ?? []).length === 0 ? (
          <p className="text-xs text-zinc-500">No AI runs recorded for this case yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(aiRuns ?? []).map((run) => (
              <li key={run.id} className="text-xs text-zinc-300">
                {run.status} — {run.provider_id} / {run.model_id} — prompt {run.prompt_version ?? "n/a"} —{" "}
                {run.completed_at ?? "in progress"}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Exact AI prompt (rebuilt from current data — will match what analyze sends if nothing changed since)">
        {aiInput.omittedFromPrompt && (
          <p className="mb-2 text-xs text-amber-400">
            {aiInput.omittedFromPrompt.count} low-priority DTC(s) would be omitted from this prompt.
          </p>
        )}
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-3 text-[11px] text-zinc-300">
          {promptText}
        </pre>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8 border-t border-white/10 pt-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kv({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <p className="text-xs text-zinc-400">
      <span className="text-zinc-500">{label}: </span>
      <span className="font-mono text-zinc-200">{value === null || value === undefined || value === "" ? "—" : value}</span>
    </p>
  );
}
