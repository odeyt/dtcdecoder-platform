"use client";

// Technician Notes — real, persisted per-case notes (scan_case_notes,
// migration 0042), distinct from ScanCase.technician_notes (a write-once
// field captured at upload time). Never claims "saved" until the server
// confirms it — see withSaveStatus.
import { useState } from "react";
import { useTranslations } from "next-intl";
import { createNote, deleteNote, updateNote } from "@/lib/scan-diagnostics/workbench-client";
import { useWorkbenchSaveStatus, withSaveStatus } from "@/components/scan-report/WorkbenchSaveStatus";
import type { ScanCaseNote, ScanCaseNoteCategory } from "@/lib/types";

interface TechnicianNotesSectionProps {
  caseId: string;
  initialNotes: ScanCaseNote[];
}

const CATEGORIES: ScanCaseNoteCategory[] = ["observation", "measurement", "repair_performed", "follow_up"];

export function TechnicianNotesSection({ caseId, initialNotes }: TechnicianNotesSectionProps) {
  const [notes, setNotes] = useState(initialNotes);
  const [category, setCategory] = useState<ScanCaseNoteCategory>("observation");
  const [body, setBody] = useState("");
  const { report, reportSaving } = useWorkbenchSaveStatus();
  const t = useTranslations("scanReport");

  const categoryLabel: Record<ScanCaseNoteCategory, string> = {
    observation: t("categoryObservation"),
    measurement: t("categoryMeasurement"),
    repair_performed: t("categoryRepairPerformed"),
    follow_up: t("categoryFollowUp"),
  };

  async function handleAdd() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const note = await withSaveStatus(report, reportSaving, () => createNote(caseId, { category, body: trimmed }));
    if (note) {
      setNotes((prev) => [note, ...prev]);
      setBody("");
    }
  }

  async function handleTogglePin(note: ScanCaseNote) {
    const updated = await withSaveStatus(report, reportSaving, () =>
      updateNote(caseId, note.id, { pinned: !note.pinned }),
    );
    if (updated) {
      setNotes((prev) =>
        [...prev.filter((n) => n.id !== updated.id), updated].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
      );
    }
  }

  async function handleDelete(noteId: string) {
    const result = await withSaveStatus(report, reportSaving, async () => {
      await deleteNote(caseId, noteId);
      return true;
    });
    if (result) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-panel rounded-[var(--radius-lg)] p-4 print:hidden">
        <label htmlFor="new-note-category" className="text-xs font-semibold text-[var(--text-primary)]">
          {t("addANote")}
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          <select
            id="new-note-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as ScanCaseNoteCategory)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-transparent px-3 text-sm text-[var(--text-primary)]"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel[c]}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-label={t("noteTextLabel")}
          rows={3}
          className="mt-2 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-transparent p-3 text-sm text-[var(--text-primary)]"
          placeholder={t("notePlaceholder")}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!body.trim()}
          className="mt-2 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t("addNoteButton")}
        </button>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{t("noNotesYet")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="glass-panel rounded-[var(--radius-lg)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                  {categoryLabel[note.category]} · {new Date(note.created_at).toLocaleString()}
                </span>
                <div className="flex gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => handleTogglePin(note)}
                    aria-pressed={note.pinned}
                    className="min-h-9 rounded-[var(--radius-md)] border px-2 py-1 text-xs font-semibold"
                    style={{
                      borderColor: note.pinned ? "var(--accent-red)" : "var(--border-subtle)",
                      color: note.pinned ? "var(--accent-red)" : "var(--text-secondary)",
                    }}
                  >
                    {note.pinned ? t("pinned") : t("pin")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    className="min-h-9 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-2 py-1 text-xs text-[var(--text-secondary)]"
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
