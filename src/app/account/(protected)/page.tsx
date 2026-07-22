import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";

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

  return (
    <div>
      <h1 className="text-2xl font-bold text-white">My Account</h1>
      <p className="mt-2 text-zinc-400">{user?.email}</p>

      <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
        <p className="text-sm text-zinc-400">Current plan</p>
        <p className="mt-1 text-xl font-bold text-white">{PLAN_LABEL[plan]}</p>
        {plan === "free" && (
          <Link
            href="/pricing"
            className="mt-4 inline-block rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            Upgrade to Pro
          </Link>
        )}
      </div>

      <div className="mt-6">
        <Link href="/ai-assistant" className="text-red-400 underline">
          Go to the AI Diagnostic Assistant
        </Link>
      </div>
    </div>
  );
}
