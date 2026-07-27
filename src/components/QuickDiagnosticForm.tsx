"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";

interface Prefill {
  dtcCode: string;
  make: string;
  model: string;
  modelYear: string;
  engine: string;
}

interface OutputLocaleOption {
  code: string;
  name: string;
}

const ANALYZE_STAGES = [
  "Validating case details",
  "Sending your case to the AI",
  "Running diagnostic reasoning",
  "Running safety review",
  "Scoring confidence",
];

// Submits directly to /api/scan-diagnostics/cases/quick (create + analyze
// in one request — see that route). On success, redirects to the same
// case-detail page the file-upload flow already uses (ScanReportView and
// everything around it is completely unchanged/reused, not rebuilt).
export function QuickDiagnosticForm({
  prefill,
  languageOptions,
}: {
  prefill: Prefill;
  languageOptions: OutputLocaleOption[];
}) {
  const router = useRouter();
  const [dtcCode, setDtcCode] = useState(prefill.dtcCode);
  const [vin, setVin] = useState("");
  const [make, setMake] = useState(prefill.make);
  const [model, setModel] = useState(prefill.model);
  const [modelYear, setModelYear] = useState(prefill.modelYear);
  const [engine, setEngine] = useState(prefill.engine);
  const [module, setModuleField] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [freezeFrameNotes, setFreezeFrameNotes] = useState("");
  const [repairHistory, setRepairHistory] = useState("");
  const [scanToolNotes, setScanToolNotes] = useState("");
  const [reportLanguage, setReportLanguage] = useState("en");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const res = await fetch("/api/scan-diagnostics/cases/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dtcCode,
          vin: vin || undefined,
          make: make || undefined,
          model: model || undefined,
          modelYear: modelYear ? Number(modelYear) : undefined,
          engine: engine || undefined,
          module: module || undefined,
          symptoms: symptoms
            ? symptoms.split("\n").map((s) => s.trim()).filter(Boolean)
            : undefined,
          freezeFrameNotes: freezeFrameNotes || undefined,
          repairHistory: repairHistory || undefined,
          scanToolNotes: scanToolNotes || undefined,
          reportLanguage,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message =
          typeof data.error === "string" ? data.error : data.error?.message ?? "Something went wrong. Try again.";
        setErrorMessage(message);
        setStatus("error");
        return;
      }

      router.push(`/diagnostics/${data.case.id}`);
    } catch {
      setErrorMessage("Something went wrong. Try again.");
      setStatus("error");
    }
  }

  if (status === "submitting") {
    return <DiagnosticProgress stages={ANALYZE_STAGES} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label="DTC code (required)">
        <input
          required
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value)}
          placeholder="P0420"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 font-mono text-[var(--text-primary)]"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Year"><input value={modelYear} onChange={(e) => setModelYear(e.target.value)} inputMode="numeric" className={inputClass} /></Field>
        <Field label="Make"><input value={make} onChange={(e) => setMake(e.target.value)} className={inputClass} /></Field>
        <Field label="Model"><input value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} /></Field>
        <Field label="Engine"><input value={engine} onChange={(e) => setEngine(e.target.value)} className={inputClass} /></Field>
        <Field label="VIN"><input value={vin} onChange={(e) => setVin(e.target.value)} maxLength={17} className={inputClass} /></Field>
        <Field label="Control module"><input value={module} onChange={(e) => setModuleField(e.target.value)} placeholder="PCM, ECM, BCM…" className={inputClass} /></Field>
      </div>

      <Field label="Symptoms (one per line)">
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={3} className={inputClass} />
      </Field>
      <Field label="Freeze-frame data (optional)">
        <textarea value={freezeFrameNotes} onChange={(e) => setFreezeFrameNotes(e.target.value)} rows={2} className={inputClass} />
      </Field>
      <Field label="Repair history (optional)">
        <textarea value={repairHistory} onChange={(e) => setRepairHistory(e.target.value)} rows={2} className={inputClass} />
      </Field>
      <Field label="Scan-tool notes (optional)">
        <textarea value={scanToolNotes} onChange={(e) => setScanToolNotes(e.target.value)} rows={2} className={inputClass} />
      </Field>

      {languageOptions.length > 0 && (
        <Field label="Report language">
          <select value={reportLanguage} onChange={(e) => setReportLanguage(e.target.value)} className={inputClass}>
            <option value="en">English</option>
            {languageOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      {errorMessage && <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>}

      <button
        type="submit"
        className="mt-2 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        Run Full AI Diagnosis
      </button>
    </form>
  );
}

const inputClass =
  "min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
