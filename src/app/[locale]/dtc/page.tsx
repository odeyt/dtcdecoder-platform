import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { searchDtcCodes } from "@/lib/dtc";
import { incrementDtcSearchCount } from "@/lib/admin-dtc";
import { buildLocaleAlternates } from "@/lib/i18n/metadata";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/subscriptions";
import {
  recordBasicSearchUsage,
  hasBasicSearchAllowanceRemaining,
  getBasicSearchUsageSummary,
  BasicSearchLimitExceededError,
  type BasicSearchIdentity,
} from "@/lib/basic-search/usage";
import { BASIC_SEARCH_LIMITS } from "@/lib/pricing";
import { ANON_SEARCH_ID_COOKIE } from "@/lib/basic-search/constants";
import { LockedResultPanel } from "@/components/LockedResultCard";
import { LOCKED_SECTION_CATALOG } from "@/lib/ai-diagnostics/redaction";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const alternates = await buildLocaleAlternates(locale, "/dtc");

  return {
    title: t("dtcSearchTitle"),
    description: t("dtcSearchDescription"),
    alternates,
  };
}

// Resolves who's asking — a signed-in user (their real user_id), or an
// anonymous visitor (the server-issued httpOnly cookie minted in
// src/proxy.ts). Never trusts anything client-supplied for identity.
async function resolveSearchIdentity(): Promise<{
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
  // proxy.ts mints this on every request before the page renders — a
  // missing cookie here means proxy.ts didn't run (shouldn't happen given
  // its matcher), not a real anonymous visitor. Fall back to a per-request
  // id rather than crash; it just won't accumulate a count, which is the
  // safe failure direction (never blocks a genuine visitor).
  return {
    identity: { type: "anon", id: anonId ?? crypto.randomUUID() },
    plan: "free",
  };
}

export default async function DtcLookupPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const t = await getTranslations({ locale, namespace: "dtcSearch" });

  const { identity, plan } = await resolveSearchIdentity();

  let results: Awaited<ReturnType<typeof searchDtcCodes>> = [];
  let limitError: BasicSearchLimitExceededError | null = null;

  if (query) {
    const allowed = await hasBasicSearchAllowanceRemaining(identity, plan);
    if (!allowed) {
      // Reuse getBasicSearchUsageSummary's numbers via the same error type
      // recordBasicSearchUsage would throw, so the page has one shape to
      // render regardless of which check caught the limit.
      const summary = await getBasicSearchUsageSummary(identity);
      const limits = BASIC_SEARCH_LIMITS[plan];
      limitError = new BasicSearchLimitExceededError(
        `You have used ${summary.usedToday} searches today or ${summary.usedThisMonth} this month. Upgrade for professional AI diagnostics.`,
        summary.usedToday,
        limits.dailyLimit ?? 0,
        summary.usedThisMonth,
        limits.monthlyLimit ?? 0,
      );
    } else {
      results = await searchDtcCodes(query);
      // Only a SUCCESSFUL search (at least one result) consumes the
      // allowance — a typo or a query that matches nothing never counts
      // against a free visitor's daily/monthly limit.
      if (results.length > 0) {
        incrementDtcSearchCount(results[0].id).catch(() => {});
        await recordBasicSearchUsage(identity, plan).catch((err) => {
          // Recording is best-effort from the render's perspective — the
          // search already succeeded and results are already being shown;
          // a ledger-write hiccup shouldn't turn into a 500 for the
          // visitor. Losing an occasional count is the safe failure
          // direction (under-counts usage rather than blocking a real
          // search that already happened).
          console.error("[basic-search] failed to record usage", err);
        });
      }
    }
  }

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{t("subtitle")}</p>

        {limitError ? (
          <div className="mt-8 flex flex-col gap-6">
            <div
              role="alert"
              className="rounded-[var(--radius-lg)] border-2 p-5"
              style={{ borderColor: "var(--accent-red)", background: "rgba(225, 29, 46, 0.1)" }}
            >
              <p className="font-semibold text-[var(--text-primary)]">Free search limit reached</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{limitError.message}</p>
              <Link
                href="/pricing"
                className="mt-4 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                View plans
              </Link>
            </div>
            <LockedResultPanel sections={LOCKED_SECTION_CATALOG} />
          </div>
        ) : (
          <>
            <form
              className="mt-6 flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--border-subtle)] bg-[var(--surface-1)]/90 p-2 pl-4 backdrop-blur-xl transition focus-within:border-[var(--border-red)]"
              style={{ boxShadow: "var(--shadow-ambient)" }}
            >
              <label htmlFor="dtc-search" className="sr-only">
                {t("searchLabel")}
              </label>
              <input
                id="dtc-search"
                type="text"
                name="q"
                defaultValue={query}
                placeholder={t("placeholder")}
                className="min-h-11 flex-1 bg-transparent px-1 py-2.5 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-11 shrink-0 rounded-[var(--radius-lg)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
                style={{ boxShadow: "var(--shadow-accent)" }}
              >
                {t("decode")}
              </button>
            </form>

            {query && results.length === 0 && (
              <p className="mt-8 text-[var(--text-secondary)]">
                {t("noResults", { query })}{" "}
                <Link href="/ai-assistant" className="text-[var(--accent-red)] underline">
                  {t("askAiAssistant")}
                </Link>
                .
              </p>
            )}

            {results.length > 0 && (
              <ul className="mt-8 space-y-3">
                {results.map((dtc) => (
                  <li key={dtc.id}>
                    <Link
                      href={dtc.make ? `/${dtc.make}/${dtc.slug}` : `/dtc/${dtc.slug}`}
                      className="hover-lift glass-panel flex items-center justify-between gap-4 rounded-[var(--radius-lg)] p-4"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm text-[var(--accent-red)]">
                          {dtc.code}
                          {dtc.make ? ` · ${dtc.make.toUpperCase()}` : ""}
                        </p>
                        <p className="mt-1 font-semibold text-[var(--text-primary)]">{dtc.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">
                          {dtc.meaning}
                        </p>
                      </div>
                      <svg
                        aria-hidden="true"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        className="shrink-0 text-[var(--text-muted)]"
                      >
                        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
