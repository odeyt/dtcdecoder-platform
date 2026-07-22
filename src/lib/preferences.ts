import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserPreferences } from "@/lib/types";

// Defaults shown when a user (any plan) has no saved row yet — matches the
// product-specified defaults exactly (English/English/none/off/USD/metric/
// Celsius/24h). Free-plan users always see these defaults rendered as
// locked previews, never a real saved row, since they can't save one.
export const DEFAULT_PREFERENCES: Omit<UserPreferences, "user_id" | "created_at" | "updated_at"> = {
  interface_locale: "en",
  ai_report_locale: null,
  secondary_report_locale: null,
  report_mode: "single",
  preferred_currency: "USD",
  region_code: null,
  measurement_system: "metric",
  temperature_unit: "celsius",
  time_format: "24h",
  timezone: null,
  date_format: null,
};

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}
