import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { getUsageSummary } from "@/lib/ai/assistant";
import { PricingPlans } from "@/components/PricingPlans";
import { UsageMeter } from "@/components/UsageMeter";

const PLAN_LABEL = { free: "Free", pro: "Pro Technician", workshop: "Workshop" };

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free, Pro Technician, and Workshop plans for DTC Decoder.",
};

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = Boolean(user);

  const plan = user ? await getEffectivePlan(user.id, user.email ?? null) : null;
  const usage = user && plan ? await getUsageSummary(user.id, plan) : null;

  return (
    <div className="container-app px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">Pricing</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Start free. Upgrade for a much larger monthly AI allowance.
        </p>
      </div>

      {plan && usage && (
        <div className="mx-auto mt-8 max-w-sm">
          <p className="text-center text-sm text-[var(--text-secondary)]">
            You&apos;re on the <span className="text-[var(--text-primary)]">{PLAN_LABEL[plan]}</span> plan
          </p>
          <div className="mt-3">
            <UsageMeter summary={usage} planLabel={PLAN_LABEL[plan]} />
          </div>
        </div>
      )}

      <div className="mt-12">
        <PricingPlans signedIn={signedIn} />
      </div>
    </div>
  );
}
