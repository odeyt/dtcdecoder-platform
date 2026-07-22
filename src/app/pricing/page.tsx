import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SubscribeButton } from "@/components/SubscribeButton";

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
          Start free. Upgrade when you need unlimited AI diagnostics.
        </p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        <PlanCard title="Free" price="$0">
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>Basic DTC lookup</li>
            <li>Limited AI searches</li>
            <li>Public repair tips</li>
          </ul>
          <Link
            href={signedIn ? "/dtc" : "/account/login"}
            className="mt-6 block rounded-full border border-white/20 px-6 py-3 text-center font-semibold text-white transition hover:bg-white/10"
          >
            Start Free
          </Link>
        </PlanCard>

        <PlanCard title="Pro Technician" price="$19/mo" highlighted>
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>Unlimited AI DTC searches</li>
            <li>Advanced diagnostic workflows</li>
            <li>Premium PDF access</li>
            <li>OEM-style test procedures</li>
          </ul>
          <div className="mt-6">
            <SubscribeButton plan="pro" label="Upgrade to Pro" signedIn={signedIn} />
          </div>
        </PlanCard>

        <PlanCard title="Workshop" price="$49/mo">
          <ul className="space-y-2 text-sm text-zinc-300">
            <li>Multiple technician accounts</li>
            <li>Saved customer cases</li>
            <li>Repair notes</li>
            <li>Priority diagnostic support</li>
          </ul>
          <div className="mt-6">
            <SubscribeButton plan="workshop" label="Workshop Access" signedIn={signedIn} />
          </div>
        </PlanCard>
      </div>
    </div>
  );
}

function PlanCard({
  title,
  price,
  highlighted,
  children,
}: {
  title: string;
  price: string;
  highlighted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 backdrop-blur-md ${
        highlighted
          ? "border-red-500/40 bg-gradient-to-b from-red-600/10 to-transparent shadow-[0_0_30px_rgba(255,30,45,0.15)]"
          : "border-white/10 bg-white/5"
      }`}
    >
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <p className="mt-1 text-2xl font-bold text-red-400">{price}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
