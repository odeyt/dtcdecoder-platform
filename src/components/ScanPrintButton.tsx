"use client";

// Plain browser printing — no PDF-generation system exists in this repo
// yet, and the spec is explicit that's acceptable for the first release.
import { recordClientEvent } from "@/lib/analytics/client";

export function ScanPrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        recordClientEvent("diagnostic_report_print_clicked");
        window.print();
      }}
      className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
    >
      Print / Export
    </button>
  );
}
