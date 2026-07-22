"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/subscriptions";
import {
  canSaveLanguagePreferences,
  canSaveAiReportLocale,
  canSelectSecondaryLanguage,
  canSelectDisplayCurrency,
  canUseReportMode,
} from "@/lib/i18n/entitlements";
import { isEnabledLocale, isAiOutputEnabledLocale, isEnabledCurrency } from "@/lib/i18n/languages";
import type { MeasurementSystem, ReportMode, TemperatureUnit, TimeFormat } from "@/lib/types";

const preferencesSchema = z.object({
  interfaceLocale: z.string().trim().toLowerCase().min(2).max(10),
  aiReportLocale: z.string().trim().toLowerCase().max(10).optional(),
  secondaryReportLocale: z.string().trim().toLowerCase().max(10).optional(),
  reportMode: z.enum(["single", "bilingual", "multilingual"]),
  preferredCurrency: z.string().trim().toUpperCase().length(3).optional(),
  regionCode: z.string().trim().max(10).optional(),
  measurementSystem: z.enum(["imperial", "metric"]),
  temperatureUnit: z.enum(["celsius", "fahrenheit"]),
  timeFormat: z.enum(["12h", "24h"]),
  dateFormat: z.string().trim().max(20).optional(),
});

// Every field is re-validated here against the real registry/entitlement
// state — the form's disabled/hidden <option>s are a UX convenience, not a
// security boundary. A crafted POST from a free-plan account, or one
// requesting a locale/currency that isn't actually enabled, is rejected
// server-side regardless of what the client sent.
export async function savePreferencesAction(
  formData: FormData,
): Promise<{ error?: string; success?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in to save preferences." };
  }

  const plan = await getEffectivePlan(user.id, user.email ?? null);

  if (!canSaveLanguagePreferences(plan)) {
    return { error: "Upgrade to Pro or Workshop to save language preferences." };
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
  });

  if (!parsed.success) {
    return { error: "Invalid preferences submitted." };
  }
  const input = parsed.data;

  if (!(await isEnabledLocale(input.interfaceLocale))) {
    return { error: "That interface language isn't available." };
  }

  let aiReportLocale: string | null = null;
  if (input.aiReportLocale) {
    if (!canSaveAiReportLocale(plan)) {
      return { error: "Upgrade to Pro or Workshop to save an AI report language." };
    }
    if (!(await isAiOutputEnabledLocale(input.aiReportLocale))) {
      return { error: "That AI report language isn't available yet." };
    }
    aiReportLocale = input.aiReportLocale;
  }

  let secondaryReportLocale: string | null = null;
  if (input.secondaryReportLocale) {
    if (!canSelectSecondaryLanguage(plan)) {
      return { error: "Upgrade to Pro or Workshop to set a secondary report language." };
    }
    if (!(await isAiOutputEnabledLocale(input.secondaryReportLocale))) {
      return { error: "That secondary language isn't available yet." };
    }
    secondaryReportLocale = input.secondaryReportLocale;
  }

  if (!canUseReportMode(plan, input.reportMode as ReportMode)) {
    return { error: "Your plan doesn't include that report mode." };
  }

  let preferredCurrency: string | null = null;
  if (input.preferredCurrency) {
    if (!canSelectDisplayCurrency(plan)) {
      return { error: "Upgrade to Pro or Workshop to set a preferred currency." };
    }
    if (!(await isEnabledCurrency(input.preferredCurrency))) {
      return { error: "That currency isn't available yet." };
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
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: "Failed to save preferences. Try again." };
  }

  revalidatePath("/account/preferences");
  return { success: true };
}
