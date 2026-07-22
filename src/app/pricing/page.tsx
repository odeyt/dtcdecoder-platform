import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PricingPlans } from "@/components/PricingPlans";

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

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Pricing</h1>
        <p className="mt-2 text-zinc-400">
          Start free. Upgrade for a much larger monthly AI allowance.
        </p>
      </div>

      <div className="mt-12">
        <PricingPlans signedIn={signedIn} />
      </div>
    </div>
  );
}
