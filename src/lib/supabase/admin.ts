import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role client — bypasses RLS entirely. Never import this module from
// a Client Component or expose it to the browser. Only for webhook handlers,
// admin routes, and download-authorization routes after an explicit
// ownership check.
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
