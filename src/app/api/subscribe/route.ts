import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createSubscriptionCheckout } from "@/lib/payments/creem";
import { env } from "@/lib/env";

const subscribeSchema = z.object({
  plan: z.enum(["pro", "workshop"]),
});

export async function POST(request: NextRequest) {
  if (!env.billingEnabled()) {
    return NextResponse.json(
      { error: "Subscriptions are not available yet" },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return NextResponse.json({ error: "Sign in to subscribe" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { checkoutUrl } = await createSubscriptionCheckout({
      plan: parsed.data.plan,
      email: user.email,
      userId: user.id,
    });
    return NextResponse.json({ checkoutUrl });
  } catch (err) {
    console.error("Subscription checkout creation failed", err);
    return NextResponse.json(
      { error: "Unable to start checkout right now" },
      { status: 500 },
    );
  }
}
