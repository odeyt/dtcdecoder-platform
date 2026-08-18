import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { LoginForms } from "@/components/LoginForms";

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("signInHeading")}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{t("signInSubtext")}</p>
      {/* /account/auth/callback redirects here with ?error=auth when a
          magic-link/OAuth code exchange fails (expired or already-used
          link) — surfaced here rather than silently dropped, so the
          technician knows to request a new link instead of assuming
          the page is just broken. */}
      {error === "auth" && (
        <p role="alert" className="mt-4 text-sm text-[var(--accent-red)]">
          {t("signInLinkExpired")}
        </p>
      )}
      <div className="mt-6 text-left">
        <LoginForms next={next} />
      </div>
    </div>
  );
}
