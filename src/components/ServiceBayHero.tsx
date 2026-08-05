"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import { recordClientEvent } from "@/lib/analytics/client";
import { isValidDtcCodeFormat } from "@/lib/dtc-category";
import { saveIntakeForHandoff } from "@/lib/landing-intake/handoff";
import { emptyIntake, type LandingDiagnosticIntake, type PublicIntakeResponse } from "@/lib/landing-intake/types";
import {
  SYMPTOM_CATEGORIES,
  STATUS_CHOICES,
  COMMON_COMPLAINTS,
  PROGRESS_STAGES,
  type SymptomCategory,
} from "@/lib/landing-intake/service-bay-content";

type Phase =
  | "welcome"
  | "dtc_code"
  | "dtc_vehicle"
  | "dtc_status"
  | "dtc_complaint"
  | "symptom_category"
  | "symptom_detail"
  | "symptom_code"
  | "scan"
  | "history_gate"
  | "result"
  | "sign_in_required"
  | "upgrade_required"
  | "error";

type TransitionKey = keyof typeof PROGRESS_STAGES;

// Three coarse, honest stages a visitor can always place themselves within —
// deliberately coarser than the per-flow sub-steps (which each still carry
// their own text label, e.g. "VEHICLE" / "CODE STATUS") so the console shows
// one progress signal, not two competing ones.
const DATA_COLLECTION_PHASES: Phase[] = [
  "dtc_code",
  "dtc_vehicle",
  "dtc_status",
  "dtc_complaint",
  "symptom_category",
  "symptom_detail",
  "symptom_code",
  "scan",
  "history_gate",
];
const TERMINAL_PHASES: Phase[] = ["result", "sign_in_required", "upgrade_required", "error"];

function topStageFor(phase: Phase): number {
  if (phase === "welcome") return 1;
  if (TERMINAL_PHASES.includes(phase)) return 3;
  return 2;
}

// Returning to a prior phase never discards already-entered field values
// (codeInput/vehicleForm/etc. are only cleared by a full reset) — going back
// and forward again just re-displays the same step, and re-submitting is
// safe since the deterministic intake engine only records usage at the
// final basic_result step, never on an intermediate question.
const BACK_MAP: Partial<Record<Phase, Phase>> = {
  dtc_code: "welcome",
  dtc_vehicle: "dtc_code",
  dtc_status: "dtc_vehicle",
  dtc_complaint: "dtc_status",
  symptom_category: "welcome",
  symptom_detail: "symptom_category",
  symptom_code: "symptom_detail",
  scan: "welcome",
  history_gate: "welcome",
};

type ConsoleStatus = "ready" | "inProgress" | "analyzing" | "complete" | "actionNeeded" | "error";

function statusFor(phase: Phase, transitioning: boolean): ConsoleStatus {
  if (transitioning) return "analyzing";
  if (phase === "welcome") return "ready";
  if (phase === "result") return "complete";
  if (phase === "sign_in_required" || phase === "upgrade_required") return "actionNeeded";
  if (phase === "error") return "error";
  return "inProgress";
}

export function ServiceBayHero({ locale }: { locale: string }) {
  const t = useTranslations("serviceBay");
  const tIntake = useTranslations("landingIntake");
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("welcome");
  const [intake, setIntake] = useState<LandingDiagnosticIntake>(() => emptyIntake(locale));
  const [response, setResponse] = useState<PublicIntakeResponse | null>(null);
  const [transitionKey, setTransitionKey] = useState<TransitionKey | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const [codeInput, setCodeInput] = useState("");
  const [codeInvalid, setCodeInvalid] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ year: "", make: "", model: "", engine: "" });
  const [selectedCategory, setSelectedCategory] = useState<SymptomCategory | null>(null);
  const [otherText, setOtherText] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  function reset() {
    setPhase("welcome");
    setIntake(emptyIntake(locale));
    setResponse(null);
    setErrorMessage(null);
    setCodeInput("");
    setCodeInvalid(false);
    setVehicleForm({ year: "", make: "", model: "", engine: "" });
    setSelectedCategory(null);
    setOtherText("");
  }

  // Distinct from reset(): moves to the previous phase only, keeping
  // whatever the visitor already entered (codeInput/vehicleForm/etc. are
  // untouched) so they land back on a pre-filled step, not a blank one.
  function goBack() {
    const previous = BACK_MAP[phase];
    if (previous) setPhase(previous);
    else reset();
  }

  async function submitIntake(message: string, nextIntake: LandingDiagnosticIntake, stage: TransitionKey) {
    setErrorMessage(null);
    setTransitionKey(stage);
    try {
      const res = await fetch("/api/public/diagnostic-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, intake: nextIntake, locale }),
      });
      const body: unknown = await res.json().catch(() => null);
      const errorFromBody =
        body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : undefined;

      if (!res.ok || !body || errorFromBody) {
        setErrorMessage(errorFromBody || tIntake("errorGeneric"));
        setPhase("error");
        return;
      }

      const data = body as PublicIntakeResponse;
      setResponse(data);
      setIntake(data.preservedIntake);
      routeByResponse(data);
    } catch {
      setErrorMessage(tIntake("errorGeneric"));
      setPhase("error");
    } finally {
      setTransitionKey(null);
    }
  }

  function routeByResponse(data: PublicIntakeResponse) {
    if (data.status === "sign_in_required") {
      saveIntakeForHandoff(data.preservedIntake);
      setPhase("sign_in_required");
      return;
    }
    if (data.status === "upgrade_required") {
      setPhase("upgrade_required");
      return;
    }
    if (data.status === "basic_result") {
      recordClientEvent("public_intake_basic_result_viewed", { dtcCode: data.basicResult?.dtcCode });
      recordClientEvent("locked_feature_viewed", { source: "service_bay_result" });
      setPhase("result");
      return;
    }
    // needs_more_information — the next step is entirely determined by
    // which field the deterministic engine is asking for, so both entry
    // paths (DTC-code-first and symptom-first) converge on the same
    // shared step components from here on.
    switch (data.nextQuestion?.field) {
      case "vehicle":
        setPhase("dtc_vehicle");
        return;
      case "currentCodeStatus":
        setPhase("dtc_status");
        return;
      case "complaint":
        setPhase("dtc_complaint");
        return;
      case "dtcCode":
        setPhase("symptom_code");
        return;
      default:
        setPhase("error");
        setErrorMessage(tIntake("errorGeneric"));
    }
  }

  // ---- Welcome cards -----------------------------------------------------

  function startDtcCodeFlow() {
    recordClientEvent("landing_consultation_started", { entry: "code" });
    setIntake(emptyIntake(locale));
    setPhase("dtc_code");
  }

  function startSymptomFlow() {
    recordClientEvent("landing_consultation_started", { entry: "symptom" });
    setIntake(emptyIntake(locale));
    setSelectedCategory(null);
    setPhase("symptom_category");
  }

  function openScanCard() {
    recordClientEvent("import_vehicle_scan_clicked", { source: "service_bay" });
    setPhase("scan");
  }

  function openHistoryCard() {
    recordClientEvent("continue_previous_diagnosis_clicked", { source: "service_bay" });
    setPhase("history_gate");
  }

  // ---- DTC-code flow -------------------------------------------------------

  function submitCode() {
    const code = codeInput.trim().toUpperCase();
    if (!isValidDtcCodeFormat(code)) {
      setCodeInvalid(true);
      return;
    }
    setCodeInvalid(false);
    submitIntake(code, emptyIntake(locale), "codeSubmitted");
  }

  function submitVehicle() {
    const message = [vehicleForm.year, vehicleForm.make, vehicleForm.model].filter(Boolean).join(" ").trim();
    const nextIntake: LandingDiagnosticIntake = {
      ...intake,
      engine: vehicleForm.engine.trim() || undefined,
    };
    submitIntake(message || "unknown vehicle", nextIntake, "vehicleSubmitted");
  }

  function submitStatus(value: (typeof STATUS_CHOICES)[number]["value"]) {
    submitIntake(value, intake, "statusSubmitted");
  }

  function submitComplaint(text: string) {
    submitIntake(text, intake, "complaintSubmitted");
  }

  // ---- Symptom-first flow ---------------------------------------------------

  function pickCategory(category: SymptomCategory) {
    setSelectedCategory(category);
    setPhase("symptom_detail");
  }

  function submitSymptom(text: string) {
    submitIntake(text, emptyIntake(locale), "symptomSubmitted");
  }

  function submitSymptomCode() {
    const code = codeInput.trim().toUpperCase();
    if (!isValidDtcCodeFormat(code)) {
      setCodeInvalid(true);
      return;
    }
    setCodeInvalid(false);
    submitIntake(code, intake, "codeSubmitted");
  }

  function skipSymptomCode() {
    submitIntake(t("symptomCodeSkip"), intake, "symptomSubmitted");
  }

  // ---- Scan / history handoff -----------------------------------------------

  function handleScanFile() {
    if (signedIn) {
      router.push("/diagnostics/upload");
    } else {
      saveIntakeForHandoff(intake);
      router.push("/account/login?next=%2Fdiagnostics%2Fupload");
    }
  }

  function handleHistoryContinue() {
    router.push("/history");
  }

  function handleSignInClick() {
    recordClientEvent("signin_from_intake_clicked");
    router.push("/account/login?next=%2Fdiagnostics%2Ffrom-intake");
  }

  function handleUpgradeClick() {
    recordClientEvent("upgrade_from_consultation_clicked", { source: "service_bay" });
    router.push("/pricing");
  }

  // ---- Render -----------------------------------------------------------

  return (
    <div className="mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none">
      <div
        id="diagnostic-intake-console"
        tabIndex={-1}
        className="glass-panel relative overflow-hidden rounded-[var(--radius-xl)] p-6 sm:p-10"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        <ConsoleHeader t={t} status={statusFor(phase, Boolean(transitionKey))} stage={topStageFor(phase)} />

        <IntakeSummary t={t} intake={intake} vehicleForm={vehicleForm} selectedCategory={selectedCategory} />

        {transitionKey ? (
          <DiagnosticProgress stages={PROGRESS_STAGES[transitionKey].map((key) => t(key))} />
        ) : (
          <>
            {DATA_COLLECTION_PHASES.includes(phase) && (
              <ActionsRow onBack={goBack} onReset={reset} backLabel={t("back")} resetLabel={t("reset")} />
            )}

            {phase === "welcome" && (
              <WelcomeScreen
                t={t}
                onCode={startDtcCodeFlow}
                onSymptom={startSymptomFlow}
                onScan={openScanCard}
                onHistory={openHistoryCard}
              />
            )}

            {phase === "dtc_code" && (
              <CodeStep
                t={t}
                value={codeInput}
                invalid={codeInvalid}
                onChange={(v) => {
                  setCodeInput(v);
                  setCodeInvalid(false);
                }}
                onSubmit={submitCode}
              />
            )}

            {phase === "dtc_vehicle" && (
              <VehicleStep t={t} value={vehicleForm} onChange={setVehicleForm} onSubmit={submitVehicle} />
            )}

            {phase === "dtc_status" && (
              <StatusStep t={t} choices={response?.nextQuestion?.choices} onSelect={submitStatus} />
            )}

            {phase === "dtc_complaint" && (
              <ComplaintStep
                t={t}
                otherText={otherText}
                onOtherTextChange={setOtherText}
                onSelect={submitComplaint}
              />
            )}

            {phase === "symptom_category" && <CategoryStep t={t} onSelect={pickCategory} />}

            {phase === "symptom_detail" && selectedCategory && (
              <SymptomDetailStep
                t={t}
                category={selectedCategory}
                otherText={otherText}
                onOtherTextChange={setOtherText}
                onSelect={submitSymptom}
              />
            )}

            {phase === "symptom_code" && (
              <SymptomCodeStep
                t={t}
                value={codeInput}
                invalid={codeInvalid}
                onChange={(v) => {
                  setCodeInput(v);
                  setCodeInvalid(false);
                }}
                onSubmit={submitSymptomCode}
                onSkip={skipSymptomCode}
              />
            )}

            {phase === "scan" && <ScanStep t={t} signedIn={signedIn} onFile={handleScanFile} onRestart={reset} />}

            {phase === "history_gate" && (
              <HistoryGateStep t={t} signedIn={signedIn} onContinue={handleHistoryContinue} onRestart={reset} />
            )}

            {phase === "sign_in_required" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p className="text-lg font-semibold text-[var(--text-primary)]">{tIntake("signInRequiredTitle")}</p>
                <p className="max-w-md text-sm text-[var(--text-secondary)]">{tIntake("signInRequiredBody")}</p>
                <button
                  type="button"
                  onClick={handleSignInClick}
                  className="mt-2 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
                >
                  {tIntake("signInCta")}
                </button>
                <button type="button" onClick={reset} className="text-sm text-[var(--text-muted)] underline-offset-2 hover:underline">
                  {t("restart")}
                </button>
              </div>
            )}

            {phase === "upgrade_required" && response && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p role="alert" className="max-w-md text-sm text-[var(--text-secondary)]">
                  {response.message}
                </p>
                <button
                  type="button"
                  onClick={handleUpgradeClick}
                  className="mt-2 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
                >
                  {tIntake("upgradeCta")}
                </button>
                <button type="button" onClick={reset} className="text-sm text-[var(--text-muted)] underline-offset-2 hover:underline">
                  {t("restart")}
                </button>
              </div>
            )}

            {phase === "result" && response?.basicResult && (
              <ResultStep
                t={t}
                tIntake={tIntake}
                result={response.basicResult}
                onUnlock={handleUpgradeClick}
                onImportScan={openScanCard}
                onRestart={reset}
              />
            )}

            {phase === "error" && errorMessage && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <p role="alert" className="text-sm text-[var(--accent-red)]">
                  {errorMessage}
                </p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-2 min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-2.5 font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
                >
                  {t("restart")}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational subcomponents
// ---------------------------------------------------------------------------

function ConsoleHeader({
  t,
  status,
  stage,
}: {
  t: ReturnType<typeof useTranslations>;
  status: ConsoleStatus;
  stage: number;
}) {
  const statusLabelKey: Record<ConsoleStatus, string> = {
    ready: "statusReady",
    inProgress: "statusInProgress",
    analyzing: "statusAnalyzing",
    complete: "statusComplete",
    actionNeeded: "statusActionNeeded",
    error: "statusError",
  };
  const statusColor =
    status === "error" ? "var(--accent-red)" : status === "actionNeeded" ? "var(--accent-amber)" : "var(--text-secondary)";

  return (
    <div className="mb-6 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--text-muted)] uppercase">{t("productLabel")}</p>
        <h2 className="mt-0.5 text-sm font-bold text-[var(--text-primary)]">{t("consoleTitle")}</h2>
      </div>
      <div className="text-right">
        <p role="status" aria-live="polite" className="text-xs font-semibold tracking-wide uppercase" style={{ color: statusColor }}>
          {t("consoleStatusLabel")}: {t(statusLabelKey[status])}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("stageOf", { current: stage, total: 3 })}</p>
      </div>
    </div>
  );
}

function statusChoiceLabel(t: ReturnType<typeof useTranslations>, value?: LandingDiagnosticIntake["currentCodeStatus"]) {
  if (!value) return null;
  const keys: Record<NonNullable<LandingDiagnosticIntake["currentCodeStatus"]>, string> = {
    current: "statusChoiceCurrent",
    history: "statusChoiceHistory",
    pending: "statusChoicePending",
    permanent: "statusChoicePermanent",
    unknown: "statusChoiceUnknown",
  };
  return t(keys[value]);
}

function IntakeSummary({
  t,
  intake,
  vehicleForm,
  selectedCategory,
}: {
  t: ReturnType<typeof useTranslations>;
  intake: LandingDiagnosticIntake;
  vehicleForm: { year: string; make: string; model: string; engine: string };
  selectedCategory: SymptomCategory | null;
}) {
  const tCat = useTranslations("serviceBay.symptomCategories");
  const code = intake.dtcCodes[0];
  const vehicleParts = [vehicleForm.year, vehicleForm.make, vehicleForm.model].filter(Boolean).join(" ");
  const statusLabel = statusChoiceLabel(t, intake.currentCodeStatus);
  const categoryLabel = selectedCategory ? tCat(selectedCategory.labelKey) : null;

  const items = [
    code ? { key: "code", label: t("summaryCodeLabel"), value: code } : null,
    vehicleParts ? { key: "vehicle", label: t("summaryVehicleLabel"), value: vehicleParts } : null,
    statusLabel ? { key: "status", label: t("summaryStatusLabel"), value: statusLabel } : null,
    categoryLabel ? { key: "system", label: t("summarySystemLabel"), value: categoryLabel } : null,
  ].filter((item): item is { key: string; label: string; value: string } => item !== null);

  if (items.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item.key}
          className="rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-1 text-xs text-[var(--text-secondary)]"
        >
          <span className="text-[var(--text-muted)]">{item.label}:</span> {item.value}
        </span>
      ))}
    </div>
  );
}

function ActionsRow({
  onBack,
  onReset,
  backLabel,
  resetLabel,
}: {
  onBack: () => void;
  onReset: () => void;
  backLabel: string;
  resetLabel: string;
}) {
  return (
    <div className="mb-6 flex items-center gap-4">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 rounded-[var(--radius-md)] px-2 text-sm text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        ← {backLabel}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="min-h-11 rounded-[var(--radius-md)] px-2 text-sm text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
      >
        {resetLabel}
      </button>
    </div>
  );
}


function WelcomeScreen({
  t,
  onCode,
  onSymptom,
  onScan,
  onHistory,
}: {
  t: ReturnType<typeof useTranslations>;
  onCode: () => void;
  onSymptom: () => void;
  onScan: () => void;
  onHistory: () => void;
}) {
  const cards = [
    { key: "code", title: t("cardCodeTitle"), body: t("cardCodeBody"), onClick: onCode, icon: <CodeIcon /> },
    { key: "symptom", title: t("cardSymptomTitle"), body: t("cardSymptomBody"), onClick: onSymptom, icon: <SymptomIcon /> },
    { key: "scan", title: t("cardScanTitle"), body: t("cardScanBody"), onClick: onScan, icon: <ScanIcon /> },
    { key: "history", title: t("cardHistoryTitle"), body: t("cardHistoryBody"), onClick: onHistory, icon: <HistoryIcon /> },
  ];

  return (
    <div className="fade-in-up">
      <p className="text-center text-sm font-medium tracking-wide text-[var(--text-muted)] uppercase">{t("welcomePrompt")}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={card.onClick}
            className="hover-lift group flex min-h-[104px] items-start gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] p-5 text-left transition"
          >
            <span className="mt-0.5 shrink-0 text-[var(--accent-red)] transition group-hover:scale-110">{card.icon}</span>
            <span>
              <span className="block font-semibold text-[var(--text-primary)]">{card.title}</span>
              <span className="mt-1 block text-sm text-[var(--text-secondary)]">{card.body}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}


function CodeStep({
  t,
  value,
  invalid,
  onChange,
  onSubmit,
}: {
  t: ReturnType<typeof useTranslations>;
  value: string;
  invalid: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      className="fade-in-up flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("codeStepLabel")}</p>
      <label htmlFor="service-bay-code" className="sr-only">
        {t("codeInputLabel")}
      </label>
      <input
        id="service-bay-code"
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("codeInputPlaceholder")}
        className="min-h-16 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 font-mono text-2xl tracking-widest text-[var(--text-primary)] uppercase placeholder:text-[var(--text-muted)] focus:border-[var(--border-red)] focus:outline-none"
      />
      <p className="text-xs text-[var(--text-muted)]">{t("codeInputHint")}</p>
      {invalid && (
        <p role="alert" className="text-sm text-[var(--accent-red)]">
          {t("codeInputInvalid")}
        </p>
      )}
      <button
        type="submit"
        disabled={!value.trim()}
        className="min-h-11 self-start rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {t("continue")}
      </button>
    </form>
  );
}

function VehicleStep({
  t,
  value,
  onChange,
  onSubmit,
}: {
  t: ReturnType<typeof useTranslations>;
  value: { year: string; make: string; model: string; engine: string };
  onChange: (v: { year: string; make: string; model: string; engine: string }) => void;
  onSubmit: () => void;
}) {
  const fields: Array<{ key: keyof typeof value; label: string; placeholder: string }> = [
    { key: "year", label: t("vehicleYearLabel"), placeholder: t("vehicleYearPlaceholder") },
    { key: "make", label: t("vehicleMakeLabel"), placeholder: t("vehicleMakePlaceholder") },
    { key: "model", label: t("vehicleModelLabel"), placeholder: t("vehicleModelPlaceholder") },
    { key: "engine", label: t("vehicleEngineLabel"), placeholder: t("vehicleEnginePlaceholder") },
  ];

  return (
    <form
      className="fade-in-up flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("vehicleStepLabel")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-[var(--text-muted)]">{field.label}</span>
            <input
              value={value[field.key]}
              onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-red)] focus:outline-none"
            />
          </label>
        ))}
      </div>
      <button
        type="submit"
        className="min-h-11 self-start rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        {t("continue")}
      </button>
    </form>
  );
}

function StatusStep({
  t,
  choices,
  onSelect,
}: {
  t: ReturnType<typeof useTranslations>;
  choices?: string[];
  onSelect: (value: (typeof STATUS_CHOICES)[number]["value"]) => void;
}) {
  const labelFor: Record<(typeof STATUS_CHOICES)[number]["value"], string> = {
    current: t("statusChoiceCurrent"),
    history: t("statusChoiceHistory"),
    pending: t("statusChoicePending"),
    permanent: t("statusChoicePermanent"),
    unknown: t("statusChoiceUnknown"),
  };
  const options = STATUS_CHOICES.filter((c) => !choices || choices.includes(c.value));

  return (
    <div className="fade-in-up flex flex-col gap-4">
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("statusStepLabel")}</p>
      <p className="text-lg text-[var(--text-primary)]">{t("statusStepPrompt")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() => onSelect(choice.value)}
            className="hover-lift min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-left font-medium text-[var(--text-primary)] transition"
          >
            {labelFor[choice.value]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipGrid({
  chips,
  otherKey,
  otherText,
  onOtherTextChange,
  onSelect,
  otherPlaceholder,
}: {
  chips: Array<{ key: string; label: string }>;
  otherKey: string;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  onSelect: (text: string) => void;
  otherPlaceholder: string;
}) {
  const [showOther, setShowOther] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => (chip.key === otherKey ? setShowOther(true) : onSelect(chip.label))}
            className="hover-lift min-h-11 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            {chip.label}
          </button>
        ))}
      </div>
      {showOther && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (otherText.trim()) onSelect(otherText.trim());
          }}
        >
          <input
            autoFocus
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            placeholder={otherPlaceholder}
            className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-red)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!otherText.trim()}
            className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {"→"}
          </button>
        </form>
      )}
    </div>
  );
}

function ComplaintStep({
  t,
  otherText,
  onOtherTextChange,
  onSelect,
}: {
  t: ReturnType<typeof useTranslations>;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  onSelect: (text: string) => void;
}) {
  const tCommon = useTranslations("serviceBay.commonComplaints");
  const chips = COMMON_COMPLAINTS.map((key) => ({ key, label: tCommon(key) }));
  return (
    <div className="fade-in-up flex flex-col gap-4">
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("complaintStepLabel")}</p>
      <p className="text-lg text-[var(--text-primary)]">{t("complaintStepPrompt")}</p>
      <ChipGrid
        chips={chips}
        otherKey="other"
        otherText={otherText}
        onOtherTextChange={onOtherTextChange}
        onSelect={onSelect}
        otherPlaceholder={t("complaintOtherPlaceholder")}
      />
    </div>
  );
}

function CategoryStep({ t, onSelect }: { t: ReturnType<typeof useTranslations>; onSelect: (category: SymptomCategory) => void }) {
  const tCat = useTranslations("serviceBay.symptomCategories");
  return (
    <div className="fade-in-up flex flex-col gap-4">
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("symptomCategoryStepLabel")}</p>
      <p className="text-lg text-[var(--text-primary)]">{t("symptomCategoryPrompt")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {SYMPTOM_CATEGORIES.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => onSelect(category)}
            className="hover-lift min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-left font-medium text-[var(--text-primary)] transition"
          >
            {tCat(category.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SymptomDetailStep({
  t,
  category,
  otherText,
  onOtherTextChange,
  onSelect,
}: {
  t: ReturnType<typeof useTranslations>;
  category: SymptomCategory;
  otherText: string;
  onOtherTextChange: (v: string) => void;
  onSelect: (text: string) => void;
}) {
  const tCat = useTranslations("serviceBay.symptomCategories");
  const tSym = useTranslations(`serviceBay.symptoms.${category.key}`);
  const chips = category.options.map((option) => ({ key: option.key, label: tSym(option.labelKey) }));

  return (
    <div className="fade-in-up flex flex-col gap-4">
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">
        {t("symptomDetailStepLabel")} · {tCat(category.labelKey)}
      </p>
      <p className="text-lg text-[var(--text-primary)]">{t("symptomDetailPrompt")}</p>
      <ChipGrid
        chips={chips}
        otherKey="other"
        otherText={otherText}
        onOtherTextChange={onOtherTextChange}
        onSelect={(text) => onSelect(`${tCat(category.labelKey)}: ${text}`)}
        otherPlaceholder={t("symptomOtherPlaceholder")}
      />
    </div>
  );
}

function SymptomCodeStep({
  t,
  value,
  invalid,
  onChange,
  onSubmit,
  onSkip,
}: {
  t: ReturnType<typeof useTranslations>;
  value: string;
  invalid: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <form
      className="fade-in-up flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("symptomCodeStepLabel")}</p>
      <p className="text-lg text-[var(--text-primary)]">{t("symptomCodePrompt")}</p>
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("codeInputPlaceholder")}
        className="min-h-14 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 font-mono text-xl tracking-widest text-[var(--text-primary)] uppercase placeholder:text-[var(--text-muted)] focus:border-[var(--border-red)] focus:outline-none"
      />
      {invalid && (
        <p role="alert" className="text-sm text-[var(--accent-red)]">
          {t("codeInputInvalid")}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!value.trim()}
          className="min-h-11 rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          {t("continue")}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="min-h-11 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] px-6 py-3 font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
        >
          {t("symptomCodeSkip")}
        </button>
      </div>
    </form>
  );
}

function ScanStep({
  t,
  signedIn,
  onFile,
  onRestart,
}: {
  t: ReturnType<typeof useTranslations>;
  signedIn: boolean | null;
  onFile: () => void;
  onRestart: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const disabled = signedIn === null;

  return (
    <div className="fade-in-up flex flex-col items-center gap-5 py-2 text-center">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) onFile();
        }}
        onClick={() => !disabled && onFile()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) onFile();
        }}
        className={`flex w-full cursor-pointer flex-col items-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed p-10 transition ${
          dragOver ? "border-[var(--border-red)] bg-[var(--surface-burgundy)]" : "border-[var(--border-subtle)]"
        } ${disabled ? "cursor-wait opacity-60" : ""}`}
      >
        <UploadIcon />
        <p className="text-lg font-semibold text-[var(--text-primary)]">{t("scanDropTitle")}</p>
        <p className="text-sm text-[var(--text-muted)]">{t("scanDropSubtitle")}</p>
        <span className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)]">
          {t("scanBrowseCta")}
        </span>
      </div>

      <div>
        <p className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">{t("scanSupportedLabel")}</p>
        <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">{t("scanSupportedList")}</p>
      </div>

      {signedIn === false && <p className="text-sm text-[var(--text-secondary)]">{t("scanSignInRequired")}</p>}

      <button type="button" onClick={onRestart} className="text-sm text-[var(--text-muted)] underline-offset-2 hover:underline">
        {t("restart")}
      </button>
    </div>
  );
}

function HistoryGateStep({
  t,
  signedIn,
  onContinue,
  onRestart,
}: {
  t: ReturnType<typeof useTranslations>;
  signedIn: boolean | null;
  onContinue: () => void;
  onRestart: () => void;
}) {
  const tIntake = useTranslations("landingIntake");

  useEffect(() => {
    if (signedIn === true) onContinue();
    // Only auto-advance once we know the visitor is signed in — an
    // unresolved (null) or negative auth state must never silently
    // navigate anywhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  if (signedIn === null) {
    return <div className="fade-in-up py-8 text-center text-sm text-[var(--text-muted)]">{" "}</div>;
  }

  return (
    <div className="fade-in-up flex flex-col items-center gap-3 py-4 text-center">
      <p className="max-w-md text-sm text-[var(--text-secondary)]">{t("historySignInRequired")}</p>
      <Link
        href="/account/login?next=%2Fhistory"
        className="mt-2 inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
      >
        {tIntake("signInCta")}
      </Link>
      <button type="button" onClick={onRestart} className="text-sm text-[var(--text-muted)] underline-offset-2 hover:underline">
        {t("restart")}
      </button>
    </div>
  );
}

function ResultStep({
  t,
  tIntake,
  result,
  onUnlock,
  onImportScan,
  onRestart,
}: {
  t: ReturnType<typeof useTranslations>;
  tIntake: ReturnType<typeof useTranslations>;
  result: NonNullable<PublicIntakeResponse["basicResult"]>;
  onUnlock: () => void;
  onImportScan: () => void;
  onRestart: () => void;
}) {
  const tLocked = useTranslations("lockedSections");
  const localizedLockedSections = LOCKED_SECTION_CATALOG.map((section) => ({
    key: section.key,
    title: tLocked(section.key),
  }));
  const resolutionType = result.resolutionType;
  const showFullDefinition = resolutionType === "generic" || resolutionType === "manufacturer_exact";
  const isVehicleContextRequired = resolutionType === "vehicle_context_required";
  const isReserved = resolutionType === "reserved";
  const isUnknown = resolutionType === "unknown";

  return (
    <div className="fade-in-up flex flex-col gap-6">
      <p className="text-sm font-semibold tracking-wide text-[var(--text-muted)] uppercase">{t("reviewStepLabel")}</p>
      <div>
        <p className="font-mono text-sm text-[var(--accent-red)]">{result.dtcCode}</p>
        {showFullDefinition && (
          <>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{result.definition}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {tIntake("basicResultCategory")}: {result.category}
            </p>
          </>
        )}
        {isVehicleContextRequired && (
          <>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{tIntake("manufacturerSpecificTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{tIntake("manufacturerSpecificBody")}</p>
          </>
        )}
        {isReserved && (
          <>
            <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{tIntake("reservedTitle")}</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{tIntake("reservedBody")}</p>
          </>
        )}
        {isUnknown && (
          <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{tIntake("unknownTitle")}</p>
        )}
      </div>

      {isVehicleContextRequired && result.availableManufacturers.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("manufacturerSpecificKnownFor")}</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">{result.availableManufacturers.join(", ")}</p>
        </div>
      )}

      {isUnknown && (
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("basicResultChecks")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
            <li>{tIntake("unknownStep1")}</li>
            <li>{tIntake("unknownStep2")}</li>
            <li>{tIntake("unknownStep3")}</li>
            <li>{tIntake("unknownStep4")}</li>
            <li>{tIntake("unknownStep5")}</li>
          </ul>
        </div>
      )}

      {(isVehicleContextRequired || isUnknown) && result.relatedCodes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("relatedCodesLabel")}</p>
          <p className="mt-1 font-mono text-sm text-[var(--text-secondary)]">{result.relatedCodes.join(", ")}</p>
        </div>
      )}

      {showFullDefinition && result.genericCauses.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("basicResultCauses")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
            {result.genericCauses.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {showFullDefinition && result.genericSymptoms.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("basicResultSymptoms")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
            {result.genericSymptoms.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {showFullDefinition && result.basicChecks.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("basicResultChecks")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
            {result.basicChecks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}

      {showFullDefinition && result.safetyWarnings.length > 0 && (
        <div
          role="alert"
          className="rounded-[var(--radius-lg)] border-2 p-4"
          style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
        >
          <p className="text-sm font-semibold text-[var(--text-primary)]">{tIntake("basicResultSafety")}</p>
          <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
            {result.safetyWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {showFullDefinition && result.manufacturerSpecificUncertainty && (
        <p className="text-xs text-[var(--text-muted)]">{result.manufacturerSpecificUncertainty}</p>
      )}

      <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-5">
        {isVehicleContextRequired && (
          <button
            type="button"
            onClick={onImportScan}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
          >
            {tIntake("manufacturerSpecificAddVehicle")}
          </button>
        )}
        <button
          type="button"
          onClick={onUnlock}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          {tIntake("upgradeCta")}
        </button>
        <button
          type="button"
          onClick={onImportScan}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
        >
          {tIntake("importScanCta")}
        </button>
      </div>

      <LockedResultPanel sections={localizedLockedSections} />

      <button type="button" onClick={onRestart} className="self-center text-sm text-[var(--text-muted)] underline-offset-2 hover:underline">
        {t("restart")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons — deliberately simple line icons matching the rest of the app's
// stroke-based icon language (see [locale]/page.tsx's VALUE_PROP_ICONS).
// ---------------------------------------------------------------------------

function iconProps() {
  return { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.75 } as const;
}

function CodeIcon() {
  return (
    <svg {...iconProps()} aria-hidden="true">
      <path d="M9 8 4 12l5 4M15 8l5 4-5 4M13 5l-2 14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SymptomIcon() {
  return (
    <svg {...iconProps()} aria-hidden="true">
      <path d="M4 12h4l2-7 4 14 2-7h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg {...iconProps()} aria-hidden="true">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3M8 12h8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg {...iconProps()} aria-hidden="true">
      <path d="M12 8v4l3 2M4 12a8 8 0 1 1 2.5 5.8M4 12v5M4 17h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 16V4M7 9l5-5 5 5M5 16v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
