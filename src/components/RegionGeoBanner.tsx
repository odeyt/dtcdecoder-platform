"use client";

// First-visit region suggestion — "Looks like you're in Thailand. Would you
// like to switch?" per docs/REGION_PROFILE_ARCHITECTURE.md. Deliberately
// entirely client-side: it reads navigator.language itself rather than
// depending on a RegionProvider or a server-resolved region, so it can sit
// in a layout without forcing that layout into per-request dynamic
// rendering (see the warning in region-server.ts's resolveRegionServer —
// the same constraint that keeps resolveAppShellLocale out of layout.tsx).
//
// Shows at most once per browser: any choice (switch or dismiss) sets a
// localStorage flag and this component never renders again afterward,
// matching "User chooses. Save preference. Never override again."
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { resolveRegion } from "@/lib/region/region-resolver";
import { REGION_PREFERENCE_COOKIE_NAME } from "@/lib/region/region-constants";
import type { RegionProfile } from "@/lib/region/region-types";

const DECIDED_STORAGE_KEY = "dtc_region_geo_banner_decided";

function persistRegionPreferenceCookie(regionId: string) {
  document.cookie = `${REGION_PREFERENCE_COOKIE_NAME}=${regionId}; path=/; max-age=31536000; samesite=lax`;
}

export function RegionGeoBanner() {
  const t = useTranslations("regionBanner");
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<RegionProfile | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DECIDED_STORAGE_KEY)) return;

    const browserLocale = navigator.language;
    const resolved = resolveRegion({ browserLocale });
    // Only a real, specific match is worth interrupting the visitor for —
    // "would you like to switch to Global?" is not a meaningful suggestion.
    if (resolved.source === "browser_locale") {
      // Synchronizing with navigator.language/localStorage — values that
      // don't exist during SSR — is exactly the "external system" case the
      // React docs carve out as a legitimate effect use, not the derived-
      // state anti-pattern this lint rule otherwise guards against. Setting
      // state here (rather than in a lazy useState initializer) is what
      // keeps the server and first client render identical, avoiding a
      // hydration mismatch — the state update is deliberately deferred to
      // the post-hydration effect pass.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSuggestion(resolved.profile);
    }
  }, []);

  if (!suggestion) return null;

  function decide(accept: boolean) {
    window.localStorage.setItem(DECIDED_STORAGE_KEY, "1");
    if (accept && suggestion) {
      persistRegionPreferenceCookie(suggestion.id);
      router.refresh();
    }
    setSuggestion(null);
  }

  return (
    <div
      role="status"
      data-testid="region-geo-banner"
      className="glass-panel container-app mt-3 flex flex-col items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="text-[var(--text-secondary)]">{t("suggestion", { region: suggestion.name })}</p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => decide(true)}
          className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-red)]"
        >
          {t("switchButton", { region: suggestion.name })}
        </button>
        {/* No aria-label here: the visible text is already a clear,
            sufficient accessible name. Adding one would override it with
            different wording (WCAG 2.5.3 Label in Name), so what a sighted
            user reads and what a screen reader announces would diverge. */}
        <button
          type="button"
          onClick={() => decide(false)}
          className="min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-red)]"
        >
          {t("dismissButton")}
        </button>
      </div>
    </div>
  );
}
