import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createSubscriptionCheckout } from "@/lib/payments/creem";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { env } from "@/lib/env";

// Guest checkout, no password accounts (per CLAUDE.md): a signed-in user
// checks out on their own session's email/id, but signing in first is not
// required — a visitor can subscribe by supplying an email directly,
// mirroring this app's stated one-time-purchase checkout design. If the
// email later matches a signed-in account (via magic-link), that account's
// plan resolves correctly regardless, since getEffectivePlan() already
// falls back to email when user_id isn't set on the subscription row.
const subscribeSchema = z.object({
  plan: z.enum(["pro", "workshop"]),
  interval: z.enum(["monthly", "yearly"]).default("yearly"),
  email: z.string().trim().toLowerCase().email().optional(),
});

export async function POST(request: NextRequest) {
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).apiErrors;

  if (!env.billingEnabled()) {
    return NextResponse.json(
      { error: t.subscriptionsNotAvailable },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t.invalidRequestBody }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: t.invalidRequest }, { status: 400 });
  }

  // Signed-in session's email always wins over a client-supplied one (never
  // trust the body over a verified session) — the body's email only matters
  // for a genuinely signed-out guest checkout.
  const email = user?.email ?? parsed.data.email;
  if (!email) {
    return NextResponse.json({ error: t.enterEmailToContinue }, { status: 400 });
  }

  try {
    const { checkoutUrl } = await createSubscriptionCheckout({
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      email,
      userId: user?.id,
    });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("Subscription checkout creation failed", err);
    return NextResponse.json(
      { error: t.unableToStartCheckout },
      { status: 500 },
    );
  }
}
