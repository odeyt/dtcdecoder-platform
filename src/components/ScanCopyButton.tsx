"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ScanReportAccessResult } from "@/lib/ai-diagnostics/redaction";
import { formatReportForClipboard } from "@/lib/scan-diagnostics/report-clipboard";

// The report is already fully rendered on the page (ScanReportView) — this
// just re-serializes the same already-visible reportAccess.visibleResult
// as plain text, so there's no server round-trip and nothing beyond what's
// already on screen is ever touched.
export function ScanCopyButton({ reportAccess }: { reportAccess: ScanReportAccessResult }) {
  const t = useTranslations("scanReport");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(formatReportForClipboard(reportAccess));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be denied by the browser/permissions — a
      // failed copy just leaves the button unchanged, never an error page.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/5"
    >
      <span role="status" aria-live="polite">
        {copied ? t("copied") : t("copyReport")}
      </span>
    </button>
  );
}
