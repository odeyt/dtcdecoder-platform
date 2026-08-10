"use client";

// Single shared capture of the browser's `beforeinstallprompt` event —
// external store (not React state) so multiple independent UI surfaces
// (the dismissible toast in InstallPrompt.tsx, the persistent nav button in
// InstallAppButton.tsx) react to the exact same event instance via
// useSyncExternalStore, rather than each registering its own listener and
// holding its own copy. A captured BeforeInstallPromptEvent can only be
// `.prompt()`ed once — sharing one instance (and clearing it after use)
// keeps every consumer in sync automatically.

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function getServerSnapshot(): BeforeInstallPromptEvent | null {
  return null;
}

// Resolves to the real outcome, or null if there was nothing to prompt
// (already consumed by another surface, or the browser never offered it —
// e.g. already installed, or a platform without this API at all).
export async function promptInstall(): Promise<"accepted" | "dismissed" | null> {
  const event = deferredPrompt;
  if (!event) return null;
  await event.prompt();
  const { outcome } = await event.userChoice;
  deferredPrompt = null;
  notify();
  return outcome;
}
