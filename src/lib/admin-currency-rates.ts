import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrencyRate } from "@/lib/types";

export async function listCurrencyRatesForAdmin(): Promise<CurrencyRate[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("currency_rates")
    .select("*")
    .order("quote_currency", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface CurrencyRateInput {
  quoteCurrency: string;
  rate: number;
  sourceLabel: string;
  expiresAt: string | null;
  enabled: boolean;
  updatedBy: string;
}

// Upserts on (base_currency, quote_currency) — there is only ever one
// "current" rate per currency pair in this v1 design (no historical rate
// table), matching the "static, admin-managed" scope decision.
export async function upsertCurrencyRate(input: CurrencyRateInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("currency_rates").upsert(
    {
      base_currency: "USD",
      quote_currency: input.quoteCurrency,
      rate: input.rate,
      source_label: input.sourceLabel,
      expires_at: input.expiresAt,
      enabled: input.enabled,
      updated_by: input.updatedBy,
      effective_at: new Date().toISOString(),
    },
    { onConflict: "base_currency,quote_currency" },
  );
  if (error) throw error;
}
