import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { resolveAppShellLocale } from "@/lib/i18n/app-shell-locale";
import { listPublishedDtcCodes } from "@/lib/dtc";

export const metadata: Metadata = {
  title: "Videos",
  description: "Real diagnostic walkthroughs and technician case studies.",
};

export default async function VideosPage() {
  const codes = await listPublishedDtcCodes();
  const withVideos = codes.filter((dtc) => dtc.youtube_url);
  const locale = await resolveAppShellLocale();
  const t = await getTranslations({ locale, namespace: "videosPage" });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">{t("title")}</h1>
      <p className="mt-2 text-zinc-400">{t("subtitle")}</p>

      <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-md">
        <a
          href="https://youtube.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-full border border-white/20 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
        >
          {t("watchOnYoutube")}
        </a>
      </div>

      {withVideos.length > 0 && (
        <ul className="mt-10 space-y-3">
          {withVideos.map((dtc) => (
            <li key={dtc.id}>
              <a
                href={dtc.youtube_url!}
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
