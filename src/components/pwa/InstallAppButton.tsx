"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { subscribe, getSnapshot, getServerSnapshot, promptInstall } from "@/lib/pwa/install-prompt-store";
import { isIosSafari } from "@/lib/pwa/is-ios-safari";

// Persistent "Install App" entry for SiteNav (desktop actions row + mobile
// menu) — for anyone who dismissed the InstallPrompt toast, or simply never
// saw it. Shares the same install-prompt-store as that toast, so triggering
// install from either surface keeps both in sync. Unlike the toast, this
// one is never dismissible and never hidden by route — it's meant to be a
// stable, always-findable menu item, the mobile-app equivalent of "Sign
// in"/"Decode a code" already in the same nav.
export function InstallAppButton({ className }: { className?: string }) {
  const t = useTranslations("pwaInstall");
  const deferredPrompt = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // Starts false on both server and first client render — matches SSR
  // output, then flips one microtask after mount (after hydration has
  // already succeeded), same pattern as InstallPrompt.tsx.
  const [showIosHint, setShowIosHint] = useState(false);
  const [iosExpanded, setIosExpanded] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      if (isIosSafari()) setShowIosHint(true);
    });
  }, []);

  const visible = deferredPrompt !== null || showIosHint;
  if (!visible) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await promptInstall();
      return;
    }
    // iOS has no install API to trigger — toggle the instructional line.
    setIosExpanded((v) => !v);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        aria-expanded={showIosHint && !deferredPrompt ? iosExpanded : undefined}
        className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
      >
        {t("installButton")}
      </button>
      {showIosHint && !deferredPrompt && iosExpanded && (
        <p className="mt-2 max-w-[16rem] text-xs text-[var(--text-muted)]">{t("iosInstructions")}</p>
      )}
    </div>
  );
}
