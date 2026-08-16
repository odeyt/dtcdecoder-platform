"use client";

import { useEffect } from "react";

// Single mount point for Android App Links handling inside the Capacitor
// shell — included once in each root layout (src/app/(app)/layout.tsx and
// src/app/[locale]/layout.tsx), the same pattern PwaShell already uses.
// Renders nothing itself.
//
// Why this exists: the WebView's own AndroidManifest.xml intent-filter
// (autoVerify, scoped to /account/auth/callback — see
// docs/CAPACITOR_ANDROID_SETUP.md) makes Android hand a tapped magic-link
// email URL to this app instead of the system browser, but Capacitor does
// not automatically navigate a *remote* (server.url-configured) WebView to
// that incoming URL on its own — only bundled-webDir apps get that for
// free. `@capacitor/app`'s `appUrlOpen` event carries the URL; a full
// `window.location.href` navigation (not client-side router.push) is
// required here because /account/auth/callback is a server route handler
// that exchanges the Supabase auth code and sets cookies — the same
// navigation a real browser would perform for a tapped link.
export function CapacitorAppLinks() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    // Dynamically imported: this module touches the native bridge, which
    // doesn't exist for the plain mobile-web/PWA audience this same layout
    // also serves — importing it unconditionally would be dead weight (and
    // on unsupported platforms Capacitor's web shim would silently no-op
    // anyway, but there's no reason to ship the extra JS to every visitor).
    import("@capacitor/core").then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;

      const { App } = await import("@capacitor/app");
      const handle = await App.addListener("appUrlOpen", (event) => {
        window.location.href = event.url;
      });
      cleanup = () => {
        handle.remove();
      };
    });

    return () => cleanup?.();
  }, []);

  return null;
}
