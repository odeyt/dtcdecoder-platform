"use client";

// Honest Copying…/Copied/Copy failed states — never claims success before
// the Clipboard API actually resolves.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { formatReportForCopy } from "@/lib/scan-diagnostics/report-copy-format";
import { recordClientEvent } from "@/lib/analytics/client";
import type { ScanReportVisibleResult } from "@/lib/ai-diagnostics/redaction";

type CopyState = "idle" | "copying" | "copied" | "error";

export function CopyReportButton({ result }: { result: ScanReportVisibleResult }) {
  const [state, setState] = useState<CopyState>("idle");
  const t = useTranslations("scanReport");

  async function handleCopy() {
    setState("copying");
    recordClientEvent("diagnostic_report_copy_clicked");
    try {
      await navigator.clipboard.writeText(formatReportForCopy(result));
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
    >
      {state === "copying"
        ? t("copying")
        : state === "copied"
          ? t("copied")
          : state === "error"
            ? t("copyFailed")
            : t("copyReport")}
    </button>
  );
}
