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

// 'unsafe-inline' (not a nonce) is deliberate here — a nonce-based CSP
// requires forcing every page into dynamic rendering (see Next's own CSP
// guide), which would gut the static generation this app relies on for its
// SEO content tree (see src/app/[locale]/layout.tsx's generateStaticParams
// comment). This app has no known legitimate iframe-embedding use case
// (frame-ancestors 'none'), no client-side calls to Anthropic or Creem
// (checkout is a top-level redirect to Creem's hosted page, never fetched
// cross-origin), and its only real cross-origin dependency is Supabase
// (auth + Storage), so connect-src/img-src stay narrowly scoped to that.
const isDev = process.env.NODE_ENV === "development";
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://*.supabase.co",
  "font-src 'self'",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
];

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  // 2 years, matches the MDN-recommended value in Next's own docs. Safe —
  // the site (and every env it's ever served from) is HTTPS-only on Vercel.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
