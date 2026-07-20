function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  billingEnabled: () => process.env.NEXT_PUBLIC_BILLING_ENABLED === "true",

  creemApiBaseUrl: () =>
    process.env.CREEM_API_BASE_URL ?? "https://api.creem.io/v1",
  creemApiKey: () => required("CREEM_API_KEY"),
  creemWebhookSecret: () => required("CREEM_WEBHOOK_SECRET"),
  creemSuccessUrl: () => required("CREEM_SUCCESS_URL"),
  creemGenericProductId: () => required("CREEM_GENERIC_PRODUCT_ID"),

  adminAllowedEmails: () =>
    (process.env.ADMIN_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),

  storageBucketFiles: () =>
    process.env.SUPABASE_STORAGE_BUCKET_FILES ?? "product-files",
  storageBucketPreviews: () =>
    process.env.SUPABASE_STORAGE_BUCKET_PREVIEWS ?? "product-previews",
};
