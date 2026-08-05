"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

// Inline rename for a diagnostic case's custom title (scan_cases.title,
// migration 0038) — separate from `complaint`, the actual diagnostic
// input text, so renaming a case for organizational purposes never
// touches what was actually diagnosed. Lives on a case-list row that is
// itself a full-card "stretched link" to the case detail page (see
// diagnostics/page.tsx) — the edit button/input sit in normal document
// flow above that overlay link and handle their own clicks, so renaming
// never accidentally navigates away.
export function EditableCaseTitle({
  caseId,
  initialTitle,
  fallback,
}: {
  caseId: string;
  initialTitle: string | null;
  fallback: string;
}) {
  const t = useTranslations("scanCases");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(initialTitle);
  const [value, setValue] = useState(initialTitle ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/scan-diagnostics/cases/${caseId}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.title ?? null);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
          if (e.key === "Escape") {
            setValue(saved ?? "");
            setEditing(false);
          }
        }}
        maxLength={120}
        placeholder={fallback}
        aria-label={t("caseTitleLabel")}
        className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-red)] bg-[var(--surface-1)] px-2 py-1 text-sm font-medium text-[var(--text-primary)] focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={saving}
      className="group mt-1 flex min-h-11 items-center gap-1.5 text-left disabled:opacity-60"
      aria-label={t("renameCaseLabel", { title: saved || fallback })}
    >
      <span className="font-medium text-[var(--text-primary)]">{saved || fallback}</span>
      <svg
        aria-hidden="true"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100"
      >
        <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
