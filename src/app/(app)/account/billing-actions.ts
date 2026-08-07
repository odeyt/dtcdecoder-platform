"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAppShellLocale, getAppShellMessages } from "@/lib/i18n/app-shell-locale";
import { getOwnSubscription } from "@/lib/subscriptions";
import { cancelSubscription, resumeSubscription } from "@/lib/payments/creem";

export interface BillingActionResult {
  error?: string;
  success?: boolean;
}

// Neither action takes a subscription id — the target row is always the
// signed-in user's own, resolved server-side via getOwnSubscription. There
// is nothing for a client to spoof.

export async function cancelSubscriptionAction(): Promise<BillingActionResult> {
  const locale = await resolveAppShellLocale();
  // Property-access getAppShellMessages, not next-intl/server's
  // getTranslations — same avoidance as API routes (see
  // src/lib/scan-diagnostics/api-errors.ts), since getTranslations isn't
  // usable in this vitest setup and this file needs unit test coverage.
  const t: Record<string, string> = (await getAppShellMessages(locale)).account;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t.billingSignInRequired };

  const subscription = await getOwnSubscription(user.id, user.email ?? null);
  if (!subscription || !subscription.creem_subscription_id) {
    return { error: t.billingNoActiveSubscription };
  }
  if (subscription.is_comp) return { error: t.billingCompNotice };
  if (subscription.cancel_at_period_end) return { success: true }; // already scheduled — idempotent

  try {
    await cancelSubscription(subscription.creem_subscription_id);
  } catch (err) {
    console.error("[billing] cancelSubscription failed", user.id, err);
    return { error: t.billingCancelFailed };
  }

  // Optimistic local flip — don't make the confirmation UI wait on Creem's
  // webhook round-trip for something the user just did. The webhook
  // (subscription.scheduled_cancel) remains the source of truth and will
  // overwrite this row with the same value moments later.
  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("id", subscription.id);
  if (error) console.error("[billing] local cancel_at_period_end flip failed", subscription.id, error);

  revalidatePath("/account");
  return { success: true };
}

export async function resumeSubscriptionAction(): Promise<BillingActionResult> {
  const locale = await resolveAppShellLocale();
  const t: Record<string, string> = (await getAppShellMessages(locale)).account;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t.billingSignInRequired };

  const subscription = await getOwnSubscription(user.id, user.email ?? null);
  if (!subscription || !subscription.creem_subscription_id) {
    return { error: t.billingNoActiveSubscription };
  }
  if (subscription.is_comp) return { error: t.billingCompNotice };
  if (!subscription.cancel_at_period_end) return { success: true }; // nothing pending — idempotent

  try {
    await resumeSubscription(subscription.creem_subscription_id);
  } catch (err) {
    console.error("[billing] resumeSubscription failed", user.id, err);
    return { error: t.billingResumeFailed };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: false })
    .eq("id", subscription.id);
  if (error) console.error("[billing] local cancel_at_period_end clear failed", subscription.id, error);

  revalidatePath("/account");
  return { success: true };
}
