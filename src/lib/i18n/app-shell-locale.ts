import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserPreferences } from "@/lib/preferences";
import { isEnabledLocale } from "@/lib/i18n/languages";
import { DEFAULT_LOCALE } from "@/lib/i18n/locale-codes";

// Anonymous/free "temporary" language switching, never persisted — a saved
// account preference (Pro/Workshop only) always wins over this cookie when
// both exist. Distinct from the [locale] segment used by the public content
// tree, since (app)-shell routes don't carry a locale in the URL.
export const APP_LOCALE_COOKIE_NAME = "dtc_interface_locale";

// Only call this from pages that are ALREADY dynamic (account, pricing,
// preferences, ai-assistant, history all read auth/DB already) — reading
// cookies()/auth here would force a currently-static (app) page (login,
// privacy, terms, contact, affiliate-disclosure) into per-request dynamic
// rendering, which the shared (app) layout deliberately avoids so those
// pages can stay statically generated. Never call this from
// src/app/(app)/layout.tsx itself.
export async function resolveAppShellLocale(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const prefs = await getUserPreferences(user.id);
    if (prefs?.interface_locale && (await isEnabledLocale(prefs.interface_locale))) {
      return prefs.interface_locale;
    }
  }

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(APP_LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale && (await isEnabledLocale(cookieLocale))) {
    return cookieLocale;
  }

  return DEFAULT_LOCALE;
}

// Only English and Spanish have real catalogs today — see the multilingual
// rollout plan. Mirrors the same fallback used by src/i18n/request.ts for
// the [locale] tree, kept here rather than imported from there since that
// file is next-intl's own request-config entry point, not a general helper.
export async function getAppShellMessages(locale: string) {
  const hasCatalog = locale === "en" || locale === "es";
  const catalogLocale = hasCatalog ? locale : DEFAULT_LOCALE;
  return (await import(`../../../messages/${catalogLocale}.json`)).default;
}
