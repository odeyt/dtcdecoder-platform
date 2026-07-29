import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buildLocaleAlternates } from "@/lib/i18n/metadata";
import { ServiceBayHero } from "@/components/ServiceBayHero";
import { EmailSignupForm } from "@/components/EmailSignupForm";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const alternates = await buildLocaleAlternates(locale, "/");

  return {
    title: t("homeTitle"),
    description: t("homeDescription"),
    alternates,
    openGraph: { title: t("homeTitle"), description: t("homeDescription"), locale },
  };
}

// getTranslations (async, from next-intl/server) — not useTranslations
// (the sync-only hook from "next-intl") — since this is itself an async
// Server Component (needs to await its own params); next-intl explicitly
// rejects the sync hook inside an async component.
function CheckIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" strokeWidth="2" className="shrink-0">
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const VALUE_PROP_ICONS = [
  // Instant
  <path key="bolt" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" strokeLinecap="round" />,
  // Verified data
  <path
    key="shield"
    d="M12 2 4 5v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V5l-8-3zM9 12l2 2 4-4"
    strokeLinejoin="round"
    strokeLinecap="round"
  />,
  // Safety first
  <path
    key="check"
    d="M12 22c4.5-1.4 8-5 8-10.5V6l-8-3-8 3v5.5C4 17 7.5 20.6 12 22z"
    strokeLinejoin="round"
    strokeLinecap="round"
  />,
];

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  const th = await getTranslations({ locale, namespace: "home" });
  const tSb = await getTranslations({ locale, namespace: "serviceBay" });
  const tNav = await getTranslations({ locale, namespace: "nav" });

  const valueProps = [
    { title: th("valueProp1Title"), body: th("valueProp1Body") },
    { title: th("valueProp2Title"), body: th("valueProp2Body") },
    { title: th("valueProp3Title"), body: th("valueProp3Body") },
  ];

  const capabilities = [tSb("capabilityCode"), tSb("capabilitySymptom"), tSb("capabilityScan"), tSb("capabilityPlan")];

  return (
    <div>
      {/* Hero — two-column: static marketing copy (left, this page owns the
          copy and the real page h1) + the embedded Diagnostic Intake
          Console (right, ServiceBayHero.tsx owns its own step machine and
          copy). "Start Diagnosis" is a plain anchor to the console's own
          id — no client JS needed for the scroll+focus behavior. */}
      <section className="container-app px-6 pt-16 pb-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div className="fade-in-up">
            <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent-red)] uppercase">{tSb("leftEyebrow")}</p>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
              {tSb("leftHeadlinePrefix")}
              <span className="text-[var(--accent-red)]">{tSb("leftHeadlineAccent")}</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-[var(--text-secondary)] sm:text-lg">{tSb("leftSupportingCopy")}</p>

            <ul className="mt-6 flex flex-col gap-2.5">
              {capabilities.map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                  <CheckIcon />
                  {item}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#diagnostic-intake-console"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[var(--accent-red)] px-6 py-3 font-semibold text-white transition hover:brightness-110"
                style={{ boxShadow: "var(--shadow-accent)" }}
              >
                {tSb("startDiagnosisCta")}
              </a>
              <Link
                href="/dtc"
                className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-6 py-3 font-semibold text-[var(--text-primary)] transition hover:border-[var(--border-red)]"
              >
                {tNav("dtcLookup")}
              </Link>
            </div>
          </div>

          <div className="fade-in-up" style={{ animationDelay: "80ms" }}>
            <ServiceBayHero locale={locale} />
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="container-app px-6 py-16">
        <h2 className="text-center text-sm font-semibold tracking-[0.15em] text-[var(--text-muted)] uppercase">
          {th("valuePropsHeading")}
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {valueProps.map((prop, i) => (
            <div key={prop.title} className="hover-lift glass-panel rounded-[var(--radius-xl)] p-6">
              <svg
                aria-hidden="true"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent-red)"
                strokeWidth="1.75"
                className="shrink-0"
              >
                {VALUE_PROP_ICONS[i]}
              </svg>
              <h3 className="mt-4 text-base font-bold text-[var(--text-primary)]">{prop.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{prop.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Monetization */}
      <section className="container-app px-6 py-16">
        <div className="grid gap-6 md:grid-cols-2">
          <div
            className="hover-lift rounded-[var(--radius-xl)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-8"
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
          <div className="hover-lift glass-panel rounded-[var(--radius-xl)] p-8">
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
        <div
          className="mx-auto max-w-2xl rounded-[var(--radius-xl)] border border-[var(--border-red)] bg-[var(--surface-burgundy)] p-10"
          style={{ boxShadow: "var(--shadow-accent)" }}
        >
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
        </div>
      </section>
    </div>
  );
}
