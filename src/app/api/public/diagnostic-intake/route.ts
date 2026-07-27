import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { ANON_SEARCH_ID_COOKIE } from "@/lib/basic-search/constants";
import { processPublicIntake } from "@/lib/landing-intake/engine";
import { IntakeSchema } from "@/lib/landing-intake/schema";
import type { BasicSearchIdentity } from "@/lib/basic-search/usage";

// The ONLY unauthenticated diagnostic endpoint in this app. Deterministic
// only — processPublicIntake never calls a paid AI provider (see that
// module's own header). Deliberately kept separate from every protected
// scan-diagnostics/ai route so a public-endpoint bug can never reach paid
// provider logic. See docs/LANDING_DIAGNOSTIC_INTAKE.md.

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  intake: IntakeSchema,
});

// Bounded by the intake state machine's own step count, not a dedicated
// per-IP ledger (see docs/LANDING_DIAGNOSTIC_INTAKE.md "Abuse bound"):
// every path through processPublicIntake reaches either the rate-limited
// DTC lookup step or the "sign_in_required" terminal state within a small,
// fixed number of round trips, so there's no cheap infinite-loop surface
// even without a dedicated rate limiter here. The one real cost-relevant
// action (the DTC lookup itself) is already gated by the existing
// basic-search allowance below.
async function resolveIntakeIdentity(): Promise<{
  identity: BasicSearchIdentity;
  plan: Awaited<ReturnType<typeof getEffectivePlan>>;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const plan = await getEffectivePlan(user.id, user.email ?? null);
    return { identity: { type: "user", id: user.id }, plan };
  }

  const cookieStore = await cookies();
  const anonId = cookieStore.get(ANON_SEARCH_ID_COOKIE)?.value;
  return { identity: { type: "anon", id: anonId ?? crypto.randomUUID() }, plan: "free" };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid intake request" }, { status: 400 });
  }

  try {
    const { identity, plan } = await resolveIntakeIdentity();
    const result = await processPublicIntake({
      message: parsed.data.message,
      intake: parsed.data.intake,
      identity,
      plan,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[public-diagnostic-intake] failed", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
