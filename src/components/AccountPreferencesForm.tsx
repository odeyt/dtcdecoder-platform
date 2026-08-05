"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { savePreferencesAction } from "@/app/(app)/account/actions";
import { UpgradeCard } from "@/components/UpgradeCard";
import { PAID_PLANS } from "@/lib/pricing";
import { listRegionProfiles, getRegionProfile } from "@/lib/region/region-registry";
import type { RegionProfile } from "@/lib/region/region-types";
import type { Currency, Language, SubscriptionPlan, UserPreferences } from "@/lib/types";
import type { DisplayPriceEstimate } from "@/lib/currency";

// RegionProfile.dateFormat uses slash/uppercase labels ("DD/MM/YYYY"); this
// form's existing <select> uses lowercase-dash values to match what's
// already stored in user_preferences.date_format. Converts one region
// default into the other — doesn't touch the DB's existing value format.
function dateFormatSelectValue(profileDateFormat: string): string {
  if (profileDateFormat === "DD/MM/YYYY") return "dd-mm-yyyy";
  if (profileDateFormat === "MM/DD/YYYY") return "mm-dd-yyyy";
  return "yyyy-mm-dd";
}

interface Props {
  plan: SubscriptionPlan;
  preferences: Omit<UserPreferences, "user_id" | "created_at" | "updated_at"> & {
    user_id: string;
  };
  languages: Language[];
  currencies: Currency[];
  priceEstimate: DisplayPriceEstimate;
}

export function AccountPreferencesForm({ plan, preferences, languages, currencies, priceEstimate }: Props) {
  const t = useTranslations("preferences");
  const isPaid = plan === "pro" || plan === "workshop";
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean }, formData: FormData) =>
      savePreferencesAction(formData),
    {},
  );

  const REPORT_MODE_LABEL: Record<string, string> = {
    single: t("reportModeSingle"),
    bilingual: t("reportModeBilingual"),
    multilingual: t("reportModeMultilingual"),
  };

  // Interface language: any enabled language (paid users aren't limited to
  // the public-only subset — they're entitled to preview any active
  // registry language, not just the fully public ones).
  const interfaceLocaleOptions = languages.filter((l) => l.enabled);
  const aiOutputOptions = languages.filter((l) => l.enabled && l.ai_output_enabled);
  const enabledCurrencies = currencies.filter((c) => c.enabled);

  const disabled = !isPaid || pending;

  // Region Profile System: picking a region pre-fills these fields with
  // that country's sensible defaults (docs/REGION_PROFILE_ARCHITECTURE.md).
  // Controlled, not locked — every field below stays independently editable
  // afterward, and the region selector itself is just one more field this
  // form saves (region_code), not a lock on the others.
  const [regionCode, setRegionCode] = useState(preferences.region_code ?? "");
  const [interfaceLocale, setInterfaceLocale] = useState(preferences.interface_locale);
  const [preferredCurrency, setPreferredCurrency] = useState(preferences.preferred_currency ?? "USD");
  const [measurementSystem, setMeasurementSystem] = useState(preferences.measurement_system);
  const [dateFormat, setDateFormat] = useState(preferences.date_format ?? "yyyy-mm-dd");
  const [timezone, setTimezone] = useState(preferences.timezone ?? "");

  function applyRegionDefaults(profile: RegionProfile) {
    // Only apply a default when the target value is actually usable today —
    // e.g. Thailand's default currency (THB) may not be enabled in the
    // admin currency registry yet, in which case the currency field is left
    // exactly as it was rather than silently saving a value the server
    // would reject. Same honest-fallback principle as the rest of this app.
    if (interfaceLocaleOptions.some((l) => l.locale_code === profile.defaultLanguage)) {
      setInterfaceLocale(profile.defaultLanguage);
    }
    if (enabledCurrencies.some((c) => c.code === profile.currency)) {
      setPreferredCurrency(profile.currency);
    }
    setMeasurementSystem(profile.measurementSystem);
    setDateFormat(dateFormatSelectValue(profile.dateFormat));
    setTimezone(profile.timezone);
  }

  function handleRegionChange(nextRegionCode: string) {
    setRegionCode(nextRegionCode);
    if (nextRegionCode) {
      applyRegionDefaults(getRegionProfile(nextRegionCode));
    }
  }

  return (
    <form action={formAction} className="space-y-8">
      {!isPaid && <UpgradeCard reason={t("upgradeReason")} />}

      <section className="glass-panel rounded-[var(--radius-xl)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("languageSection")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("interfaceLanguage")} htmlFor="interfaceLocale">
            <select
              id="interfaceLocale"
              name="interfaceLocale"
              value={interfaceLocale}
              onChange={(e) => setInterfaceLocale(e.target.value)}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              {interfaceLocaleOptions.map((l) => (
                <option key={l.locale_code} value={l.locale_code}>
                  {l.english_name}
                  {l.paid_only ? t("paidOnlyBadge") : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("aiReportLanguage")} htmlFor="aiReportLocale">
            <select
              id="aiReportLocale"
              name="aiReportLocale"
              defaultValue={preferences.ai_report_locale ?? ""}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="">{t("englishDefault")}</option>
              {aiOutputOptions
                .filter((l) => l.locale_code !== "en")
                .map((l) => (
                  <option key={l.locale_code} value={l.locale_code}>
                    {l.english_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label={t("secondaryLanguage")} htmlFor="secondaryReportLocale">
            <select
              id="secondaryReportLocale"
              name="secondaryReportLocale"
              defaultValue={preferences.secondary_report_locale ?? ""}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="">{t("none")}</option>
              {aiOutputOptions
                .filter((l) => l.locale_code !== "en")
                .map((l) => (
                  <option key={l.locale_code} value={l.locale_code}>
                    {l.english_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label={t("reportMode")} htmlFor="reportMode">
            <select
              id="reportMode"
              name="reportMode"
              defaultValue={preferences.report_mode}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              {(plan === "workshop"
                ? ["single", "bilingual", "multilingual"]
                : plan === "pro"
                  ? ["single", "bilingual"]
                  : ["single"]
              ).map((mode) => (
                <option key={mode} value={mode}>
                  {REPORT_MODE_LABEL[mode]}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="glass-panel rounded-[var(--radius-xl)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("regionSection")}</h2>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("regionAppliesDefaults")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label={t("region")} htmlFor="regionCode">
            <select
              id="regionCode"
              name="regionCode"
              value={regionCode}
              onChange={(e) => handleRegionChange(e.target.value)}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="">{t("none")}</option>
              {listRegionProfiles().map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={t("timezone")} htmlFor="timezone">
            <input
              id="timezone"
              name="timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={disabled}
              placeholder={t("timezonePlaceholder")}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60"
            />
          </Field>

          <Field label={t("measurementSystem")} htmlFor="measurementSystem">
            <select
              id="measurementSystem"
              name="measurementSystem"
              value={measurementSystem}
              onChange={(e) => setMeasurementSystem(e.target.value as UserPreferences["measurement_system"])}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="metric">{t("metric")}</option>
              <option value="imperial">{t("imperial")}</option>
            </select>
          </Field>

          <Field label={t("temperatureUnit")} htmlFor="temperatureUnit">
            <select
              id="temperatureUnit"
              name="temperatureUnit"
              defaultValue={preferences.temperature_unit}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="celsius">{t("celsius")}</option>
              <option value="fahrenheit">{t("fahrenheit")}</option>
            </select>
          </Field>

          <Field label={t("timeFormat")} htmlFor="timeFormat">
            <select
              id="timeFormat"
              name="timeFormat"
              defaultValue={preferences.time_format}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="24h">{t("format24h")}</option>
              <option value="12h">{t("format12h")}</option>
            </select>
          </Field>

          <Field label={t("dateFormat")} htmlFor="dateFormat">
            <select
              id="dateFormat"
              name="dateFormat"
              value={dateFormat}
              onChange={(e) => setDateFormat(e.target.value)}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="yyyy-mm-dd">YYYY-MM-DD</option>
              <option value="mm-dd-yyyy">MM-DD-YYYY</option>
              <option value="dd-mm-yyyy">DD-MM-YYYY</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="glass-panel rounded-[var(--radius-xl)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("currencySection")}</h2>
        <div className="mt-4">
          <Field label={t("preferredCurrency")} htmlFor="preferredCurrency">
            <select
              id="preferredCurrency"
              name="preferredCurrency"
              value={preferredCurrency}
              onChange={(e) => setPreferredCurrency(e.target.value)}
              disabled={disabled}
              className="min-h-11 w-full max-w-xs rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              {enabledCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="mt-3 text-xs text-[var(--text-muted)]">{t("currencyDisclaimer")}</p>
          {/* priceEstimate is computed server-side for the currency saved
              before this render — a pre-existing characteristic, not
              something the region selector introduces. Selecting a new
              currency here updates the dropdown and this line's
              visibility immediately; the estimate amount itself reflects
              the new currency after Save reloads the page. */}
          {preferredCurrency && preferredCurrency !== "USD" && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              {priceEstimate.isEstimate
                ? t("exampleEstimateReal", {
                    usdPrice: PAID_PLANS.pro.monthlyPriceUsd,
                    amount: priceEstimate.formatted,
                  })
                : t("exampleEstimateFallback")}
              {" "}
              {t("checkoutUsdNote")}
            </p>
          )}
        </div>
      </section>

      {state.error && <p className="text-sm text-[var(--accent-red)]">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-400">{t("saved")}</p>}

      <button
        type="submit"
        disabled={disabled}
        className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block text-sm">
      <span className="mb-1 block text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
