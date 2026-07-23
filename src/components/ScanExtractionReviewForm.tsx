"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScanDtcRecord, ScanExtraction } from "@/lib/types";

interface DtcRow {
  key: string; // stable React key — existing row's id, or a generated temp id for new rows
  id: string | null; // null for a row the user just added, not yet persisted
  module: string;
  code: string;
  status: string;
  descriptionRaw: string;
  removed: boolean;
}

function toRow(record: ScanDtcRecord): DtcRow {
  return {
    key: record.id,
    id: record.id,
    module: record.module ?? "",
    code: record.code,
    status: record.status ?? "",
    descriptionRaw: record.description_raw ?? "",
    removed: false,
  };
}

let tempKeySeq = 0;
function newRow(): DtcRow {
  tempKeySeq += 1;
  return { key: `new-${tempKeySeq}`, id: null, module: "", code: "", status: "", descriptionRaw: "", removed: false };
}

interface ScanExtractionReviewFormProps {
  caseId: string;
  extraction: ScanExtraction;
  dtcRecords: ScanDtcRecord[];
}

// English-only for this initial release — see docs/SCAN_REPORT_ANALYSIS.md.
export function ScanExtractionReviewForm({ caseId, extraction, dtcRecords }: ScanExtractionReviewFormProps) {
  const router = useRouter();

  const reviewed = extraction.reviewed_fields as Record<string, unknown>;
  const [vin, setVin] = useState(String(reviewed.vin ?? extraction.vin ?? ""));
  const [make, setMake] = useState(String(reviewed.make ?? extraction.make ?? ""));
  const [model, setModel] = useState(String(reviewed.model ?? extraction.model ?? ""));
  const [modelYear, setModelYear] = useState(String(reviewed.modelYear ?? extraction.model_year ?? ""));
  const [engine, setEngine] = useState(String(reviewed.engine ?? extraction.engine ?? ""));
  const [odometerMiles, setOdometerMiles] = useState(
    String(reviewed.odometerMiles ?? extraction.odometer_miles ?? ""),
  );

  const initialRows = useMemo(() => dtcRecords.map(toRow), [dtcRecords]);
  const [rows, setRows] = useState<DtcRow[]>(initialRows);
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: string, patch: Partial<DtcRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, removed: true } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    const initialByKey = new Map(initialRows.map((r) => [r.key, r]));
    const editDtcs = rows
      .filter((r) => r.id && !r.removed)
      .filter((r) => {
        const original = initialByKey.get(r.key);
        return (
          original &&
          (original.module !== r.module ||
            original.code !== r.code ||
            original.status !== r.status ||
            original.descriptionRaw !== r.descriptionRaw)
        );
      })
      .map((r) => ({
        id: r.id as string,
        module: r.module || undefined,
        code: r.code,
        status: r.status || undefined,
        descriptionRaw: r.descriptionRaw || undefined,
      }));

    const addDtcs = rows
      .filter((r) => !r.id && !r.removed && r.code.trim())
      .map((r) => ({
        module: r.module || undefined,
        code: r.code,
        status: r.status || undefined,
        descriptionRaw: r.descriptionRaw || undefined,
      }));

    const removeDtcIds = rows.filter((r) => r.id && r.removed).map((r) => r.id as string);

    try {
      const res = await fetch(`/api/scan-diagnostics/cases/${caseId}/extraction`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin: vin || undefined,
          make: make || undefined,
          model: model || undefined,
          modelYear: modelYear ? Number(modelYear) : undefined,
          engine: engine || undefined,
          odometerMiles: odometerMiles ? Number(odometerMiles) : undefined,
          editDtcs: editDtcs.length ? editDtcs : undefined,
          addDtcs: addDtcs.length ? addDtcs : undefined,
          removeDtcIds: removeDtcIds.length ? removeDtcIds : undefined,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not save your review. Please try again.");
        setStatus("idle");
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  const visibleRows = rows.filter((r) => !r.removed);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {extraction.warnings.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border-red)] p-4 text-sm text-[var(--text-secondary)]">
          <p className="font-semibold text-[var(--text-primary)]">Extraction warnings</p>
          <ul className="mt-1 list-disc pl-5">
            {extraction.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">Vehicle identity</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Extracted from your file — correct anything that looks wrong before continuing.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            VIN
            <input
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 font-mono text-[var(--text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            Year
            <input
              value={modelYear}
              onChange={(e) => setModelYear(e.target.value)}
              type="number"
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            Make
            <input
              value={make}
              onChange={(e) => setMake(e.target.value)}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            Model
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            Engine
            <input
              value={engine}
              onChange={(e) => setEngine(e.target.value)}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
            Mileage
            <input
              value={odometerMiles}
              onChange={(e) => setOdometerMiles(e.target.value)}
              type="number"
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            />
          </label>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-wide text-[var(--text-primary)]">Diagnostic trouble codes</h2>
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, newRow()])}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            + Add DTC
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {visibleRows.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No DTCs extracted — add any manually if needed.</p>
          )}
          {visibleRows.map((row) => (
            <div key={row.key} className="glass-panel rounded-[var(--radius-lg)] p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
                  {row.id ? "Extracted" : "User-added"}
                </span>
                <button
                  type="button"
                  onClick={() => removeRow(row.key)}
                  className="text-xs text-[var(--accent-red)] hover:underline"
                >
                  Remove
                </button>
              </div>
              <div className="mt-2 grid gap-3 sm:grid-cols-4">
                <input
                  value={row.code}
                  onChange={(e) => updateRow(row.key, { code: e.target.value })}
                  placeholder="Code (e.g. P0300)"
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 font-mono text-[var(--text-primary)]"
                />
                <input
                  value={row.module}
                  onChange={(e) => updateRow(row.key, { module: e.target.value })}
                  placeholder="Module"
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
                />
                <input
                  value={row.status}
                  onChange={(e) => updateRow(row.key, { status: e.target.value })}
                  placeholder="Status"
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
                />
                <input
                  value={row.descriptionRaw}
                  onChange={(e) => updateRow(row.key, { descriptionRaw: e.target.value })}
                  placeholder="Description"
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="min-h-11 w-fit rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "submitting" ? "Saving…" : "Confirm and start analysis"}
      </button>
    </form>
  );
}
