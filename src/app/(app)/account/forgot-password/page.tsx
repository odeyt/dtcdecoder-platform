import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("resetPasswordHeading")}</h1>
      <p className="mt-2 text-[var(--text-secondary)]">{t("resetPasswordSubtext")}</p>
      <div className="mt-6 text-left">
        <ForgotPasswordForm />
      </div>
      <Link
        href="/account/login"
        className="mt-6 inline-block text-sm text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
      >
        {t("backToSignIn")}
      </Link>
    </div>
  );
}
