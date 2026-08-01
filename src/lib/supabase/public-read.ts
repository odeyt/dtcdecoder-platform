import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Anon-key client for reading tables that carry an explicit
// `... for select using (true)` public-read RLS policy (today: `languages`
// and `currencies`, migration 0006).
//
// Deliberately distinct from the two existing clients:
//
// - `@/lib/supabase/server` (`createClient`) reads `cookies()`, which opts
//   the calling route into dynamic rendering. That makes it unusable from
//   `generateMetadata` on a statically prerendered page — which is exactly
//   where the locale registry is read.
// - `@/lib/supabase/admin` (`createAdminClient`) bypasses RLS with the
//   service-role key. Using it for a table anyone may read grants far more
//   authority than the read needs, and forces every environment that
//   merely *builds* the app to hold a full-database credential.
//
// This client holds no session and sends no cookies, so it is safe to call
// during static prerendering. It only ever sees rows a public-read policy
// already exposes.
export function createPublicReadClient() {
  return createSupabaseClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
