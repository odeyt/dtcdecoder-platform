import type { CapacitorConfig } from "@capacitor/cli";

// This app is a fully server-rendered Next.js 16 app (API routes, Edge
// middleware, server actions) — it can't be statically exported into
// webDir the way a typical Capacitor app bundles its web assets. Instead
// the native shell loads the live production deployment directly.
// See docs/CAPACITOR_NATIVE_APP_READINESS_AUDIT.md for the full readiness
// review and remaining blockers before an actual store submission.
const config: CapacitorConfig = {
  appId: "com.dtcdecoder.app",
  appName: "DTCDecoder",
  // Required to exist on disk by `cap add`/`cap sync`, but never loaded —
  // server.url below takes priority. See capacitor-www/index.html.
  webDir: "capacitor-www",
  server: {
    url: "https://dtcdecoder.com",
    // Matches the app's own HTTPS-only posture (see next.config.ts's HSTS
    // header) — never allow plaintext http:// loads.
    cleartext: false,
    androidScheme: "https",
    // Without this, Capacitor's default WebViewClient hands any
    // cross-origin navigation off to the system browser instead of loading
    // it in-app — confirmed empirically on an emulator (adb logcat showed
    // capturedLink=https://creem.io/checkout/... opening as a separate
    // com.android.chrome task) when tapping the pricing page's checkout
    // CTA (SubscribeButton.tsx does a plain `window.location.href =
    // checkoutUrl`, which is exactly what triggers this). Creem's hosted
    // checkout — the only real cross-origin destination this app ever
    // navigates to — needs to stay in-app for checkout to feel native.
    // See docs/CAPACITOR_NATIVE_APP_READINESS_AUDIT.md finding #5. Return
    // navigation after checkout still lands in-app fine since it redirects
    // back to dtcdecoder.com, server.url's own origin.
    allowNavigation: ["creem.io", "*.creem.io"],
  },
};

export default config;
