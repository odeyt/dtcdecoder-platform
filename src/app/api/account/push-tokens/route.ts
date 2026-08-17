import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";

// Registers/unregisters a device's FCM token (push_notification_tokens,
// migration 0052) for the signed-in user — called silently in the
// background by src/components/capacitor/PushNotifications.tsx's
// "registration" listener, never from a visible form, so error messages
// here are developer-facing (logged), not translated UI copy shown to a
// user — unlike most other account routes in this codebase.
//
// Writes go through the service-role client, matching every other
// user-scoped table in this schema (user_preferences, search_history):
// RLS grants owner-read only, all writes are server-route-gated.

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["android", "ios"]),
});

export async function POST(request: NextRequest) {
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t.signInRequired }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }

  const admin = createAdminClient();
  // Upsert on token (globally unique per FCM app-install, not per user —
  // see migration 0052's comment) so a token that moves to a different
  // signed-in user (shared device, sign-out/sign-in-as-someone-else) is
  // correctly reassigned rather than left duplicated under the old owner.
  const { error } = await admin.from("push_notification_tokens").upsert(
    {
      user_id: user.id,
      token: parsed.data.token,
      platform: parsed.data.platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) {
    console.error("[push-tokens] upsert failed", user.id, error);
    return NextResponse.json({ error: t.genericError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

const unregisterSchema = z.object({
  token: z.string().min(1),
});

export async function DELETE(request: NextRequest) {
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t.signInRequired }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
  }

  const parsed = unregisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }

  const admin = createAdminClient();
  // Scoped to this user's own token — never lets one signed-in user delete
  // another's row even if they somehow guessed a token value.
  const { error } = await admin
    .from("push_notification_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", parsed.data.token);

  if (error) {
    console.error("[push-tokens] delete failed", user.id, error);
    return NextResponse.json({ error: t.genericError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
