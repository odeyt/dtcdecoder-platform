"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const DISMISSED_KEY = "dtc_pwa_install_dismissed";
// Routes where an install nudge would be a distraction, not a convenience —
// mid sign-in specifically (checkout itself is an off-site Creem redirect,
// so there's no in-app payment route to also suppress).
const SUPPRESSED_PATH_PREFIXES = ["/account/login"];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandaloneAlready = (window.navigator as { standalone?: boolean }).standalone === true;
  return isIos && !isStandaloneAlready;
}

// Subtle, dismissible install nudge — never blocks the page, never
// reappears once dismissed (see DISMISSED_KEY), and stays off auth/payment
// flows. Chromium/Android gets a real one-tap install via the captured
// `beforeinstallprompt` event; iOS Safari has no such API, so it gets a
// short instructional line instead (Phase 7 — "Add to Home Screen").
export function InstallPrompt() {
  const t = useTranslations("pwaInstall");
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Both default to their SSR-safe values (false) so the first client render
  // matches the server-rendered markup exactly — no hydration mismatch.
  // `dismissed` uses a lazy initializer (localStorage IS available
  // synchronously by the time this component mounts client-side; the
  // server-rendered pass never reaches this branch at all since
  // `typeof window === "undefined"` there, so there's nothing to mismatch
  // against). `showIosHint`, by contrast, would genuinely disagree with the
  // server's output if read synchronously (real iOS visitors would compute
  // true on mount, false on the server) — deferred into the effect below,
  // one microtask after commit, so it only ever changes DOM output on a
  // second pass, after hydration has already succeeded.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISSED_KEY) === "1",
  );
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    queueMicrotask(() => {
      if (isIosSafari()) setShowIosHint(true);
    });

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  const suppressed = SUPPRESSED_PATH_PREFIXES.some((p) => pathname?.startsWith(p));
  const visible = !dismissed && !suppressed && (deferredPrompt !== null || showIosHint);
  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  return (
    <div
      role="complementary"
      aria-label={t("title")}
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-sm items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-1)]/95 p-4 shadow-lg backdrop-blur-md sm:left-auto sm:right-4"
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{t("title")}</p>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          {showIosHint && !deferredPrompt ? t("iosInstructions") : t("body")}
        </p>
        {deferredPrompt && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="min-h-9 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              {t("installButton")}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="min-h-9 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              {t("dismissButton")}
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("dismissButton")}
        className="text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
      >
        ×
      </button>
    </div>
  );
}
