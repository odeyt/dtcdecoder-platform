import "server-only";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

// Best-effort push delivery — mirrors src/lib/analytics/events.ts's
// recordEvent() convention (never throws, logs and swallows) so a
// notification failure can never fail the API response that triggered it.
// No-ops entirely until FIREBASE_SERVICE_ACCOUNT_JSON is set (see env.ts),
// matching this repo's "flags default off for anything not fully wired up"
// rule — safe to call from anywhere before a real Firebase project exists.

let cachedMessaging: import("firebase-admin/messaging").Messaging | null = null;

async function getMessaging() {
  if (cachedMessaging) return cachedMessaging;

  const raw = env.firebaseServiceAccountJson();
  if (!raw) return null;

  const { initializeApp, cert, getApps } = await import("firebase-admin/app");
  const { getMessaging: getMessagingModule } = await import("firebase-admin/messaging");

  const serviceAccount = JSON.parse(raw);
  const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(serviceAccount) });
  cachedMessaging = getMessagingModule(app);
  return cachedMessaging;
}

export type PushNotificationPayload = {
  title: string;
  body: string;
  // Delivered as FCM "data" fields (all values must be strings) — read by
  // the client's pushNotificationActionPerformed listener (see
  // src/components/capacitor/PushNotifications.tsx) to route a tap to the
  // right screen, e.g. { url: "/diagnostics/<caseId>" }.
  data?: Record<string, string>;
};

// Sends to every registered device for a user (see push_notification_tokens,
// migration 0052) and prunes tokens FCM reports as no-longer-registered —
// the standard, documented FCM cleanup pattern for uninstalled/reinstalled
// apps, not specific to this feature.
export async function sendPushNotificationToUser(
  userId: string,
  payload: PushNotificationPayload,
): Promise<void> {
  try {
    const messaging = await getMessaging();
    if (!messaging) return; // Not configured yet — silent no-op.

    const admin = createAdminClient();
    const { data: tokenRows, error } = await admin
      .from("push_notification_tokens")
      .select("id, token")
      .eq("user_id", userId);

    if (error || !tokenRows || tokenRows.length === 0) return;

    const staleTokenIds: string[] = [];

    await Promise.all(
      tokenRows.map(async (row) => {
        try {
          await messaging.send({
            token: row.token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data,
          });
        } catch (err) {
          const code = (err as { code?: string })?.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            staleTokenIds.push(row.id);
          } else {
            console.error("[push] send failed", userId, code ?? err);
          }
        }
      }),
    );

    if (staleTokenIds.length > 0) {
      await admin.from("push_notification_tokens").delete().in("id", staleTokenIds);
    }
  } catch (err) {
    console.error("[push] sendPushNotificationToUser failed", userId, err);
  }
}
