import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAddOnCheckout, isAddOnCheckoutConfigured } from "@/lib/payments/creem";
import { ADD_ON_PACKS } from "@/lib/pricing";
import { env } from "@/lib/env";

// Guest checkout, no password accounts (per CLAUDE.md) — mirrors
// /api/subscribe's pattern. Unlike a subscription, an add-on pack must be
// tied to a real user_id (the credits it grants are useless without an
// account to hold them), so — unlike /api/subscribe — a signed-in session
// is required here, not just an email.
const addonCheckoutSchema = z.object({
  packId: z.enum(ADD_ON_PACKS.map((p) => p.id) as [string, ...string[]]),
});

export async function POST(request: NextRequest) {
  if (!env.billingEnabled()) {
    return NextResponse.json({ error: "Checkout is not available yet" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Sign in to buy an add-on report pack." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = addonCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Explicit "not available yet" rather than letting the request fail
  // deep inside a Creem API call — per the task's own "do not enable
  // checkout until valid Creem product IDs are configured" instruction.
  if (!isAddOnCheckoutConfigured(parsed.data.packId)) {
    return NextResponse.json(
      { error: "Add-on report packs aren't available for purchase yet." },
      { status: 503 },
    );
  }

  try {
    const { checkoutUrl } = await createAddOnCheckout({
      packId: parsed.data.packId,
      email: user.email,
      userId: user.id,
    });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("Add-on checkout creation failed", err);
    return NextResponse.json({ error: "Unable to start checkout right now" }, { status: 500 });
  }
}
