import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

export const metadata: Metadata = { title: "Set a new password" };

export default async function ResetPasswordPage() {
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "auth" });

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t("setNewPasswordHeading")}</h1>
      <div className="mt-6 text-left">
        <ResetPasswordForm />
      </div>
    </div>
  );
}
