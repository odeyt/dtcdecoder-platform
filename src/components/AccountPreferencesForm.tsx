"use client";

import { useActionState } from "react";
import { savePreferencesAction } from "@/app/(app)/account/actions";
import { UpgradeCard } from "@/components/UpgradeCard";
import type { Currency, Language, SubscriptionPlan, UserPreferences } from "@/lib/types";

interface Props {
  plan: SubscriptionPlan;
  preferences: Omit<UserPreferences, "user_id" | "created_at" | "updated_at"> & {
    user_id: string;
  };
  languages: Language[];
  currencies: Currency[];
}

const REPORT_MODE_LABEL: Record<string, string> = {
  single: "One language only",
  bilingual: "English + one other language",
  multilingual: "Multiple languages",
};

export function AccountPreferencesForm({ plan, preferences, languages, currencies }: Props) {
  const isPaid = plan === "pro" || plan === "workshop";
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; success?: boolean }, formData: FormData) =>
      savePreferencesAction(formData),
    {},
  );

  // Interface language: any enabled language (paid users aren't limited to
  // the public-only subset — they're entitled to preview any active
  // registry language, not just the fully public ones).
  const interfaceLocaleOptions = languages.filter((l) => l.enabled);
  const aiOutputOptions = languages.filter((l) => l.enabled && l.ai_output_enabled);
  const enabledCurrencies = currencies.filter((c) => c.enabled);

  const disabled = !isPaid || pending;

  return (
    <form action={formAction} className="space-y-8">
      {!isPaid && (
        <UpgradeCard reason="Language, AI report, and currency preferences are saved for Pro and Workshop plans. Free accounts can still switch the interface language temporarily on any page." />
      )}

      <section className="glass-panel rounded-[var(--radius-xl)] p-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Language preferences</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Default interface language" htmlFor="interfaceLocale">
            <select
              id="interfaceLocale"
              name="interfaceLocale"
              defaultValue={preferences.interface_locale}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              {interfaceLocaleOptions.map((l) => (
                <option key={l.locale_code} value={l.locale_code}>
                  {l.english_name}
                  {l.paid_only ? " — Pro/Workshop" : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="AI report language" htmlFor="aiReportLocale">
            <select
              id="aiReportLocale"
              name="aiReportLocale"
              defaultValue={preferences.ai_report_locale ?? ""}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="">English (default)</option>
              {aiOutputOptions
                .filter((l) => l.locale_code !== "en")
                .map((l) => (
                  <option key={l.locale_code} value={l.locale_code}>
                    {l.english_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Secondary report language" htmlFor="secondaryReportLocale">
            <select
              id="secondaryReportLocale"
              name="secondaryReportLocale"
              defaultValue={preferences.secondary_report_locale ?? ""}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="">None</option>
              {aiOutputOptions
                .filter((l) => l.locale_code !== "en")
                .map((l) => (
                  <option key={l.locale_code} value={l.locale_code}>
                    {l.english_name}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Report mode" htmlFor="reportMode">
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Region &amp; display</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Region" htmlFor="regionCode">
            <input
              id="regionCode"
              name="regionCode"
              type="text"
              defaultValue={preferences.region_code ?? ""}
              disabled={disabled}
              placeholder="e.g. US, MX, TH"
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] disabled:opacity-60"
            />
          </Field>

          <Field label="Measurement system" htmlFor="measurementSystem">
            <select
              id="measurementSystem"
              name="measurementSystem"
              defaultValue={preferences.measurement_system}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="metric">Metric</option>
              <option value="imperial">Imperial</option>
            </select>
          </Field>

          <Field label="Temperature unit" htmlFor="temperatureUnit">
            <select
              id="temperatureUnit"
              name="temperatureUnit"
              defaultValue={preferences.temperature_unit}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="celsius">Celsius</option>
              <option value="fahrenheit">Fahrenheit</option>
            </select>
          </Field>

          <Field label="Time format" htmlFor="timeFormat">
            <select
              id="timeFormat"
              name="timeFormat"
              defaultValue={preferences.time_format}
              disabled={disabled}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 text-[var(--text-primary)] disabled:opacity-60"
            >
              <option value="24h">24-hour</option>
              <option value="12h">12-hour</option>
            </select>
          </Field>

          <Field label="Date format" htmlFor="dateFormat">
            <select
              id="dateFormat"
              name="dateFormat"
              defaultValue={preferences.date_format ?? "yyyy-mm-dd"}
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
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Currency</h2>
        <div className="mt-4">
          <Field label="Preferred display currency" htmlFor="preferredCurrency">
            <select
              id="preferredCurrency"
              name="preferredCurrency"
              defaultValue={preferences.preferred_currency ?? "USD"}
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
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Display estimate only — checkout and billing are always in USD, the
            currency Creem actually settles in. Changing this doesn&apos;t affect an
            existing subscription&apos;s charge amount or currency.
          </p>
        </div>
      </section>

      {state.error && <p className="text-sm text-[var(--accent-red)]">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-400">Preferences saved.</p>}

      <button
        type="submit"
        disabled={disabled}
        className="min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save preferences"}
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
