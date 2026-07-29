import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { listCasesForOwner } from "@/lib/scan-diagnostics/cases";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getActiveSingleReportUnlocksForCases } from "@/lib/ai-diagnostics/single-report-purchases";
import { computeExpiryLabel } from "@/lib/scan-diagnostics/retention";
import { EditableCaseTitle } from "@/components/EditableCaseTitle";

export const metadata: Metadata = {
  title: "Diagnostic Cases",
  description: "Import a vehicle scan report and get a Professional Scan Analysis.",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  uploaded: "Uploaded",
  extracting: "Extracting",
  extraction_review: "Awaiting review",
  ready_for_analysis: "Ready for analysis",
  analyzing: "Analyzing",
  completed: "Completed",
  failed: "Failed",
};

export default async function DiagnosticsPage() {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");

  const cases = await listCasesForOwner(user.id);
  const plan = await getEffectivePlan(user.id, user.email ?? null);
  const completedCaseIds = cases.filter((c) => c.status === "completed").map((c) => c.id);
  const singleReportUnlocks = await getActiveSingleReportUnlocksForCases(completedCaseIds);

  function expiryLabel(caseId: string, createdAt: string): string | null {
    return computeExpiryLabel({ plan, createdAt, singleReportUnlockExpiresAt: singleReportUnlocks.get(caseId) });
  }

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Diagnostic Cases</h1>
            <p className="mt-2 text-[var(--text-secondary)]">
              Import a vehicle scan report and get a structured Professional Scan Analysis.
            </p>
          </div>
        </div>

        <Link
          href="/diagnostics/upload"
          className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
        >
          Import Vehicle Scan
        </Link>

        {cases.length === 0 ? (
          <div className="glass-panel mt-8 rounded-[var(--radius-xl)] p-8 text-center">
            <p className="text-[var(--text-secondary)]">You haven&apos;t uploaded a scan report yet.</p>
          </div>
        ) : (
          <ol className="mt-8 space-y-3">
            {cases.map((c) => (
              <li key={c.id} className="glass-panel relative rounded-[var(--radius-lg)] transition hover:border-[var(--border-red)]">
                {/* Full-card "stretched link" to the case detail page — kept
                    as a separate absolutely-positioned element (rather than
                    wrapping the whole card, the previous approach) so
                    EditableCaseTitle's button/input can sit in normal
                    document flow above it and handle their own clicks
                    without accidentally triggering navigation. */}
                <Link
                  href={`/diagnostics/${c.id}`}
                  className="absolute inset-0 rounded-[var(--radius-lg)]"
                  aria-label={`Open case: ${c.title || c.complaint || "Untitled case"}`}
                />
                <div className="relative flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                    <div className="relative z-10">
                      <EditableCaseTitle
                        caseId={c.id}
                        initialTitle={c.title}
                        fallback={c.complaint || "Untitled case"}
                      />
                    </div>
                    {c.status === "completed" && expiryLabel(c.id, c.created_at) && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{expiryLabel(c.id, c.created_at)}</p>
                    )}
                  </div>
                  <time
                    dateTime={c.created_at}
                    className="shrink-0 font-mono text-xs text-[var(--text-muted)]"
                  >
                    {new Date(c.created_at).toLocaleDateString()}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
