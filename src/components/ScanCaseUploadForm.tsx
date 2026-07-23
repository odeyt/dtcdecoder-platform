"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SUPPORTED_FORMATS = "PDF, TXT, CSV, JSON, XML, HTML";
const MAX_SIZE_MB = 15;

// English-only for this initial release — see docs/SCAN_REPORT_ANALYSIS.md
// ("Known limitations") for why this page doesn't go through next-intl yet.
export function ScanCaseUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [mileage, setMileage] = useState("");
  const [recentRepairs, setRecentRepairs] = useState("");
  const [batteryCondition, setBatteryCondition] = useState("");
  const [technicianNotes, setTechnicianNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Please choose a scan report file to upload.");
      return;
    }

    setStatus("submitting");
    setError(null);

    try {
      const caseRes = await fetch("/api/scan-diagnostics/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          complaint: complaint || undefined,
          symptoms: symptoms
            ? symptoms.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
          mileage: mileage ? Number(mileage) : undefined,
          recentRepairs: recentRepairs || undefined,
          batteryCondition: batteryCondition || undefined,
          technicianNotes: technicianNotes || undefined,
        }),
      });
      const caseData = await caseRes.json().catch(() => ({}));
      if (!caseRes.ok) {
        setError(caseData.error ?? "Could not create the case. Please try again.");
        setStatus("idle");
        return;
      }

      const caseId = caseData.case.id as string;
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch(`/api/scan-diagnostics/cases/${caseId}/upload`, {
        method: "POST",
        body: formData,
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        setError(uploadData.error ?? "Upload failed. Please try again.");
        setStatus("idle");
        return;
      }

      router.push(`/diagnostics/${caseId}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files[0];
          if (dropped) pickFile(dropped);
        }}
        className="glass-panel flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-xl)] border-2 border-dashed p-10 text-center transition-colors"
        style={{ borderColor: dragOver ? "var(--accent-red)" : "var(--border-subtle)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.csv,.json,.xml,.html,.htm"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <p className="text-[var(--text-primary)]">{file.name}</p>
        ) : (
          <>
            <p className="text-[var(--text-primary)]">Drag and drop your scan report here, or click to choose a file</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Supported formats: {SUPPORTED_FORMATS} · Max {MAX_SIZE_MB} MB
            </p>
          </>
        )}
      </div>

      <div className="glass-panel rounded-[var(--radius-lg)] p-5 text-xs text-[var(--text-muted)]">
        Your file is stored privately and is only used to generate your diagnostic analysis. It is never shared or
        made public.
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Customer complaint
          <textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            rows={3}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder="e.g. Check engine light on, rough idle at stoplights"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Observed symptoms (comma-separated)
          <input
            type="text"
            value={symptoms}
            onChange={(e) => setSymptoms(e.target.value)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            placeholder="rough idle, hesitation on acceleration"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          Mileage
          <input
            type="number"
            min={0}
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)]">
          Battery condition
          <input
            type="text"
            value={batteryCondition}
            onChange={(e) => setBatteryCondition(e.target.value)}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
            placeholder="e.g. tested, 12.6V resting"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Recent repairs
          <textarea
            value={recentRepairs}
            onChange={(e) => setRecentRepairs(e.target.value)}
            rows={2}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)]"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text-secondary)] sm:col-span-2">
          Technician notes
          <textarea
            value={technicianNotes}
            onChange={(e) => setTechnicianNotes(e.target.value)}
            rows={2}
            className="rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[var(--text-primary)]"
          />
        </label>
      </div>

      {error && <p className="text-sm text-[var(--accent-red)]">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {status === "submitting" ? "Uploading…" : "Upload and continue"}
      </button>
    </form>
  );
}
