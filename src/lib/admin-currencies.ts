import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Currency } from "@/lib/types";

export async function listAllCurrenciesForAdmin(): Promise<Currency[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface CurrencyUpdateInput {
  enabled: boolean;
  displayOrder: number;
  decimalPlaces: number;
}

export async function updateCurrency(code: string, input: CurrencyUpdateInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("currencies")
    .update({
      enabled: input.enabled,
      display_order: input.displayOrder,
      decimal_places: input.decimalPlaces,
    })
    .eq("code", code);
  if (error) throw error;
}
