"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { DiagnosticProgress } from "@/components/DiagnosticProgress";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";
import type { SubscriptionPlan } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OutputLocaleOption {
  code: string;
  name: string;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "waiting" | "streaming" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetAt, setResetAt] = useState<string | null>(null);
  const [outputLocale, setOutputLocale] = useState("en");
  const abortRef = useRef<AbortController | null>(null);
  const isFreePlan = plan === "free";

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
        // `{success:false, error:{code,message,upgradeRequired,resetAt}}`
        // used specifically for an exhausted AI diagnostic allowance.
        const message = typeof data.error === "string" ? data.error : (data.error?.message ?? t("error"));
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

  const isPendingFirstToken =
    status === "waiting" && messages[messages.length - 1]?.content === "";

  // The Free plan gets zero AI diagnostic generations (see
  // src/lib/pricing.ts) — every request from a free-plan user would be
  // rejected server-side before any AI call happens. Rather than let a
  // free user submit and hit a 429, show the locked state up front: static
  // example questions (never real generated answers) and the same locked-
  // sections catalog used elsewhere, with a clear upgrade path.
  if (isFreePlan) {
    return (
      <div className="flex flex-col gap-6">
        <div className="glass-panel rounded-[var(--radius-xl)] p-6">
          <p className="text-sm text-[var(--text-secondary)]">{t("freeLockedBody")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <span
                key={example}
                className="rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-muted)]"
              >
                {example}
              </span>
            ))}
          </div>
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

  return (
    <div className="flex flex-col gap-4">
      {outputLocaleOptions.length > 0 && (
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
      )}

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => sendMessage(example)}
              className="min-h-11 rounded-full border border-[var(--border-subtle)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="glass-panel min-h-[200px] space-y-4 rounded-[var(--radius-xl)] p-6">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">{t("emptyState")}</p>
        )}
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
