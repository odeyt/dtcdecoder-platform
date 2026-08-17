"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { formatLimitErrorMessage } from "@/lib/i18n/limit-error-messages";

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

interface ExistingVinCase {
  id: string;
  status: string;
  complaint: string | null;
  createdAt: string;
}

// Submits directly to /api/scan-diagnostics/cases/quick (create + analyze
// in one request — see that route). On success, redirects to the same
// case-detail page the file-upload flow already uses (ScanReportView and
// everything around it is completely unchanged/reused, not rebuilt).
export function QuickDiagnosticForm({
  prefill,
  languageOptions,
  defaultReportLanguage,
}: {
  prefill: Prefill;
  languageOptions: OutputLocaleOption[];
  defaultReportLanguage: string;
}) {
  const router = useRouter();
  const t = useTranslations("quickDiagnostic");
  const tStages = useTranslations("diagnosticStages");
  const tVin = useTranslations("scanDuplicateVin");
  const tCommon = useTranslations("common");
  const tLimit = useTranslations("usageLimitErrors");
  const ANALYZE_STAGES = [
    tStages("validatingCaseDetails"),
    tStages("sendingToAi"),
    tStages("runningDiagnosticReasoning"),
    tStages("runningSafetyReview"),
    tStages("scoringConfidence"),
  ];
  const [dtcCode, setDtcCode] = useState(prefill.dtcCode);
  const [vin, setVin] = useState("");
  const [make, setMake] = useState(prefill.make);
  const [model, setModel] = useState(prefill.model);
  const [modelYear, setModelYear] = useState(prefill.modelYear);
  const [engine, setEngine] = useState(prefill.engine);
  const [module, setModuleField] = useState("");
  const [complaint, setComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [freezeFrameNotes, setFreezeFrameNotes] = useState("");
  const [repairHistory, setRepairHistory] = useState("");
  const [scanToolNotes, setScanToolNotes] = useState("");
  const [reportLanguage, setReportLanguage] = useState(defaultReportLanguage);
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "duplicate_vin">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ vin: string; existingCases: ExistingVinCase[] } | null>(
    null,
  );

  async function submitCase(confirmDuplicateVin: boolean) {
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
          complaint: complaint || undefined,
          symptoms: symptoms
            ? symptoms.split("\n").map((s) => s.trim()).filter(Boolean)
            : undefined,
          freezeFrameNotes: freezeFrameNotes || undefined,
          repairHistory: repairHistory || undefined,
          scanToolNotes: scanToolNotes || undefined,
          reportLanguage,
          confirmDuplicateVin: confirmDuplicateVin || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 && data.code === "DUPLICATE_VIN") {
          setDuplicateWarning({ vin: data.vin, existingCases: data.existingCases ?? [] });
          setStatus("duplicate_vin");
          return;
        }
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error
              ? formatLimitErrorMessage(data.error, tLimit) || tCommon("genericError")
              : tCommon("genericError");
        setErrorMessage(message);
        setStatus("error");
        return;
      }

      router.push(`/diagnostics/${data.case.id}`);
    } catch {
      setErrorMessage(tCommon("genericError"));
      setStatus("error");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitCase(false);
  }

  if (status === "submitting") {
    return <DiagnosticProgress stages={ANALYZE_STAGES} />;
  }

  if (status === "duplicate_vin" && duplicateWarning) {
    return (
      <div className="glass-panel flex flex-col gap-4 rounded-[var(--radius-lg)] p-5">
        <div>
          <p className="font-semibold text-[var(--text-primary)]">
            {duplicateWarning.existingCases.length === 1 ? tVin("headingOne") : tVin("headingMany")}{" "}
            <span className="tech-value">{duplicateWarning.vin}</span>
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{tVin("body")}</p>
        </div>
        <ul className="flex flex-col gap-2">
          {duplicateWarning.existingCases.map((c) => (
            <li key={c.id}>
              <a
                href={`/diagnostics/${c.id}`}
                className="block rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm text-[var(--text-primary)] transition hover:bg-white/5"
              >
                {c.complaint || tVin("diagnosticCaseFallback")} — {c.status.replace(/_/g, " ")}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => submitCase(true)}
            className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2.5 font-semibold text-white transition hover:brightness-110"
          >
            {tVin("continueAnyway")}
          </button>
          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setDuplicateWarning(null);
            }}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-5 py-2.5 font-semibold text-[var(--text-secondary)] transition hover:bg-white/5"
          >
            {tCommon("cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label={t("fieldDtcCode")}>
        <input
          required
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value)}
          placeholder="P0420"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 font-mono text-[var(--text-primary)]"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("fieldYear")}><input value={modelYear} onChange={(e) => setModelYear(e.target.value)} inputMode="numeric" className={inputClass} /></Field>
        <Field label={t("fieldMake")}><input value={make} onChange={(e) => setMake(e.target.value)} className={inputClass} /></Field>
        <Field label={t("fieldModel")}><input value={model} onChange={(e) => setModel(e.target.value)} className={inputClass} /></Field>
        <Field label={t("fieldEngine")}><input value={engine} onChange={(e) => setEngine(e.target.value)} className={inputClass} /></Field>
        <Field label={t("fieldVin")}><input value={vin} onChange={(e) => setVin(e.target.value)} maxLength={17} className={inputClass} /></Field>
        <Field label={t("fieldControlModule")}><input value={module} onChange={(e) => setModuleField(e.target.value)} placeholder={t("controlModulePlaceholder")} className={inputClass} /></Field>
      </div>

      <Field label={t("fieldComplaint")}>
        <textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          rows={2}
          placeholder={t("fieldComplaintPlaceholder")}
          className={inputClass}
        />
        {!complaint && <p className="mt-1 text-xs text-[var(--text-muted)]">{t("noComplaintWarning")}</p>}
      </Field>
      <Field label={t("fieldSymptoms")}>
        <textarea value={symptoms} onChange={(e) => setSymptoms(e.target.value)} rows={3} className={inputClass} />
      </Field>
      <Field label={t("fieldFreezeFrame")}>
        <textarea value={freezeFrameNotes} onChange={(e) => setFreezeFrameNotes(e.target.value)} rows={2} className={inputClass} />
      </Field>
      <Field label={t("fieldRepairHistory")}>
        <textarea value={repairHistory} onChange={(e) => setRepairHistory(e.target.value)} rows={2} className={inputClass} />
      </Field>
      <Field label={t("fieldScanToolNotes")}>
        <textarea value={scanToolNotes} onChange={(e) => setScanToolNotes(e.target.value)} rows={2} className={inputClass} />
      </Field>

      {languageOptions.length > 0 && (
        <Field label={t("fieldReportLanguage")}>
          <select value={reportLanguage} onChange={(e) => setReportLanguage(e.target.value)} className={inputClass}>
            <option value="en">{tCommon("languageEnglish")}</option>
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
        {t("pageTitle")}
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
