import { NextResponse } from "next/server";

// iOS Universal Links equivalent of Android's assetlinks.json (see
// src/app/.well-known/assetlinks.json/route.ts and
// docs/CAPACITOR_NATIVE_APP_READINESS_AUDIT.md finding #3) — declares which
// paths on this domain a native iOS app is authorized to open directly
// instead of Safari. A route handler, not a public/ static file, for the
// same reason as assetlinks.json: Vercel's static-asset pipeline doesn't
// reliably serve dot-prefixed paths under public/, confirmed empirically
// for the Android file.
//
// UNVERIFIED / NOT YET FUNCTIONAL — appID below is a placeholder. There is
// no Apple Developer account or iOS Capacitor project yet (this repo has
// only been built and tested on Android — iOS development requires Xcode,
// which needs a Mac). Before this does anything real:
//   1. Replace "TEAMID_PLACEHOLDER" with the actual 10-character Apple
//      Developer Team ID once an account exists.
//   2. Run `npx cap add ios` (on a Mac) and add the "Associated Domains"
//      capability with `applinks:dtcdecoder.com` in Xcode's Signing &
//      Capabilities tab — this generates the matching entitlements file
//      that makes iOS actually trust this response.
//   3. Verify with Apple's own validator:
//      https://search.developer.apple.com/appsearch-validation-tool/
//
// Scoped to just the magic-link sign-in callback (not the whole domain),
// matching the Android intent-filter's scoping rationale: ordinary shared
// dtcdecoder.com links (blog posts, DTC pages) should keep opening in
// Safari, not always hijack into the app.
export async function GET() {
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: "TEAMID_PLACEHOLDER.com.dtcdecoder.app",
            paths: ["/account/auth/callback*"],
          },
        ],
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}
