"use client";

import { useEffect } from "react";

// Registers the app-shell/offline service worker (public/sw.js) — see that
// file's header comment for the exact caching policy (nothing under /api/,
// nothing cross-origin, ever). Production-only: a stale registration from
// `next dev`'s frequently-rebuilt assets is more likely to confuse local
// development than help it.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[pwa] service worker registration failed", err);
    });
  }, []);

  return null;
}
