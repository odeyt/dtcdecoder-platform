import "server-only";
import { headers } from "next/headers";
import { getUserPreferences } from "@/lib/preferences";
import { resolveRegionServer } from "@/lib/region/region-server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { resolveAiLanguage } from "@/lib/i18n/ai-language-resolver";
import { getAllowedOutputLocales } from "@/lib/i18n/languages";
import { getEffectivePlan } from "@/lib/subscriptions";

// Resolves the language a NEW scan case's report content should default to,
// so a technician whose account/region/UI is already Thai doesn't have to
// separately notice and flip ScanReportLanguageSwitcher on every case just
// to get a translated report — that switcher remains the escape hatch for
// overriding this default per case, not the only way to get one.
//
// Same signal sources resolveAiLanguage's own priority chain expects; each
// one reads from its own established server helper (resolveRegionServer,
// resolveAppShellLocale) rather than re-deriving cookies/headers logic here.
// Only call from an already-dynamic request path (an API route handler is
// always dynamic) — never from a shared layout, same constraint those
// helpers already carry.
export async function resolveDefaultReportLanguage(
  userId: string,
  email: string | null,
): Promise<string> {
  const [prefs, region, selectedUiLanguage] = await Promise.all([
    getUserPreferences(userId),
    resolveRegionServer(),
    resolveAppShellLocale(),
  ]);

  const headerStore = await headers();
  const browserLocale = headerStore.get("accept-language")?.split(",")[0]?.trim() ?? null;

  const resolved = resolveAiLanguage({
    userProfileLocale: prefs?.ai_report_locale ?? null,
    regionDefaultLanguage: region.profile.defaultLanguage,
    selectedUiLanguage,
    browserLocale,
  });

  if (resolved.language.locale === "en") return "en";

  // Never default a case to a language this plan isn't entitled to
  // translate into — a free-plan user whose region/browser is Thai still
  // gets an English report by default, exactly as if they'd used the
  // switcher themselves and hit the same plan gate.
  const plan = await getEffectivePlan(userId, email);
  const allowed = await getAllowedOutputLocales(plan);
  if (!allowed.some((l) => l.locale_code === resolved.language.locale)) return "en";

  return resolved.language.locale;
}
