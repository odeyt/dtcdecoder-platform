"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { recordClientEvent } from "@/lib/analytics/client";
import { GuidedDiagnosisPanel } from "@/components/GuidedDiagnosisPanel";
import type { DtcTechnicianContext } from "@/lib/dtc-technician/context";

// Persistent, page-agnostic consultation launcher — a floating trigger that
// opens a desktop side drawer / mobile bottom sheet (same component, pure
// CSS breakpoint switch, not two implementations). Mounted once in each
// root layout (see src/app/(app)/layout.tsx and src/app/[locale]/layout.tsx)
// so it's available across every customer-facing page except the
// explicitly excluded ones below.
//
// Phase 1 scope: a real, working composer against the existing
// /api/ai/assistant generation endpoint (same entitlement/quota
// enforcement as the full /ai-assistant page — nothing here bypasses it),
// plus context-aware display and disabled previews for not-yet-built
// future actions (Guided Diagnosis, Save to Diagnostic Case). It does not
// duplicate AiAssistantChat's free-plan static-preview branch — a Free
// user's first message simply surfaces the same upgrade-required response
// the API already returns, which this component shows as a normal error
// with an upgrade CTA, never a fabricated response.
const EXCLUDED_PATH_PREFIXES = [
  "/admin",
  "/account/login",
  "/account/forgot-password",
  "/account/reset-password",
  "/account/auth",
];

interface ShellMessage {
  role: "user" | "assistant";
  content: string;
}

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function DtcTechnicianShell({ context }: { context?: DtcTechnicianContext }) {
  const t = useTranslations("dtcTechnicianShell");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ShellMessage[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<"idle" | "waiting" | "streaming" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guidedMode, setGuidedMode] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(context?.caseId ?? null);

  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));

    // This shell mounts once in the root layout and persists across
    // client-side navigation (including the redirect after signing in) —
    // a one-time getUser() at mount would go stale the moment someone signs
    // in or out without a full page reload. Subscribing keeps signedIn
    // accurate for the shell's whole lifetime.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user));
    });
    return () => subscription.unsubscribe();
  }, []);

  // Cross-component open trigger (docs/DIAGNOSTIC_ENGINE_LANDING_BUTTON_FIX.md)
  // — the landing page's "Start Guided Diagnosis" CTA lives in a separate
  // component tree (LandingDtcTechnician) from this persistent, once-mounted
  // shell, so it asks to open in guided mode via a plain DOM CustomEvent
  // rather than lifting shell state into a new global store. This only
  // opens the UI — it never calls the Diagnostic Engine API itself, which
  // GuidedDiagnosisPanel below still gates through the real, unchanged
  // server-side rollout/entitlement check on every turn.
  useEffect(() => {
    function handleOpenGuided() {
      setOpen(true);
      setGuidedMode(true);
    }
    window.addEventListener("dtc-technician:open-guided", handleOpenGuided);
    return () => window.removeEventListener("dtc-technician:open-guided", handleOpenGuided);
  }, []);

  // Focus trap + Escape-to-close + focus restoration.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeShell();
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function openShell() {
    setOpen(true);
    recordClientEvent("dtc_technician_opened", { path: pathname });
  }

  function closeShell() {
    setOpen(false);
    recordClientEvent("dtc_technician_closed", { path: pathname });
    previouslyFocused.current?.focus();
  }

  async function sendMessage(text: string) {
    if (!text.trim() || status === "waiting" || status === "streaming") return;
    setErrorMessage(null);
    setStatus("waiting");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setInput("");

    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = crypto.randomUUID();

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          requestId,
          ...(activeCaseId ? { caseId: activeCaseId } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        const message = typeof data.error === "string" ? data.error : (data.error?.message ?? t("errorGeneric"));
        setErrorMessage(message);
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
      setErrorMessage(t("errorGeneric"));
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function handleImportScan() {
    recordClientEvent("import_vehicle_scan_clicked", { source: "shell" });
    router.push("/diagnostics/upload");
  }

  if (isExcludedPath(pathname ?? "")) return null;

  const firstDtc = context?.dtcCodes[0];

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openShell}
        aria-label={t("openLabel")}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed right-5 bottom-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-red)] text-white transition hover:brightness-110 print:hidden"
        style={{ boxShadow: "var(--shadow-accent)" }}
      >
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 3a9 9 0 1 0 5.6 16l3.4 1-1-3.4A9 9 0 0 0 12 3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/50"
            onClick={closeShell}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${t("title")} — ${t("subtitle")}`}
            className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[var(--radius-xl)] border-t border-[var(--border-subtle)] bg-[var(--surface-0)] p-5 sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-h-full sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-[var(--radius-xl)] sm:border-t-0 sm:border-l"
            style={{ boxShadow: "var(--shadow-ambient)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <p className="text-base font-bold text-[var(--text-primary)]">{t("title")}</p>
                <p className="text-xs text-[var(--text-muted)]">{t("subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={closeShell}
                aria-label={t("closeLabel")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {firstDtc && (
              <p className="mt-3 w-fit rounded-full border border-[var(--border-subtle)] px-3 py-1 font-mono text-xs text-[var(--text-secondary)]">
                {firstDtc}
                {context?.vehicle?.make ? ` · ${context.vehicle.make} ${context.vehicle.model ?? ""}`.trimEnd() : ""}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {firstDtc && (
                <button
                  type="button"
                  onClick={() => sendMessage(`Explain ${firstDtc}`)}
                  className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
                >
                  {t("explainCode")}
                </button>
              )}
              <button
                type="button"
                onClick={() => sendMessage(firstDtc ? `What should I test first for ${firstDtc}?` : "What should I test first?")}
                className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
              >
                {t("whatToTestFirst")}
              </button>
              <button
                type="button"
                onClick={handleImportScan}
                className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
              >
                {t("importScan")}
              </button>
              <button
                type="button"
                onClick={() => {
                  recordClientEvent("guided_diagnosis_clicked", { path: pathname });
                  setGuidedMode((prev) => !prev);
                }}
                aria-pressed={guidedMode}
                className={`min-h-11 rounded-full border px-3 py-1.5 text-xs transition ${
                  guidedMode
                    ? "border-[var(--border-red)] text-[var(--accent-red)]"
                    : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t("guidedDiagnosis")}
              </button>
              <button
                type="button"
                disabled
                title={t("saveToCaseComingSoon")}
                aria-disabled="true"
                className="min-h-11 cursor-not-allowed rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-muted)] opacity-60"
              >
                {t("saveToCase")}
              </button>
              {context?.caseId && (
                <Link
                  href={`/diagnostics/${context.caseId}`}
                  className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
                >
                  {t("resumeCase")}
                </Link>
              )}
              <Link
                href="/history"
                className="min-h-11 rounded-full border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
              >
                {t("viewHistory")}
              </Link>
            </div>

            {signedIn === false ? (
              <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm text-[var(--text-secondary)]">{t("signInPrompt")}</p>
                <Link
                  href="/account/login"
                  className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
                >
                  {t("signInCta")}
                </Link>
              </div>
            ) : guidedMode ? (
              <GuidedDiagnosisPanel
                initialCaseId={activeCaseId}
                onCaseCreated={(newCaseId) => setActiveCaseId(newCaseId)}
              />
            ) : (
              <>
                <div className="mt-4 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
                  {messages.length === 0 && (
                    <p className="text-sm text-[var(--text-muted)]">{t("emptyState")}</p>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={m.role === "user" ? "text-right" : ""}>
                      <p
                        className={`inline-block max-w-full rounded-[var(--radius-lg)] px-3 py-2 text-sm whitespace-pre-wrap ${
                          m.role === "user" ? "bg-[var(--accent-red)] text-white" : "bg-white/[0.06] text-[var(--text-primary)]"
                        }`}
                      >
                        {m.content || (status === "waiting" && i === messages.length - 1 ? t("loadingLabel") : "")}
                      </p>
                    </div>
                  ))}
                  {errorMessage && <p role="alert" className="text-sm text-[var(--accent-red)]">{errorMessage}</p>}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessage(input);
                  }}
                  className="mt-3 flex gap-2 border-t border-[var(--border-subtle)] pt-3"
                >
                  <label htmlFor="dtc-technician-shell-input" className="sr-only">
                    {t("composerLabel")}
                  </label>
                  <input
                    id="dtc-technician-shell-input"
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t("composerPlaceholder")}
                    disabled={status === "waiting" || status === "streaming"}
                    className="min-h-11 flex-1 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={status === "waiting" || status === "streaming" || !input.trim()}
                    className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
                  >
                    {t("send")}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
