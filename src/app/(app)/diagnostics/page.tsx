import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { listCasesForOwner, listVinsForCaseIds } from "@/lib/scan-diagnostics/cases";

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
  // "completed" only means the AI analysis pipeline finished and a report
  // exists — it says nothing about whether a technician has reviewed it,
  // and the case stays fully editable (notes, test checkboxes,
  // verification checklist) after this. "Completed" read as final/locked
  // to at least one technician, so this label is deliberately softer than
  // the actual manual-completion feature (technician_completed_at) uses.
  completed: "Report ready",
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
  const vinByCaseId = await listVinsForCaseIds(cases.map((c) => c.id));

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
              <li key={c.id}>
                <Link
                  href={`/diagnostics/${c.id}`}
                  className="glass-panel block rounded-[var(--radius-lg)] p-4 transition hover:border-[var(--border-red)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                      <p className="mt-1 font-medium text-[var(--text-primary)]">
                        {c.complaint || "Untitled case"}
                      </p>
                      {vinByCaseId[c.id] && (
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">VIN: {vinByCaseId[c.id]}</p>
                      )}
                    </div>
                    <time
                      dateTime={c.created_at}
                      className="shrink-0 font-mono text-xs text-[var(--text-muted)]"
                    >
                      {new Date(c.created_at).toLocaleDateString()}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
