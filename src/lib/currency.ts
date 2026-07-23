import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CurrencyRate } from "@/lib/types";

// Real, admin-entered static rate — never a live FX fetch. Returns null
// when USD is requested (no conversion needed), when no rate row exists,
// or when the most recent rate has expired — every one of those cases is
// the caller's cue to fall back to displaying the USD price unmodified,
// never to guess or reuse a stale number.
export async function getCurrencyRate(quoteCurrency: string): Promise<CurrencyRate | null> {
  if (quoteCurrency === "USD") return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("currency_rates")
    .select("*")
    .eq("base_currency", "USD")
    .eq("quote_currency", quoteCurrency)
    .eq("enabled", true)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

  return data;
}

// Converts a USD display price into the quote currency's own precision.
// This is a *display estimate* only — never a value that gets stored or
// charged — so a single multiply-then-round at the target currency's own
// decimal_places is the correct approach (correctly collapses to whole
// units for zero-decimal currencies like JPY/KRW/VND/CLP/HUF), not a
// ledger-grade calculation. Actual money movement always happens in USD
// through Creem, never in this converted number.
export function convertDisplayPrice(usdAmount: number, rate: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round(usdAmount * rate * factor) / factor;
}

export function formatCurrencyAmount(amount: number, currencyCode: string, decimalPlaces: number): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(amount);
  } catch {
    // Intl.NumberFormat throws for a currency code it doesn't recognize
    // (shouldn't happen for real ISO 4217 codes, but fail safe rather than
    // crash the page over a formatting quirk).
    return `${amount.toFixed(decimalPlaces)} ${currencyCode}`;
  }
}

// The one function pages should call: resolves the real rate (or lack of
// one), converts, and formats — always returning enough information to
// render the required "estimated display price" / "checkout will be
// charged in USD" disclosure honestly rather than presenting a converted
// number as if it were authoritative.
export interface DisplayPriceEstimate {
  currencyCode: string;
  formatted: string;
  isEstimate: boolean;
  rateSource: string | null;
  rateEffectiveAt: string | null;
}

export async function getDisplayPriceEstimate(
  usdAmount: number,
  currencyCode: string,
  decimalPlaces: number,
): Promise<DisplayPriceEstimate> {
  if (currencyCode === "USD") {
    return {
      currencyCode: "USD",
      formatted: formatCurrencyAmount(usdAmount, "USD", decimalPlaces),
      isEstimate: false,
      rateSource: null,
      rateEffectiveAt: null,
    };
  }

  const rate = await getCurrencyRate(currencyCode);
  if (!rate) {
    // No valid rate — fall back to USD rather than fabricate a number.
    return {
      currencyCode: "USD",
      formatted: formatCurrencyAmount(usdAmount, "USD", decimalPlaces),
      isEstimate: false,
      rateSource: null,
      rateEffectiveAt: null,
    };
  }

  const converted = convertDisplayPrice(usdAmount, rate.rate, decimalPlaces);
  return {
    currencyCode,
    formatted: formatCurrencyAmount(converted, currencyCode, decimalPlaces),
    isEstimate: true,
    rateSource: rate.source_label,
    rateEffectiveAt: rate.effective_at,
  };
}
