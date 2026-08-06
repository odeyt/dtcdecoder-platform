"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface HistoryEntry {
  id: string;
  kind: "lookup" | "ai";
  query: string;
  created_at: string;
  dtc_code: { code: string; title: string; make: string | null; slug: string } | null;
}

const secondaryButtonClass =
  "min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)] disabled:opacity-60";
const primaryButtonClass =
  "min-h-11 rounded-full bg-[var(--accent-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60";

export function HistoryList({
  initialEntries,
  locale,
}: {
  initialEntries: HistoryEntry[];
  locale: string;
}) {
  const t = useTranslations("history");
  const [entries, setEntries] = useState(initialEntries);

  function handleUpdated(id: string, query: string) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, query } : e)));
  }

  function handleDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  if (entries.length === 0) {
    return (
      <div className="glass-panel mt-8 rounded-[var(--radius-xl)] p-8 text-center">
        <p className="text-[var(--text-secondary)]">{t("empty")}</p>
        <Link
          href="/dtc"
          className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
        >
          {t("decodeACode")}
        </Link>
      </div>
    );
  }

  return (
    <ol className="mt-8 space-y-3">
      {entries.map((entry) => (
        <HistoryRow
          key={entry.id}
          entry={entry}
          locale={locale}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      ))}
    </ol>
  );
}

type RowMode = "view" | "editing" | "confirmDelete";

function HistoryRow({
  entry,
  locale,
  onUpdated,
  onDeleted,
}: {
  entry: HistoryEntry;
  locale: string;
  onUpdated: (id: string, query: string) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("history");
  const [mode, setMode] = useState<RowMode>("view");
  const [draft, setDraft] = useState(entry.query);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function startEditing() {
    setDraft(entry.query);
    setErrorMessage(null);
    setMode("editing");
  }

  function cancelEditing() {
    setErrorMessage(null);
    setMode("view");
  }

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setErrorMessage(t("queryRequired"));
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/history/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      if (!res.ok) {
        setErrorMessage(t("updateFailed"));
        return;
      }
      onUpdated(entry.id, trimmed);
      setMode("view");
    } catch {
      setErrorMessage(t("updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/history/${entry.id}`, { method: "DELETE" });
      if (!res.ok) {
        setErrorMessage(t("deleteFailed"));
        setBusy(false);
        return;
      }
      onDeleted(entry.id);
    } catch {
      setErrorMessage(t("deleteFailed"));
      setBusy(false);
    }
  }

  return (
    <li className="glass-panel rounded-[var(--radius-lg)] p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            {entry.kind === "ai" ? t("aiQuestion") : t("lookup")}
          </span>

          {mode === "editing" ? (
            <div className="mt-2 flex flex-col gap-2">
              <label htmlFor={`history-edit-${entry.id}`} className="sr-only">
                {entry.query}
              </label>
              <input
                id={`history-edit-${entry.id}`}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={500}
                disabled={busy}
                className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)]"
              />
              {errorMessage && <p className="text-xs text-[var(--accent-red)]">{errorMessage}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={saveEdit} disabled={busy} className={primaryButtonClass}>
                  {busy ? t("saving") : t("save")}
                </button>
                <button type="button" onClick={cancelEditing} disabled={busy} className={secondaryButtonClass}>
                  {t("cancel")}
                </button>
              </div>
            </div>
          ) : entry.dtc_code ? (
            <Link
              href={entry.dtc_code.make ? `/${entry.dtc_code.make}/${entry.dtc_code.slug}` : `/dtc/${entry.dtc_code.slug}`}
              className="mt-1 block truncate font-medium text-[var(--text-primary)] hover:text-[var(--accent-red)]"
            >
              {entry.query}
            </Link>
          ) : (
            <p className="mt-1 truncate font-medium text-[var(--text-primary)]">{entry.query}</p>
          )}
        </div>

        {mode !== "editing" && (
          <time dateTime={entry.created_at} className="shrink-0 font-mono text-xs text-[var(--text-muted)]">
            {new Date(entry.created_at).toLocaleDateString(locale)}
          </time>
        )}
      </div>

      {mode === "view" && (
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={startEditing} className={secondaryButtonClass}>
            {t("edit")}
          </button>
          <button type="button" onClick={() => setMode("confirmDelete")} className={secondaryButtonClass}>
            {t("delete")}
          </button>
        </div>
      )}

      {mode === "confirmDelete" && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm text-[var(--accent-red)]">{t("deleteConfirmPrompt")}</p>
          {errorMessage && <p className="text-xs text-[var(--accent-red)]">{errorMessage}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={confirmDelete} disabled={busy} className={primaryButtonClass}>
              {busy ? t("deleting") : t("deleteConfirm")}
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setMode("view");
              }}
              disabled={busy}
              className={secondaryButtonClass}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
