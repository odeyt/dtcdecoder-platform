"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Language } from "@/lib/types";

// Changes scan_cases.report_language on an ALREADY-GENERATED report, then
// refreshes the page — resolveReportAccess re-derives the localized view
// on the next render via the already-working translation engine
// (getOrCreateLocalizedReport, cached per-locale in
// scan_report_localizations), so switching back to a previously-viewed
// language is instant, not a re-translation.
export function ScanReportLanguageSwitcher({
  caseId,
  currentLanguage,
  availableLocales,
}: {
  caseId: string;
  currentLanguage: string;
  availableLocales: Language[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to switch to if this plan has no translatable locales at all.
  if (availableLocales.length === 0) return null;

  async function handleChange(locale: string) {
    if (locale === currentLanguage) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/scan-diagnostics/cases/${caseId}/language`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Unable to change the report language.");
        setLoading(false);
        return;
      }
      router.refresh();
    } catch {
      setError("Unable to change the report language.");
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="report-language-select" className="sr-only">
        Report language
      </label>
      <select
        id="report-language-select"
        value={currentLanguage}
        disabled={loading}
        onChange={(e) => handleChange(e.target.value)}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] disabled:opacity-60"
      >
        <option value="en">English</option>
        {availableLocales.map((locale) => (
          <option key={locale.locale_code} value={locale.locale_code}>
            {locale.english_name}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-[var(--accent-red)]">{error}</p>}
    </div>
  );
}
