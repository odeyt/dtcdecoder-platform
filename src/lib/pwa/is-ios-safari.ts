"use client";

// iOS Safari never fires `beforeinstallprompt` — this is the only signal
// available to offer an "Add to Home Screen" instruction instead of a real
// one-tap install button. Shared by InstallPrompt.tsx and
// InstallAppButton.tsx.
export function isIosSafari(): boolean {
  const ua = window.navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isStandaloneAlready = (window.navigator as { standalone?: boolean }).standalone === true;
  return isIos && !isStandaloneAlready;
}
