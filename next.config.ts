import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Used ONLY for the message-catalog/formatting layer (useTranslations,
// number/date formatting) — locale resolution itself is owned end-to-end by
// src/proxy.ts + the [locale] route segment, not next-intl's own routing
// middleware (this app already has one proxy doing Supabase auth-cookie
// refresh, and Next.js allows exactly one). src/i18n/request.ts reads the
// already-resolved locale via setRequestLocale()/requestLocale rather than
// re-deriving it.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage public URLs are served from
    // https://<project-ref>.supabase.co/storage/v1/object/public/...
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
