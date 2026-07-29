"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { HeroSearch } from "@/components/HeroSearch";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import { recordClientEvent } from "@/lib/analytics/client";
import { emptyIntake, type LandingDiagnosticIntake, type PublicIntakeResponse } from "@/lib/landing-intake/types";

// Server-side-only temporary carrier: the browser preserves an anonymous
// visitor's in-progress intake here across the sign-in redirect (never in
// the URL — see spec "Do not place long diagnostic content directly in
// URLs"). Slice 4's create-from-intake handoff reads this same key.
export const LANDING_INTAKE_STORAGE_KEY = "dtc_landing_intake";

type Phase = "idle" | "loading" | "intake" | "basic_result" | "sign_in_required" | "upgrade_required" | "error";

const PROMPT_CHIPS = [
  "I have P0303 on a 2018 Toyota Camry",
  "The engine cranks but will not start",
  "My scan shows multiple CAN communication faults",
  "What should I test first for P0015?",
  "The vehicle only misfires when cold",
  "Help me understand this scan report",
];

function saveIntakeForHandoff(intake: LandingDiagnosticIntake) {
  try {
    sessionStorage.setItem(LANDING_INTAKE_STORAGE_KEY, JSON.stringify(intake));
  } catch {
    // sessionStorage can throw in a locked-down/private-browsing context —
    // losing the handoff convenience is an acceptable degradation, never a
    // crash of the intake flow itself.
  }
}

// Server-computed only (docs/DIAGNOSTIC_ENGINE_LANDING_BUTTON_FIX.md) — the
// page-level Server Component resolves this via the same
// isDiagnosticEngineRolloutAllowed(email, isAdmin) check the real API route
// uses, never a client-side guess. This value only decides which CTA
// renders; it grants no API access on its own — every /turn call still
// goes through that identical server-side check independently.
export type GuidedDiagnosisAccess = "anonymous" | "locked" | "eligible";

export function LandingDtcTechnician({ locale, guidedDiagnosisAccess }: { locale: string; guidedDiagnosisAccess: GuidedDiagnosisAccess }) {
  const t = useTranslations("landingIntake");
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [intake, setIntake] = useState<LandingDiagnosticIntake>(() => emptyIntake(locale));
  const [input, setInput] = useState("");
  const [response, setResponse] = useState<PublicIntakeResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [startedConsultation, setStartedConsultation] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
  }, []);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || phase === "loading") return;

    if (!startedConsultation) {
      setStartedConsultation(true);
      recordClientEvent("landing_consultation_started");
    } else {
      recordClientEvent("public_intake_question_submitted");
    }

    setErrorMessage(null);
    setPhase("loading");
    setInput("");

    try {
      const res = await fetch("/api/public/diagnostic-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, intake }),
      });
      const body: unknown = await res.json().catch(() => null);
      const errorMessageFromBody =
        body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
          ? (body as { error: string }).error
          : undefined;

      if (!res.ok || !body || errorMessageFromBody) {
        setErrorMessage(errorMessageFromBody || t("errorGeneric"));
        setPhase("error");
        return;
      }

      const data = body as PublicIntakeResponse;
      setResponse(data);
      setIntake(data.preservedIntake);

      if (data.status === "needs_more_information") {
        setPhase("intake");
      } else if (data.status === "basic_result") {
        setPhase("basic_result");
        recordClientEvent("public_intake_basic_result_viewed", { dtcCode: data.basicResult?.dtcCode });
        recordClientEvent("locked_feature_viewed", { source: "landing_basic_result" });
      } else if (data.status === "sign_in_required") {
        saveIntakeForHandoff(data.preservedIntake);
        setPhase("sign_in_required");
      } else {
        setPhase("upgrade_required");
      }
    } catch {
      setErrorMessage(t("errorGeneric"));
      setPhase("error");
    }
  }

  function selectPrompt(prompt: string) {
    recordClientEvent("landing_prompt_selected", { prompt });
    submit(prompt);
  }

  function restart() {
    setPhase("idle");
    setIntake(emptyIntake(locale));
    setResponse(null);
    setErrorMessage(null);
    setInput("");
    setStartedConsultation(false);
  }

  function handleImportScanClick() {
    recordClientEvent("import_vehicle_scan_clicked", { source: "landing" });
    if (!signedIn) {
      saveIntakeForHandoff(intake);
      router.push("/account/login?next=%2Fdiagnostics%2Fupload");
      return;
    }
    router.push("/diagnostics/upload");
  }

  function handleSignInClick() {
    recordClientEvent("signin_from_intake_clicked");
    router.push("/account/login?next=%2Fdiagnostics%2Ffrom-intake");
  }

  function handleUpgradeClick() {
    recordClientEvent("upgrade_from_consultation_clicked", { source: "landing" });
    router.push("/pricing");
  }

  return (
    <div className="mx-auto w-full max-w-[900px]">
      <div
        className="glass-panel rounded-[var(--radius-xl)] border border-[var(--border-subtle)] p-6 sm:p-8"
        style={{ boxShadow: "var(--shadow-ambient)" }}
      >
        {(phase === "idle" || phase === "intake" || phase === "loading" || phase === "error") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex flex-col gap-4"
          >
            {phase === "intake" && response?.message && (
              <p role="status" className="text-sm font-medium text-[var(--accent-red)]">
                {response.message}
              </p>
            )}
            <label htmlFor="landing-intake-composer" className="sr-only">
              {t("composerLabel")}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <textarea
                id="landing-intake-composer"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={phase === "loading"}
                placeholder={t("composerPlaceholder")}
                rows={2}
                className="min-h-[60px] flex-1 resize-none rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--border-red)] focus:outline-none disabled:opacity-60"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit(input);
                  }
                }}
              />
              <button
                type="submit"
                disabled={phase === "loading" || !input.trim()}
                className="min-h-11 shrink-0 rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                style={{ boxShadow: "var(--shadow-accent)" }}
              >
                {phase === "loading" ? t("loadingLabel") : t("consultCta")}
              </button>
            </div>

            {phase === "idle" && (
              <div className="flex flex-wrap gap-2" aria-live="polite">
                {PROMPT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => selectPrompt(chip)}
                    className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-left text-xs text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)] sm:text-sm"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {errorMessage && (
              <p role="alert" className="text-sm text-[var(--accent-red)]">
                {errorMessage}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border-subtle)] pt-4">
              <button
                type="button"
                onClick={handleImportScanClick}
                className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
              >
                {t("importScanCta")}
              </button>
              {guidedDiagnosisAccess === "eligible" ? (
                <button
                  type="button"
                  onClick={() => {
                    recordClientEvent("guided_diagnosis_clicked", { path: "landing" });
                    window.dispatchEvent(new CustomEvent("dtc-technician:open-guided"));
                  }}
                  className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-red)] px-4 py-2.5 text-sm font-medium text-[var(--accent-red)] transition hover:brightness-110"
                >
                  {t("guidedDiagnosisCta")}
                </button>
              ) : guidedDiagnosisAccess === "anonymous" ? (
                <Link
                  href="/account/login"
                  title={t("signInRequiredTitle")}
                  className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
                >
                  {t("guidedDiagnosisCta")}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  title={t("guidedDiagnosisComingSoon")}
                  aria-disabled="true"
                  className="min-h-11 cursor-not-allowed rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--text-muted)] opacity-60"
                >
                  {t("guidedDiagnosisCta")}
                </button>
              )}
              {phase !== "idle" && (
                <button
                  type="button"
                  onClick={restart}
                  className="min-h-11 rounded-[var(--radius-md)] px-3 py-2.5 text-sm text-[var(--text-muted)] underline-offset-2 hover:underline"
                >
                  {t("restart")}
                </button>
              )}
            </div>
          </form>
        )}

        {phase === "sign_in_required" && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-lg font-semibold text-[var(--text-primary)]">{t("signInRequiredTitle")}</p>
            <p className="max-w-md text-sm text-[var(--text-secondary)]">{t("signInRequiredBody")}</p>
            <button
              type="button"
              onClick={handleSignInClick}
              className="mt-2 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            >
              {t("signInCta")}
            </button>
            <button type="button" onClick={restart} className="text-sm text-[var(--text-muted)] underline-offset-2 hover:underline">
              {t("restart")}
            </button>
          </div>
        )}

        {(phase === "basic_result" || phase === "upgrade_required") && response?.basicResult && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="font-mono text-sm text-[var(--accent-red)]">{response.basicResult.dtcCode}</p>
              <p className="mt-1 text-lg font-bold text-[var(--text-primary)]">{response.basicResult.definition}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {t("basicResultCategory")}: {response.basicResult.category}
              </p>
            </div>

            {response.basicResult.genericCauses.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{t("basicResultCauses")}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
                  {response.basicResult.genericCauses.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {response.basicResult.genericSymptoms.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{t("basicResultSymptoms")}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
                  {response.basicResult.genericSymptoms.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {response.basicResult.basicChecks.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">{t("basicResultChecks")}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
                  {response.basicResult.basicChecks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {response.basicResult.safetyWarnings.length > 0 && (
              <div
                role="alert"
                className="rounded-[var(--radius-lg)] border-2 p-4"
                style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
              >
                <p className="text-sm font-semibold text-[var(--text-primary)]">{t("basicResultSafety")}</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--text-secondary)]">
                  {response.basicResult.safetyWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {response.basicResult.manufacturerSpecificUncertainty && (
              <p className="text-xs text-[var(--text-muted)]">{response.basicResult.manufacturerSpecificUncertainty}</p>
            )}

            <div className="rounded-[var(--radius-lg)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-5 text-center">
              <p className="text-sm text-[var(--text-secondary)]">{t("upgradeBody")}</p>
              <button
                type="button"
                onClick={handleUpgradeClick}
                className="mt-3 min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
              >
                {t("upgradeCta")}
              </button>
            </div>

            <LockedResultPanel sections={LOCKED_SECTION_CATALOG} />

            <button
              type="button"
              onClick={restart}
              className="self-center text-sm text-[var(--text-muted)] underline-offset-2 hover:underline"
            >
              {t("restart")}
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 text-center">
        <p className="text-sm text-[var(--text-muted)]">{t("quickLookupLabel")}</p>
        <div className="mt-3">
          <HeroSearch />
        </div>
      </div>
    </div>
  );
}
