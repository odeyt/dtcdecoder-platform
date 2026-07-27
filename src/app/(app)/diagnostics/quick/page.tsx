import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import { canAccessFullDiagnostics } from "@/lib/ai-diagnostics/entitlements";
import { getAllowedOutputLocales } from "@/lib/i18n/languages";
import { env } from "@/lib/env";
import { notFound } from "next/navigation";
import { QuickDiagnosticForm } from "@/components/QuickDiagnosticForm";
import { recordEvent } from "@/lib/analytics/events";

export const metadata: Metadata = { title: "Run Full Professional Diagnosis" };

type Props = {
  searchParams: Promise<{
    code?: string;
    make?: string;
    model?: string;
    modelYear?: string;
    engine?: string;
    returnTo?: string;
  }>;
};

// The "Run Full Professional Diagnosis" entry point linked from DTC search results
// (known-code page, unknown-code fallback, and the main search page).
// Three states, matching the spec exactly: unauthenticated -> sign-in
// (preserving this exact URL, DTC code included, via the next= param —
// see /account/auth/callback), authenticated-but-Free -> upgrade prompt
// (the DTC code stays in the URL, so it's still here after upgrading and
// clicking back), authenticated-and-paid -> the real form.
export default async function QuickDiagnosticPage({ searchParams }: Props) {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const params = await searchParams;
  const currentUrl = `/diagnostics/quick?${new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][],
  ).toString()}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Run Full Professional Diagnosis</h1>
          <p className="mt-3 text-[var(--text-secondary)]">
            Sign in to run a full, vehicle-specific Professional Diagnostic Report{params.code ? ` for ${params.code}` : ""}.
            Your entered details are saved — you won&apos;t need to start over.
          </p>
          <Link
            href={`/account/login?next=${encodeURIComponent(currentUrl)}`}
            className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            Sign in to continue
          </Link>
        </div>
      </div>
    );
  }

  const plan = await getEffectivePlan(user.id, user.email ?? null);

  if (!canAccessFullDiagnostics(plan)) {
    await recordEvent("upgrade_prompt_viewed", { userId: user.id, metadata: { source: "diagnostics_quick", plan } });
    return (
      <div className="container-app px-6 py-16">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Run Full Professional Diagnosis</h1>
          <p className="mt-3 text-[var(--text-secondary)]">
            Full Professional Diagnosis is available on Pro Technician and Workshop plans. Your entered details
            {params.code ? ` for ${params.code}` : ""} are still here — come back to this page after upgrading.
          </p>
          <Link
            href="/pricing"
            className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            View plans
          </Link>
        </div>
      </div>
    );
  }

  const locales = await getAllowedOutputLocales(plan);
  const languageOptions = locales.map((l) => ({ code: l.locale_code, name: l.english_name }));

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Run Full Professional Diagnosis</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Add what you know — every field except the DTC code is optional. This counts as one Professional Diagnostic Report
          against your plan&apos;s monthly allowance.
        </p>
        <div className="mt-8">
          <QuickDiagnosticForm
            prefill={{
              dtcCode: params.code ?? "",
              make: params.make ?? "",
              model: params.model ?? "",
              modelYear: params.modelYear ?? "",
              engine: params.engine ?? "",
            }}
            languageOptions={languageOptions}
          />
        </div>
      </div>
    </div>
  );
}
