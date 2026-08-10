import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { FeatureShowcase } from "@/components/pwa/FeatureShowcase";
import { InstallAppButton } from "@/components/pwa/InstallAppButton";

export const metadata: Metadata = {
  title: "Install",
  description: "Install DTCDecoder as an app and see how it works.",
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
      <path
        d="M4 5h16v11H8l-4 4V5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
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
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M10 19h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IosIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="6" y="3" width="12" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="18.5" r="0.75" fill="currentColor" />
    </svg>
  );
}

// Public "install this app" landing page — the walkthrough InstallAppButton
// (SiteNav) and InstallPrompt (toast) both link out to for the full
// Android/iPhone steps, plus a lightweight animated demo of the real
// product flow. No Workbox/video dependency — see FeatureShowcase.tsx.
export default async function InstallPage() {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "installPage" });

  const steps = [
    { icon: <SearchIcon />, title: t("step1Title"), body: t("step1Body") },
    { icon: <ChatIcon />, title: t("step2Title"), body: t("step2Body") },
    { icon: <ListIcon />, title: t("step3Title"), body: t("step3Body") },
    { icon: <CheckIcon />, title: t("step4Title"), body: t("step4Body") },
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
      </div>

      <h2 className="mt-16 text-center text-xl font-bold text-[var(--text-primary)]">
        {t("howItWorksTitle")}
      </h2>
      <div className="mt-6">
        <FeatureShowcase steps={steps} />
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2">
        <div className="glass-panel rounded-[var(--radius-xl)] p-6">
          <div className="flex items-center gap-2">
            <AndroidIcon />
            <h3 className="text-base font-bold text-[var(--text-primary)]">{t("androidTitle")}</h3>
          </div>
          <ol className="mt-4 flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
            {[t("androidStep1"), t("androidStep2"), t("androidStep3"), t("androidStep4")].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-red)]/10 text-xs font-semibold text-[var(--accent-red)]">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div className="glass-panel rounded-[var(--radius-xl)] p-6">
          <div className="flex items-center gap-2">
            <IosIcon />
            <h3 className="text-base font-bold text-[var(--text-primary)]">{t("iosTitle")}</h3>
          </div>
          <ol className="mt-4 flex flex-col gap-3 text-sm text-[var(--text-secondary)]">
            {[t("iosStep1"), t("iosStep2"), t("iosStep3"), t("iosStep4")].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent-red)]/10 text-xs font-semibold text-[var(--accent-red)]">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
