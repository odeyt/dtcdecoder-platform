import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Subscription, SubscriptionPlan } from "@/lib/types";
import type { BillingInterval } from "@/lib/pricing";

// Resolves a user's effective plan. Looks up by user_id first (the normal
// case once signed in), falling back to email — covers the same guest-then-
// magic-link timing gap the old order flow handled via linkOrdersToUser.
export async function getEffectivePlan(
  userId: string,
  email: string | null,
): Promise<SubscriptionPlan> {
  const supabase = createAdminClient();

  const { data: byUser, error: byUserError } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (byUserError) throw byUserError;
  if (byUser) return byUser.plan;

  if (email) {
    const { data: byEmail, error: byEmailError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("email", email.toLowerCase())
      .eq("status", "active")
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (byEmailError) throw byEmailError;
    if (byEmail) return byEmail.plan;
  }

  return "free";
}

export async function getSubscriptionByCreemId(
  creemSubscriptionId: string,
): Promise<Subscription | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("creem_subscription_id", creemSubscriptionId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface WebhookSubscriptionUpdate {
  creemSubscriptionId: string;
  creemCustomerId: string;
  email: string;
  userId: string | null;
  plan: SubscriptionPlan;
  interval: BillingInterval;
  status: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
}

// Forward-only state transitions: webhook delivery order isn't guaranteed,
// so a delayed `canceled` arriving after a fresher `paid` must not re-kill
// an active subscription. Guarded by comparing current_period_end — if the
// incoming event references an older period than what's already stored,
// it's stale and is ignored rather than applied.
export async function upsertSubscriptionFromWebhook(
  update: WebhookSubscriptionUpdate,
): Promise<void> {
  const supabase = createAdminClient();
  const existing = await getSubscriptionByCreemId(update.creemSubscriptionId);

  if (
    existing?.current_period_end &&
    update.currentPeriodEnd &&
    new Date(update.currentPeriodEnd) < new Date(existing.current_period_end)
  ) {
    return; // stale event — a newer period is already on record
  }

  // Never downgrade a known account link to null. Creem propagates the
  // checkout's metadata.user_id onto the subscription it creates, but
  // later lifecycle events for the same subscription (renewals in
  // particular) can arrive without it. Writing `update.userId` blindly
  // meant one metadata-less renewal silently unlinked a paying customer:
  // the row stayed `active`, so billing continued, while getEffectivePlan's
  // user_id lookup stopped matching. It only kept working at all because
  // that function falls back to matching on email — which fails the moment
  // a customer's billing email differs from their login email, at which
  // point they pay full price and receive Free-tier entitlement.
  //
  // The subscription is identified by creem_subscription_id either way, so
  // an absent user_id in an event is missing information, never an
  // instruction to forget who owns the row.
  const userId = update.userId ?? existing?.user_id ?? null;

  if (!update.userId && existing?.user_id) {
    console.warn(
      "[creem] subscription event carried no metadata.user_id; preserving the existing account link",
      update.creemSubscriptionId,
    );
  }

  // Both sides null means nothing has ever linked this subscription to an
  // account. Billing is live and entitlement is not — worth an error-level
  // line, because the only remaining match is the email fallback.
  if (!userId) {
    console.error(
      "[creem] subscription has no account link (no metadata.user_id, none stored) — entitlement depends entirely on the email fallback",
      update.creemSubscriptionId,
    );
  }

  const { error } = await supabase.from("subscriptions").upsert(
    {
      creem_subscription_id: update.creemSubscriptionId,
      creem_customer_id: update.creemCustomerId,
      email: update.email.toLowerCase(),
      user_id: userId,
      plan: update.plan,
      billing_interval: update.interval,
      status: update.status,
      current_period_end: update.currentPeriodEnd,
    },
    { onConflict: "creem_subscription_id" },
  );

  if (error) throw error;
}
