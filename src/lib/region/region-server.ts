import "server-only";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserPreferences } from "@/lib/preferences";
import { resolveRegion } from "./region-resolver";
import type { ResolvedRegion } from "./region-types";
import { REGION_PREFERENCE_COOKIE_NAME } from "./region-constants";

// Re-exported for existing server-side importers — the literal now lives in
// region-constants.ts so client components can read it without pulling in
// this "server-only" module.
export { REGION_PREFERENCE_COOKIE_NAME };

// Mirrors resolveAppShellLocale()'s own warning (see
// src/lib/i18n/app-shell-locale.ts): reading cookies()/headers()/auth here
// opts the calling page into per-request dynamic rendering. Only call this
// from a page that is ALREADY dynamic (the account preferences page, for
// instance) — never from a shared layout, or every currently-static (app)
// page (login, privacy, terms, ...) would lose static generation. Pages
// that just want the geo-detection banner should NOT call this at all —
// see RegionGeoBanner, which resolves entirely client-side instead.
export async function resolveRegionServer(): Promise<ResolvedRegion> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userPreferenceRegionId: string | null = null;
  if (user) {
    const prefs = await getUserPreferences(user.id);
    userPreferenceRegionId = prefs?.region_code ?? null;
  }

  const cookieStore = await cookies();
  const profileSettingRegionId = cookieStore.get(REGION_PREFERENCE_COOKIE_NAME)?.value ?? null;

  const headerStore = await headers();
  const browserLocale = headerStore.get("accept-language")?.split(",")[0]?.trim() ?? null;
  // Set by Vercel's edge network on every request, on every plan — no paid
  // geo-IP service or new dependency needed for this tier. Absent entirely
  // outside Vercel (e.g. local `next dev`), in which case this tier is
  // simply skipped, same as any other missing optional signal.
  const countryCodeHint = headerStore.get("x-vercel-ip-country");

  return resolveRegion({ userPreferenceRegionId, profileSettingRegionId, browserLocale, countryCodeHint });
}
