import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { FeatureShowcase } from "@/components/pwa/FeatureShowcase";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";

export const metadata: Metadata = {
  title: "Install",
  description: "Install DTCDecoder as an app on Android, iPhone, or desktop, and see how it works.",
};

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 5h16v11H8l-4 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 6h12M8 12h12M8 18h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1.5" fill="currentColor" />
      <circle cx="4" cy="12" r="1.5" fill="currentColor" />
      <circle cx="4" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 13l5 5L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AndroidIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IosIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="18.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

function DesktopIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="12" rx="1.5" stroke="currentColor" strokeWidth="2" />
      <path d="M9 20h6M12 16v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function TapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path d="M5 20c1.5-4 4.2-6 7-6s5.5 2 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlatformCard({
  id,
  icon,
  title,
  browserNote,
  steps,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  browserNote: string;
  steps: string[];
}) {
  return (
    <div id={id} className="glass-panel scroll-mt-24 rounded-[var(--radius-xl)] p-6">
      <div className="flex items-center gap-2 text-[var(--accent-red)]">{icon}</div>
      <h3 className="mt-3 text-lg font-bold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{browserNote}</p>
      <ol className="mt-4 flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-red)]/10 text-xs font-semibold text-[var(--accent-red)]">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

// Public "install this app" landing page — the walkthrough InstallAppButton
// (SiteNav) and InstallPrompt (toast) both link out to for the full
// Android/iPhone/Desktop steps, plus benefits, a lightweight animated demo
// of the real product flow, and an FAQ. No Workbox/video dependency — see
// FeatureShowcase.tsx.
export default async function InstallPage() {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "installPage" });

  const demoSteps = [
    { icon: <SearchIcon />, title: t("step1Title"), body: t("step1Body") },
    { icon: <ChatIcon />, title: t("step2Title"), body: t("step2Body") },
    { icon: <ListIcon />, title: t("step3Title"), body: t("step3Body") },
    { icon: <CheckIcon />, title: t("step4Title"), body: t("step4Body") },
  ];

  const benefits = [
    { icon: <TapIcon />, title: t("benefit1Title"), body: t("benefit1Body") },
    { icon: <ExpandIcon />, title: t("benefit2Title"), body: t("benefit2Body") },
    { icon: <AccountIcon />, title: t("benefit3Title"), body: t("benefit3Body") },
  ];

  const faqs = [
    { q: t("faq1Q"), a: t("faq1A") },
    { q: t("faq2Q"), a: t("faq2A") },
    { q: t("faq3Q"), a: t("faq3A") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-0)] text-lg font-extrabold text-[var(--accent-red)]">
          DTC
        </div>
        <h1 className="mt-6 text-3xl font-bold text-[var(--text-primary)]">{t("heroTitle")}</h1>
        <p className="mx-auto mt-2 max-w-md text-[var(--text-secondary)]">{t("heroSubtitle")}</p>
        <div className="mt-6 flex justify-center">
          <InstallAppButton />
        </div>

        {/* Jump links — makes it unambiguous that Android, iPhone, and
            Desktop are all covered below, not just whichever platform
            InstallAppButton detected for the current visitor. */}
        <nav aria-label={t("quickNavAndroid")} className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <a
            href="#android"
            className="rounded-full border border-[var(--border-subtle)] px-4 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
          >
            {t("quickNavAndroid")}
          </a>
          <a
            href="#iphone"
            className="rounded-full border border-[var(--border-subtle)] px-4 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
          >
            {t("quickNavIos")}
          </a>
          <a
            href="#desktop"
            className="rounded-full border border-[var(--border-subtle)] px-4 py-1.5 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-red)] hover:text-[var(--text-primary)]"
          >
            {t("quickNavDesktop")}
          </a>
        </nav>
      </div>

      <h2 className="mt-16 text-center text-xl font-bold text-[var(--text-primary)]">{t("benefitsTitle")}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {benefits.map((b, i) => (
          <div key={i} className="glass-panel rounded-[var(--radius-lg)] p-5">
            <div className="text-[var(--accent-red)]">{b.icon}</div>
            <h3 className="mt-3 text-sm font-bold text-[var(--text-primary)]">{b.title}</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{b.body}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-16 text-center text-xl font-bold text-[var(--text-primary)]">{t("howItWorksTitle")}</h2>
      <div className="mt-6">
        <FeatureShowcase steps={demoSteps} />
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        <PlatformCard
          id="android"
          icon={<AndroidIcon />}
          title={t("androidTitle")}
          browserNote={t("androidBrowserNote")}
          steps={[t("androidStep1"), t("androidStep2"), t("androidStep3"), t("androidStep4")]}
        />
        <PlatformCard
          id="iphone"
          icon={<IosIcon />}
          title={t("iosTitle")}
          browserNote={t("iosBrowserNote")}
          steps={[t("iosStep1"), t("iosStep2"), t("iosStep3"), t("iosStep4")]}
        />
        <div className="sm:col-span-2">
          <PlatformCard
            id="desktop"
            icon={<DesktopIcon />}
            title={t("desktopTitle")}
            browserNote={t("desktopBrowserNote")}
            steps={[t("desktopStep1"), t("desktopStep2"), t("desktopStep3")]}
          />
        </div>
      </div>

      <h2 className="mt-16 text-center text-xl font-bold text-[var(--text-primary)]">{t("faqTitle")}</h2>
      <div className="mt-6 flex flex-col gap-4">
        {faqs.map((faq, i) => (
          <div key={i} className="glass-panel rounded-[var(--radius-lg)] p-5">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{faq.q}</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{faq.a}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
