import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { LoginForms } from "@/components/LoginForms";

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("signInHeading")}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{t("signInSubtext")}</p>
      <div className="mt-6 text-left">
        <LoginForms next={next} />
      </div>
    </div>
  );
}
