// Next.js only inlines `NEXT_PUBLIC_*` vars into the browser bundle when it
// sees the literal static form `process.env.VAR_NAME` — a dynamic/computed
// lookup like `process.env[name]` can't be statically analyzed, so it's left
// as real runtime code, and `process` doesn't exist in the browser at all.
// Every accessor below must reference `process.env.X` directly (not through
// a shared helper taking a variable name) so client components keep working.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  supabaseServiceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  billingEnabled: () => process.env.NEXT_PUBLIC_BILLING_ENABLED === "true",

  creemApiBaseUrl: () =>
    process.env.CREEM_API_BASE_URL ?? "https://api.creem.io/v1",
  creemApiKey: () => required("CREEM_API_KEY", process.env.CREEM_API_KEY),
  creemWebhookSecret: () =>
    required("CREEM_WEBHOOK_SECRET", process.env.CREEM_WEBHOOK_SECRET),
  creemSuccessUrl: () =>
    required("CREEM_SUCCESS_URL", process.env.CREEM_SUCCESS_URL),
  creemProProductId: () =>
    required("CREEM_PRO_PRODUCT_ID", process.env.CREEM_PRO_PRODUCT_ID),
  creemWorkshopProductId: () =>
    required("CREEM_WORKSHOP_PRODUCT_ID", process.env.CREEM_WORKSHOP_PRODUCT_ID),
  creemProProductIdOptional: () => process.env.CREEM_PRO_PRODUCT_ID,
  creemWorkshopProductIdOptional: () => process.env.CREEM_WORKSHOP_PRODUCT_ID,
  creemProYearlyProductId: () =>
    required("CREEM_PRO_YEARLY_PRODUCT_ID", process.env.CREEM_PRO_YEARLY_PRODUCT_ID),
  creemWorkshopYearlyProductId: () =>
    required(
      "CREEM_WORKSHOP_YEARLY_PRODUCT_ID",
      process.env.CREEM_WORKSHOP_YEARLY_PRODUCT_ID,
    ),
  // Non-throwing variants for code that must keep working (e.g. the webhook,
  // which processes every event regardless of interval) even before the
  // yearly Creem products are configured.
  creemProYearlyProductIdOptional: () => process.env.CREEM_PRO_YEARLY_PRODUCT_ID,
  creemWorkshopYearlyProductIdOptional: () => process.env.CREEM_WORKSHOP_YEARLY_PRODUCT_ID,

  anthropicApiKey: () =>
    required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),

  adminAllowedEmails: () =>
    (process.env.ADMIN_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),

  storageBucketPreviews: () =>
    process.env.SUPABASE_STORAGE_BUCKET_PREVIEWS ?? "product-previews",

  // Diagnostic Scan Report Analysis — flagged off by default (see
  // NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED below) until go-live.
  scanFilesBucket: () =>
    process.env.SUPABASE_STORAGE_BUCKET_SCAN_FILES ?? "diagnostic-scan-files",
  scanFileMaxSizeBytes: () =>
    Number(process.env.SCAN_FILE_MAX_SIZE_BYTES ?? 15 * 1024 * 1024),
  // Must stay `process.env.NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED` as a
  // static literal (not routed through a shared helper) so Next.js can
  // inline it into client bundles — see the file-header comment and
  // billingEnabled() above for the same requirement.
  scanDiagnosticsEnabled: () =>
    process.env.NEXT_PUBLIC_SCAN_DIAGNOSTICS_ENABLED === "true",
};
