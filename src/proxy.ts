import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { isRecognizedLocaleCode, DEFAULT_LOCALE } from "@/lib/i18n/locale-codes";
import { APP_SHELL_TOP_LEVEL_SEGMENTS } from "@/lib/i18n/app-shell-routes";

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).

// Metadata routes and the (app) route group never get a locale prefix —
// see src/lib/i18n/app-shell-routes.ts and the multilingual rollout plan.
const PASSTHROUGH_TOP_LEVEL_SEGMENTS = new Set([
  ...APP_SHELL_TOP_LEVEL_SEGMENTS,
  "robots.txt",
  "sitemap.xml",
]);

// Public/SEO content (homepage, /dtc, /[make]/[slug], /blog) lives nested
// under src/app/[locale]/ so it can vary <html lang/dir> per locale. A
// request without a recognized locale prefix is rewritten (never
// redirected) to /en/<path> internally, so today's live bare URLs
// (/dtc/p0420, /land-rover/p2263) keep resolving unchanged for existing
// bookmarks/backlinks/search-engine indexing — English is the unprefixed
// default/x-default. Returns null when no rewrite is needed (already
// locale-prefixed, or an (app)/metadata-route path that must never be).
function resolveLocaleRewrite(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";

  if (PASSTHROUGH_TOP_LEVEL_SEGMENTS.has(firstSegment)) return null;
  if (firstSegment && isRecognizedLocaleCode(firstSegment)) return null;

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return url;
}

// This refreshes the Supabase auth session cookie on every request so
// Server Components always see an up-to-date session, and (new) resolves
// the locale rewrite above.
export async function proxy(request: NextRequest) {
  const rewriteTarget = resolveLocaleRewrite(request);

  // Single source of truth for the response shape, used both for the
  // initial assignment and every time the Supabase cookie refresh below
  // rebuilds `response`. A naive `NextResponse.next({request})` inside
  // `setAll` would silently discard the locale rewrite on any request that
  // also refreshes a session cookie (e.g. a first anonymous visit, or a
  // near-expiry token) — exactly the request class this rewrite matters
  // most for.
  const buildResponse = () =>
    rewriteTarget
      ? NextResponse.rewrite(rewriteTarget, { request })
      : NextResponse.next({ request });

  let response = buildResponse();

  const supabase = createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = buildResponse();
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
