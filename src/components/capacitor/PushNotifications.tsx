"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Single mount point for push notification registration inside the
// Capacitor shell — included once in each root layout, the same pattern
// CapacitorAppLinks.tsx already uses. Renders nothing itself.
//
// No-ops entirely on the plain mobile-web/PWA audience (Capacitor isn't
// present) and does nothing server-side until a real Firebase project
// exists (see src/lib/push/fcm.ts, env.ts's pushNotificationsEnabled) —
// requesting the OS permission and calling register() here is still safe
// even before that, it just means no token ever successfully registers.
//
// Registration is gated on being signed in — there's no user to attach an
// anonymous device's token to otherwise, and asking for the notification
// permission before there's an account to justify it is worse UX than
// asking right after sign-in. Re-registers on every auth-state change
// (not just once at mount, matching DtcTechnicianShell.tsx's getUser() +
// onAuthStateChange pattern) — this also correctly re-attaches a shared
// device's token to whichever user is *currently* signed in, since
// POST /api/account/push-tokens upserts on token (globally unique per
// FCM app-install), not on user_id.
export function PushNotifications() {
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    import("@capacitor/core").then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform() || cancelled) return;

      const { PushNotifications: PushNotificationsPlugin } = await import(
        "@capacitor/push-notifications"
      );

      const registrationHandle = await PushNotificationsPlugin.addListener(
        "registration",
        (token) => {
          fetch("/api/account/push-tokens", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
          }).catch(() => {
            // Best-effort — a failed registration just means no push until
            // the next successful app launch/sign-in tries again.
          });
        },
      );

      const errorHandle = await PushNotificationsPlugin.addListener(
        "registrationError",
        (err) => {
          console.error("[push] registration error", err);
        },
      );

      // Tapping a delivered notification — data.url (set by
      // sendPushNotificationToUser's payload, e.g. a report's own
      // /diagnostics/<caseId> path) navigates the WebView there. Doesn't
      // need sign-in, live regardless.
      const actionHandle = await PushNotificationsPlugin.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const url = action.notification.data?.url;
          if (typeof url === "string" && url.startsWith("/")) {
            window.location.href = url;
          }
        },
      );

      cleanup = () => {
        registrationHandle.remove();
        errorHandle.remove();
        actionHandle.remove();
      };

      async function registerIfSignedIn(signedIn: boolean) {
        if (!signedIn) return;
        const permStatus = await PushNotificationsPlugin.checkPermissions();
        let granted = permStatus.receive === "granted";
        if (permStatus.receive === "prompt") {
          const requested = await PushNotificationsPlugin.requestPermissions();
          granted = requested.receive === "granted";
        }
        if (granted) {
          await PushNotificationsPlugin.register();
        }
      }

      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      await registerIfSignedIn(Boolean(userData.user));

      const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
        registerIfSignedIn(Boolean(session?.user));
      });

      const previousCleanup = cleanup;
      cleanup = () => {
        previousCleanup?.();
        authListener.subscription.unsubscribe();
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return null;
}
