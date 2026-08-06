"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import { formatLimitErrorMessage } from "@/lib/i18n/limit-error-messages";
import type { SubscriptionPlan } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OutputLocaleOption {
  code: string;
  name: string;
}

// A real tech asks what's wrong, then the VIN (or make/model if none), before
// diagnosing anything — this mirrors that with a fixed, client-known
// sequence. Every user (free or paid) walks the same intake; the plan only
// changes what renders once it's complete (locked panel vs. a real answer),
// never whether vehicle context is collected. "vinConfirm" is only reached
// after a real NHTSA decode succeeds — nothing from that decode reaches the
// AI prompt until the user explicitly confirms it here (see
// completeIntake/composeIntakeMessage below and the SAFETY_SUFFIX rule in
// src/lib/ai/assistant.ts, which this confirmation step keeps compatible
// with).
type Stage = "issue" | "vin" | "vinConfirm" | "vehicle" | "chat";

interface IntakeVehicleDetails {
  vin: string;
  make: string;
  model: string;
  year: string;
  trim?: string;
  engineSummary?: string;
}

interface DecodedVehicle {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  engineSummary: string;
}

export function AiAssistantChat({
  signedIn,
  plan,
  outputLocaleOptions = [],
}: {
  signedIn: boolean;
  plan: SubscriptionPlan;
  outputLocaleOptions?: OutputLocaleOption[];
}) {
  const t = useTranslations("dtcTechnician");
  const tLocked = useTranslations("lockedSections");
  const tLimit = useTranslations("usageLimitErrors");
  const EXAMPLES = [
    t("example1"),
    t("example2"),
    t("example3"),
    t("example4"),
    t("example5"),
  ];
  const localizedLockedSections = LOCKED_SECTION_CATALOG.map((section) => ({
    key: section.key,
    title: tLocked(section.key),
  }));
  const isFreePlan = plan === "free";

  const [stage, setStage] = useState<Stage>("issue");
  const [issueInput, setIssueInput] = useState("");
  const [vinInput, setVinInput] = useState("");
  const [makeInput, setMakeInput] = useState("");
  const [modelInput, setModelInput] = useState("");
  const [vinDecodeStatus, setVinDecodeStatus] = useState<"idle" | "loading">("idle");
  // Shown on the `vehicle` stage after a decode came back invalid/failed or
  // the user rejected a confirmed decode — cleared whenever a fresh VIN
  // submit is attempted.
  const [vinDecodeNotice, setVinDecodeNotice] = useState<string | null>(null);
  const [decodedVehicle, setDecodedVehicle] = useState<DecodedVehicle | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "waiting" | "streaming" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [outputLocale, setOutputLocale] = useState("en");
  const abortRef = useRef<AbortController | null>(null);

  const baseStages = [t("stageValidating"), t("stageSearching"), t("stageConsulting")];
  const selectedLocaleName = outputLocaleOptions.find((o) => o.code === outputLocale)?.name;
  // A non-English request skips streaming the English answer entirely (see
  // the API route) — the whole English generation, then the translation,
  // happen before the client sees a single byte. Naming that wait honestly
  // rather than reusing the English-only stage list.
  const aiStages =
    outputLocale !== "en" && selectedLocaleName
      ? [...baseStages, t("stageTranslating", { language: selectedLocaleName })]
      : baseStages;

  async function sendMessage(text: string) {
    if (!text.trim() || status === "waiting" || status === "streaming") return;
    setErrorMessage(null);
    setResetAt(null);
    setStatus("waiting");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;
    // Idempotency key for server-side usage recording — a retry of this
    // exact send (e.g. after an abort/network error) must not double-count
    // against the daily/monthly AI diagnostic allowance.
    const requestId = crypto.randomUUID();

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, outputLocale, requestId }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        // Two possible shapes reach this branch: the plain `{error: string}`
        // used by auth/validation errors, and the structured
        // `{success:false, error:{code,message,upgradeRequired,resetAt,limit}}`
        // used specifically for an exhausted AI diagnostic allowance.
        const message =
          typeof data.error === "string"
            ? data.error
            : data.error
              ? formatLimitErrorMessage(data.error, tLimit) || t("error")
              : t("error");
        setErrorMessage(message);
        if (data.error && typeof data.error === "object" && data.error.resetAt) {
          setResetAt(data.error.resetAt);
        }
        setStatus("error");
        setMessages((prev) => prev.slice(0, -1));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const chunks: string[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(decoder.decode(value, { stream: true }));
        const accumulated = chunks.join("");
        setStatus("streaming");
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: accumulated };
          return next;
        });
      }

      setStatus("idle");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setMessages((prev) => prev.slice(0, -2));
        setStatus("idle");
        return;
      }
      setErrorMessage(t("error"));
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  // Vehicle fields are only ever included when they've reached this function
  // via a user-confirmed decode (vinConfirm's "Yes") or manual entry
  // (submitVehicle) — never from a raw, unconfirmed VIN. The VIN itself is
  // always sent as a bare record line, never phrased as "decoded from", so
  // the model has no basis to treat it as something to interpret (see
  // SAFETY_SUFFIX in src/lib/ai/assistant.ts).
  function composeIntakeMessage(details: IntakeVehicleDetails): string {
    const lines = [issueInput.trim()];
    const vehicleParts = [details.year, details.make, details.model, details.trim]
      .map((part) => part?.trim())
      .filter(Boolean);
    if (vehicleParts.length > 0) {
      lines.push(`${t("vehicleMessageLabel")}: ${vehicleParts.join(" ")}`);
    }
    if (details.engineSummary?.trim()) {
      lines.push(`Engine: ${details.engineSummary.trim()}`);
    }
    const trimmedVin = details.vin.trim();
    if (trimmedVin) {
      lines.push(`VIN: ${trimmedVin.toUpperCase()}`);
    }
    return lines.join("\n");
  }

  function submitIssue(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setIssueInput(trimmed);
    setStage("vin");
  }

  // Free-plan users complete the same intake as everyone else (the "real
  // tech" experience the questions are meant to create), but the collected
  // answers are never sent to the AI — there is no free-tier generation
  // (see AI_DIAGNOSTIC_ENTITLEMENTS.free in src/lib/pricing.ts). Landing on
  // "chat" for a free plan renders the static locked panel below instead.
  async function completeIntake(details: IntakeVehicleDetails) {
    setStage("chat");
    if (isFreePlan) return;
    await sendMessage(composeIntakeMessage(details));
  }

  async function submitVin() {
    const vin = vinInput.trim().toUpperCase();
    if (!vin) return;
    setVinDecodeNotice(null);

    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
      setVinDecodeNotice(t("vinInvalidFormat"));
      return;
    }

    setVinDecodeStatus("loading");
    try {
      const res = await fetch("/api/vin/decode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vin }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.valid) {
        setDecodedVehicle({
          vin,
          year: data.year ?? "",
          make: data.make ?? "",
          model: data.model ?? "",
          trim: data.trim ?? "",
          engineSummary: data.engineSummary ?? "",
        });
        setStage("vinConfirm");
      } else {
        setVinDecodeNotice(t("vinNotRecognized"));
        setStage("vehicle");
      }
    } catch {
      setVinDecodeNotice(t("vinDecodeFailed"));
      setStage("vehicle");
    } finally {
      setVinDecodeStatus("idle");
    }
  }

  function skipVin() {
    setVinDecodeNotice(null);
    setStage("vehicle");
  }

  function confirmDecodedVehicle() {
    if (!decodedVehicle) return;
    void completeIntake(decodedVehicle);
  }

  function rejectDecodedVehicle() {
    setDecodedVehicle(null);
    setStage("vehicle");
  }

  function submitVehicle() {
    void completeIntake({ vin: vinInput, make: makeInput, model: modelInput, year: "" });
  }

  if (!signedIn) {
    return (
      <div className="glass-panel rounded-[var(--radius-xl)] p-10 text-center">
        <p className="text-[var(--text-primary)]">{t("signInPrompt")}</p>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t("signInSubtext")}</p>
        <Link
          href="/account/login"
          className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
        >
          {t("signIn")}
        </Link>
      </div>
    );
  }

  const outputLocaleSelector = outputLocaleOptions.length > 0 && (
    <div className="flex items-center justify-end gap-2 text-sm text-[var(--text-secondary)]">
      <label htmlFor="ai-output-locale">{t("answerIn")}</label>
      <select
        id="ai-output-locale"
        value={outputLocale}
        onChange={(e) => setOutputLocale(e.target.value)}
        disabled={status === "waiting" || status === "streaming"}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)]"
      >
        <option value="en">{t("english")}</option>
        {outputLocaleOptions.map((option) => (
          <option key={option.code} value={option.code}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );

  if (stage === "issue") {
    return (
      <div className="flex flex-col gap-4">
        {outputLocaleSelector}
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => submitIssue(example)}
              className="min-h-11 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
            >
              {example}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitIssue(issueInput);
          }}
          className="glass-panel flex flex-col gap-3 rounded-[var(--radius-xl)] p-6"
        >
          <label htmlFor="dtc-technician-issue" className="text-sm font-semibold text-[var(--text-primary)]">
            {t("describeLabel")}
          </label>
          <input
            id="dtc-technician-issue"
            type="text"
            value={issueInput}
            onChange={(e) => setIssueInput(e.target.value)}
            placeholder={t("describePlaceholder")}
            className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
          />
          <button
            type="submit"
            disabled={!issueInput.trim()}
            className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
          >
            {t("continue")}
          </button>
        </form>
      </div>
    );
  }

  if (stage === "vin") {
    return (
      <div className="flex flex-col gap-4">
        {outputLocaleSelector}
        <div className="glass-panel flex flex-col gap-4 rounded-[var(--radius-xl)] p-6">
          <button
            type="button"
            onClick={() => setStage("issue")}
            className="self-start text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            ← {t("back")}
          </button>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("vinPrompt")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitVin();
            }}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="dtc-technician-vin" className="sr-only">
              {t("vinInputLabel")}
            </label>
            <input
              id="dtc-technician-vin"
              type="text"
              value={vinInput}
              onChange={(e) => setVinInput(e.target.value)}
              maxLength={17}
              placeholder={t("vinPlaceholder")}
              className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
            />
            <button
              type="submit"
              disabled={!vinInput.trim() || vinDecodeStatus === "loading"}
              className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
            >
              {vinDecodeStatus === "loading" ? t("vinVerifying") : t("ask")}
            </button>
          </form>
          {vinDecodeNotice && <p className="text-sm text-[var(--accent-red)]">{vinDecodeNotice}</p>}
          <button
            type="button"
            onClick={skipVin}
            className="self-start text-sm text-[var(--text-secondary)] underline transition hover:text-[var(--text-primary)]"
          >
            {t("vinSkip")}
          </button>
        </div>
      </div>
    );
  }

  if (stage === "vinConfirm" && decodedVehicle) {
    const vehicleLine = [decodedVehicle.year, decodedVehicle.make, decodedVehicle.model, decodedVehicle.trim]
      .filter(Boolean)
      .join(" ");
    return (
      <div className="flex flex-col gap-4">
        {outputLocaleSelector}
        <div className="glass-panel flex flex-col gap-4 rounded-[var(--radius-xl)] p-6">
          <button
            type="button"
            onClick={rejectDecodedVehicle}
            className="self-start text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            ← {t("back")}
          </button>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("vinConfirmPrompt")}</p>
          <p className="text-lg text-[var(--text-primary)]">{vehicleLine}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={confirmDecodedVehicle}
              className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
            >
              {t("vinConfirmYes")}
            </button>
            <button
              type="button"
              onClick={rejectDecodedVehicle}
              className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
            >
              {t("vinConfirmNo")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "vehicle") {
    return (
      <div className="flex flex-col gap-4">
        {outputLocaleSelector}
        <div className="glass-panel flex flex-col gap-4 rounded-[var(--radius-xl)] p-6">
          <button
            type="button"
            onClick={() => setStage("vin")}
            className="self-start text-sm text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            ← {t("back")}
          </button>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("vehiclePrompt")}</p>
          {vinDecodeNotice && <p className="text-sm text-[var(--accent-red)]">{vinDecodeNotice}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitVehicle();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                <label htmlFor="dtc-technician-make" className="sr-only">
                  {t("vehicleMakeLabel")}
                </label>
                <input
                  id="dtc-technician-make"
                  type="text"
                  value={makeInput}
                  onChange={(e) => setMakeInput(e.target.value)}
                  placeholder={t("vehicleMakePlaceholder")}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div className="flex-1">
                <label htmlFor="dtc-technician-model" className="sr-only">
                  {t("vehicleModelLabel")}
                </label>
                <input
                  id="dtc-technician-model"
                  type="text"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder={t("vehicleModelPlaceholder")}
                  className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>
            <button
              type="submit"
              className="min-h-11 self-start rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
            >
              {t("ask")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // stage === "chat"
  if (isFreePlan) {
    return (
      <div className="flex flex-col gap-6">
        <div className="glass-panel rounded-[var(--radius-xl)] p-6">
          <p className="text-sm text-[var(--text-secondary)]">{t("freeLockedBody")}</p>
          <Link
            href="/pricing"
            className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
          >
            {t("freeLockedCta")}
          </Link>
        </div>
        <LockedResultPanel sections={localizedLockedSections} />
      </div>
    );
  }

  const isPendingFirstToken = status === "waiting" && messages[messages.length - 1]?.content === "";

  return (
    <div className="flex flex-col gap-4">
      {outputLocaleSelector}

      <div className="glass-panel min-h-[200px] space-y-4 rounded-[var(--radius-xl)] p-6">
        {messages.map((m, i) => {
          const isPendingAssistantBubble =
            m.role === "assistant" && i === messages.length - 1 && isPendingFirstToken;
          if (isPendingAssistantBubble) {
            return <DiagnosticProgress key={i} stages={aiStages} onCancel={cancel} />;
          }
          return (
            <div key={i}>
              <div className={m.role === "user" ? "text-right" : ""}>
                <p
                  className={`inline-block max-w-full rounded-[var(--radius-lg)] px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-[var(--accent-red)] text-white"
                      : "bg-white/[0.06] text-[var(--text-primary)]"
                  }`}
                >
                  {m.content}
                </p>
              </div>
            </div>
          );
        })}
        {errorMessage && (
          <div>
            <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
            {resetAt && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t("resetsAt", { date: new Date(resetAt).toLocaleString() })}
              </p>
            )}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="flex gap-3"
      >
        <label htmlFor="ai-assistant-input" className="sr-only">
          {t("describeLabel")}
        </label>
        <input
          id="ai-assistant-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("describePlaceholder")}
          className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
        />
        <button
          type="submit"
          disabled={status === "waiting" || status === "streaming"}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {status === "waiting" || status === "streaming" ? t("thinking") : t("ask")}
        </button>
      </form>
    </div>
  );
}
