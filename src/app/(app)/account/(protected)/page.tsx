import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getUsageSummary } from "@/lib/ai/assistant";
import { UsageMeter } from "@/components/UsageMeter";
import { UpgradeCard } from "@/components/UpgradeCard";

const PLAN_LABEL = {
  free: "Free",
  pro: "Pro Technician",
  workshop: "Workshop",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout above already redirects if there's no user, so this is just
  // satisfying the type — user is guaranteed here at runtime.
  const plan = user ? await getEffectivePlan(user.id, user.email ?? null) : "free";
  const usage = user ? await getUsageSummary(user.id, plan) : null;
  const nearLimit = usage ? usage.used / usage.limit >= 0.8 : false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">My Account</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{user?.email}</p>
      </div>

      <div className="glass-panel rounded-[var(--radius-xl)] p-6">
        <p className="text-sm text-[var(--text-secondary)]">Current plan</p>
        <p className="mt-1 text-xl font-bold text-[var(--text-primary)]">{PLAN_LABEL[plan]}</p>
        {plan === "free" && (
          <Link
            href="/pricing"
            className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Upgrade to Pro
          </Link>
        )}
      </div>

      {usage && <UsageMeter summary={usage} planLabel={PLAN_LABEL[plan]} />}

      {nearLimit && plan === "free" && (
        <UpgradeCard reason="You're close to today's Free plan AI limit. Pro gives you a much larger monthly allowance." />
      )}

      <div className="flex gap-6 text-sm">
        <Link href="/ai-assistant" className="text-[var(--accent-red)] underline">
          Go to the AI Diagnostic Assistant
        </Link>
        <Link href="/history" className="text-[var(--accent-red)] underline">
          View search history
        </Link>
      </div>
    </div>
  );
}
