import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { HeroSearch } from "@/components/HeroSearch";
import { EmailSignupForm } from "@/components/EmailSignupForm";

type Props = {
  params: Promise<{ locale: string }>;
};

// getTranslations (async, from next-intl/server) — not useTranslations
// (the sync-only hook from "next-intl") — since this is itself an async
// Server Component (needs to await its own params); next-intl explicitly
// rejects the sync hook inside an async component.
export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "hero" });
  const th = await getTranslations({ locale, namespace: "home" });

  return (
    <div>
      {/* Hero */}
      <section className="container-app px-6 pt-24 pb-20 text-center">
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent-red)]">
          {t("eyebrow")}
        </p>
        <h1 className="mx-auto mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl md:text-6xl">
          {t("headline")}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-[var(--text-secondary)] sm:text-lg">
          {t("subheadline")}
        </p>

        <div className="mt-10">
          <HeroSearch />
        </div>
      </section>

      {/* Monetization */}
      <section className="container-app px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="rounded-[var(--radius-xl)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-8"
            style={{ boxShadow: "var(--shadow-accent)" }}
          >
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              {th("pdfHeading")}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{th("pdfBody")}</p>
            <a
              href="https://gumroad.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-2.5 font-semibold text-white transition hover:brightness-110"
            >
              {th("getRepairPdf")}
            </a>
          </div>
          <div className="glass-panel rounded-[var(--radius-xl)] p-8">
            <h2 className="text-xl font-bold text-[var(--text-primary)]">
              {th("videoHeading")}
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{th("videoBody")}</p>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-2.5 font-semibold text-[var(--text-primary)] transition hover:bg-white/5"
            >
              {th("watchOnYoutube")}
            </a>
          </div>
        </div>

        <div className="mt-6">
          <EmailSignupForm />
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="container-app px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-[var(--text-primary)]">
          {th("pricingHeading")}
        </h2>
        <p className="mt-2 text-[var(--text-secondary)]">{th("pricingBody")}</p>
        <Link
          href="/pricing"
          className="mt-6 inline-block min-h-11 rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
          {th("seePricing")}
        </Link>
      </section>
    </div>
  );
}
