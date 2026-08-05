"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { getEffectivePlan } from "@/lib/subscriptions";
import {
  canSaveLanguagePreferences,
  canSaveAiReportLocale,
  canSelectSecondaryLanguage,
  canSelectDisplayCurrency,
  canUseReportMode,
} from "@/lib/i18n/entitlements";
import { isEnabledLocale, isAiOutputEnabledLocale, isEnabledCurrency } from "@/lib/i18n/languages";
import { isRecognizedRegionId } from "@/lib/region/region-registry";
import type { MeasurementSystem, ReportMode, TemperatureUnit, TimeFormat } from "@/lib/types";

// Intl itself is the authority on valid IANA zone names — constructing a
// formatter with an unrecognized one throws a RangeError. No hardcoded zone
// list to maintain, and it's the same platform API region-format.ts's
// formatters use to actually render dates, so "saves" and "renders" can
// never disagree about what counts as valid.
function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const preferencesSchema = z.object({
  interfaceLocale: z.string().trim().toLowerCase().min(2).max(10),
  aiReportLocale: z.string().trim().toLowerCase().max(10).optional(),
  secondaryReportLocale: z.string().trim().toLowerCase().max(10).optional(),
  reportMode: z.enum(["single", "bilingual", "multilingual"]),
  preferredCurrency: z.string().trim().toUpperCase().length(3).optional(),
  // Was free text (max 10 chars, no validation) before the Region Profile
  // system — now re-validated against the real registry below. Still
  // optional: a blank submission means "no region selected," not an error.
  regionCode: z.string().trim().max(10).optional(),
  measurementSystem: z.enum(["imperial", "metric"]),
  temperatureUnit: z.enum(["celsius", "fahrenheit"]),
  timeFormat: z.enum(["12h", "24h"]),
  dateFormat: z.string().trim().max(20).optional(),
  // IANA zone name (e.g. "Asia/Bangkok") — not validated against a fixed
  // list here; Intl.DateTimeFormat itself is the authority (an unrecognized
  // zone name throws at format time, in region-format.ts's callers, not on
  // save) rather than this app maintaining its own IANA zone list.
  timezone: z.string().trim().max(100).optional(),
});

// Every field is re-validated here against the real registry/entitlement
// state — the form's disabled/hidden <option>s are a UX convenience, not a
// security boundary. A crafted POST from a free-plan account, or one
// requesting a locale/currency that isn't actually enabled, is rejected
// server-side regardless of what the client sent.
export async function savePreferencesAction(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "preferences" });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: t("errorSignInRequired") };
  }

  const plan = await getEffectivePlan(user.id, user.email ?? null);

  if (!canSaveLanguagePreferences(plan)) {
    return { error: t("errorUpgradeLanguagePrefs") };
  }

  const parsed = preferencesSchema.safeParse({
    interfaceLocale: formData.get("interfaceLocale"),
    aiReportLocale: formData.get("aiReportLocale") || undefined,
    secondaryReportLocale: formData.get("secondaryReportLocale") || undefined,
    reportMode: formData.get("reportMode"),
    preferredCurrency: formData.get("preferredCurrency") || undefined,
    regionCode: formData.get("regionCode") || undefined,
    measurementSystem: formData.get("measurementSystem"),
    temperatureUnit: formData.get("temperatureUnit"),
    timeFormat: formData.get("timeFormat"),
    dateFormat: formData.get("dateFormat") || undefined,
    timezone: formData.get("timezone") || undefined,
  });

  if (!parsed.success) {
    return { error: t("errorInvalidSubmission") };
  }
  const input = parsed.data;

  if (!(await isEnabledLocale(input.interfaceLocale))) {
    return { error: t("errorInterfaceLocaleUnavailable") };
  }

  if (input.regionCode && !isRecognizedRegionId(input.regionCode)) {
    return { error: t("errorRegionUnrecognized") };
  }

  if (input.timezone && !isValidTimeZone(input.timezone)) {
    return { error: t("errorTimezoneUnrecognized") };
  }

  let aiReportLocale: string | null = null;
  if (input.aiReportLocale) {
    if (!canSaveAiReportLocale(plan)) {
      return { error: t("errorUpgradeAiReportLocale") };
    }
    if (!(await isAiOutputEnabledLocale(input.aiReportLocale))) {
      return { error: t("errorAiReportLocaleUnavailable") };
    }
    aiReportLocale = input.aiReportLocale;
  }

  let secondaryReportLocale: string | null = null;
  if (input.secondaryReportLocale) {
    if (!canSelectSecondaryLanguage(plan)) {
      return { error: t("errorUpgradeSecondaryLocale") };
    }
    if (!(await isAiOutputEnabledLocale(input.secondaryReportLocale))) {
      return { error: t("errorSecondaryLocaleUnavailable") };
    }
    secondaryReportLocale = input.secondaryReportLocale;
  }

  if (!canUseReportMode(plan, input.reportMode as ReportMode)) {
    return { error: t("errorReportModeNotIncluded") };
  }

  let preferredCurrency: string | null = null;
  if (input.preferredCurrency) {
    if (!canSelectDisplayCurrency(plan)) {
      return { error: t("errorUpgradeCurrency") };
    }
    if (!(await isEnabledCurrency(input.preferredCurrency))) {
      return { error: t("errorCurrencyUnavailable") };
    }
    preferredCurrency = input.preferredCurrency;
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("user_preferences").upsert(
    {
      user_id: user.id,
      interface_locale: input.interfaceLocale,
      ai_report_locale: aiReportLocale,
      secondary_report_locale: secondaryReportLocale,
      report_mode: input.reportMode,
      preferred_currency: preferredCurrency,
      region_code: input.regionCode ?? null,
      measurement_system: input.measurementSystem as MeasurementSystem,
      temperature_unit: input.temperatureUnit as TemperatureUnit,
      time_format: input.timeFormat as TimeFormat,
      date_format: input.dateFormat ?? null,
      timezone: input.timezone ?? null,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: t("errorSaveFailed") };
  }

  revalidatePath("/account/preferences");
  return { success: true };
}
