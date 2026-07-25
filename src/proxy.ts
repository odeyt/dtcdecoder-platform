import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";
import { isRecognizedLocaleCode, isLiveLocale, DEFAULT_LOCALE } from "@/lib/i18n/locale-codes";
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
// default/x-default.
//
// Three outcomes (see resolveLocaleRouting):
//  - "rewrite": no locale prefix → internal rewrite to /en/<path>.
//  - "redirect": prefix is a recognized-but-not-yet-built locale (e.g. /fr)
//    → 307 to the de-prefixed English path, so untranslated locales never
//    serve English text under a foreign <html lang> (bad SEO + misleading).
//  - null: nothing to do — a live locale (/en, /es), or an
//    (app)/metadata-route path that must never be prefixed.
type LocaleRouting = { kind: "rewrite" | "redirect"; url: URL };

function resolveLocaleRouting(request: NextRequest): LocaleRouting | null {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";

  if (PASSTHROUGH_TOP_LEVEL_SEGMENTS.has(firstSegment)) return null;

  if (firstSegment && isRecognizedLocaleCode(firstSegment)) {
    if (isLiveLocale(firstSegment)) return null;

    // Recognized but not translated yet — strip the prefix and redirect to
    // the English (unprefixed) equivalent. Temporary (307) so the redirect
    // is not cached permanently once the locale eventually goes live.
    const stripped = pathname.slice(firstSegment.length + 1);
    const url = request.nextUrl.clone();
    url.pathname = stripped === "" ? "/" : stripped;
    return { kind: "redirect", url };
  }

  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return { kind: "rewrite", url };
}

// This refreshes the Supabase auth session cookie on every request so
// Server Components always see an up-to-date session, and (new) resolves
// the locale rewrite above.
export async function proxy(request: NextRequest) {
  const routing = resolveLocaleRouting(request);

  // Untranslated-locale prefixes short-circuit to a redirect before the
  // Supabase session refresh — these are rare (bots/old links), render no
  // app tree, and need no auth cookie work.
  if (routing?.kind === "redirect") {
    return NextResponse.redirect(routing.url, 307);
  }

  const rewriteTarget = routing?.kind === "rewrite" ? routing.url : null;

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
