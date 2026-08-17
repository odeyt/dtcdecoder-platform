import { NextResponse } from "next/server";

// Served as a route handler rather than a public/.well-known/assetlinks.json
// static file — Vercel's static-asset pipeline does not reliably serve
// dot-prefixed directories under public/ (confirmed empirically: the file
// served correctly in local `next dev` but 404'd once deployed), while a
// route handler goes through Next's own routing layer instead of raw
// static-file hosting, sidestepping that entirely.
//
// Declares this Capacitor Android app authorized to handle dtcdecoder.com
// App Links — see docs/CAPACITOR_ANDROID_SETUP.md's App Links section.
// sha256_cert_fingerprints is the *debug* keystore's fingerprint today
// (auto-generated per build machine by Gradle) — add (not replace) a real
// release-keystore fingerprint here once one exists for Play Store
// submission, since this array can hold multiple authorized signers.
export async function GET() {
  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.dtcdecoder.app",
          sha256_cert_fingerprints: [
            "31:23:2B:CA:2F:0A:49:18:8E:42:14:D1:F6:60:96:16:25:F4:44:95:C0:CC:2B:6E:EA:CD:2B:D4:CF:E0:9F:65",
          ],
        },
      },
    ],
    {
      headers: {
        // Digital Asset Links spec expects this content type verbatim.
        "Content-Type": "application/json",
      },
    },
  );
}
