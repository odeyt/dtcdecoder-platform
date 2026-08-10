"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { subscribe, getSnapshot, getServerSnapshot, promptInstall } from "@/lib/pwa/install-prompt-store";
import { isIosSafari } from "@/lib/pwa/is-ios-safari";

const DISMISSED_KEY = "dtc_pwa_install_dismissed";
// Routes where an install nudge would be a distraction, not a convenience —
// mid sign-in specifically (checkout itself is an off-site Creem redirect,
// so there's no in-app payment route to also suppress).
const SUPPRESSED_PATH_PREFIXES = ["/account/login"];

// Subtle, dismissible install nudge — never blocks the page, never
// reappears once dismissed (see DISMISSED_KEY), and stays off auth/payment
// flows. Chromium/Android gets a real one-tap install via the shared
// install-prompt-store (see that file — also drives InstallAppButton, the
// persistent nav-menu entry for anyone who dismissed this toast); iOS
// Safari has no such API, so it gets a short instructional line instead
// (Phase 7 — "Add to Home Screen").
export function InstallPrompt() {
  const t = useTranslations("pwaInstall");
  const pathname = usePathname();
  const deferredPrompt = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Lazy initializer, not an effect — see install-prompt-store.ts's own
  // comment on why this specific value (unlike showIosHint below) can never
  // cause a hydration mismatch.
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(DISMISSED_KEY) === "1",
  );
  // Starts false on both server and first client render (matches SSR
  // output); flipped one microtask after mount, i.e. only after hydration
  // has already succeeded — see InstallAppButton.tsx for the same pattern.
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (isIosSafari()) setShowIosHint(true);
    });
  }, []);

  const suppressed = SUPPRESSED_PATH_PREFIXES.some((p) => pathname?.startsWith(p));
  const visible = !dismissed && !suppressed && (deferredPrompt !== null || showIosHint);
  if (!visible) return null;

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  }

  async function handleInstall() {
    await promptInstall();
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
