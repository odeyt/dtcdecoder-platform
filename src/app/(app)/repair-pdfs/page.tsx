import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { listPublishedDtcCodes } from "@/lib/dtc";

export const metadata: Metadata = {
  title: "Repair PDFs",
  description: "Professional repair PDF guides for common diagnostic trouble codes.",
};

export default async function RepairPdfsPage() {
  const codes = await listPublishedDtcCodes();
  const withPdfs = codes.filter((dtc) => dtc.pdf_url);
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "repairPdfs" });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mt-2 text-zinc-400">{t("subtitle")}</p>

      <div className="mt-10 rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-600/10 to-transparent p-8 text-center backdrop-blur-md">
        <h2 className="text-xl font-bold text-white">{t("masterPdfTitle")}</h2>
        <p className="mt-2 text-sm text-zinc-300">{t("masterPdfDescription")}</p>
        <a
          href="https://gumroad.com"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-block rounded-full bg-red-600 px-6 py-3 font-semibold text-white shadow-[0_0_20px_rgba(255,30,45,0.35)] transition hover:bg-red-500"
        >
          {t("getRepairPdf")}
        </a>
      </div>

      {withPdfs.length > 0 && (
        <ul className="mt-10 space-y-3">
          {withPdfs.map((dtc) => (
            <li key={dtc.id}>
              <a
                href={dtc.pdf_url!}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition hover:bg-white/10"
              >
                <p className="font-mono text-sm text-red-400">{dtc.code}</p>
                <p className="mt-1 font-semibold text-white">{dtc.title}</p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
