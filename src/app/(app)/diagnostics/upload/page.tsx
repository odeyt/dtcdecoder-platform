import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { env } from "@/lib/env";
import { ScanCaseUploadForm } from "@/components/ScanCaseUploadForm";

export const metadata: Metadata = {
  title: "Import Vehicle Scan",
  description: "Import a diagnostic scan report to get a structured Professional Scan Analysis.",
};

export default async function DiagnosticsUploadPage() {
  if (!env.scanDiagnosticsEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/account/login");

  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "scanUpload" });

  return (
    <div className="container-app px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t("pageTitle")}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{t("pageDescription")}</p>
        <div className="mt-8">
          <ScanCaseUploadForm />
        </div>
      </div>
    </div>
  );
}
