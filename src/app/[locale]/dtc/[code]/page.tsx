import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGenericDtcCode } from "@/lib/dtc";
import { DtcCodeResult } from "@/components/DtcCodeResult";
import { createClient } from "@/lib/supabase/server";
import { recordSearchHistory } from "@/lib/search-history";
import { buildLocaleAlternates } from "@/lib/i18n/metadata";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; code: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, code } = await params;
  const dtc = await getGenericDtcCode(code.toLowerCase());
  if (!dtc || !dtc.is_published) return {};

  // The title/description themselves stay in the DTC code's original
  // English (admin-authored, no per-locale content exists yet — see
  // dtcResult.contentNotLocalizedNote) — only the alternates/hreflang
  // structure is locale-aware.
  return {
    title: dtc.title,
    description: dtc.meta_description ?? dtc.meaning,
    alternates: await buildLocaleAlternates(locale, `/dtc/${dtc.slug}`),
  };
}

export default async function GenericDtcCodePage({ params }: Props) {
  const { code } = await params;
  const dtc = await getGenericDtcCode(code.toLowerCase());

  if (!dtc || !dtc.is_published) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    recordSearchHistory(user.id, "lookup", dtc.code, dtc.id).catch(() => {});
  }

  return <DtcCodeResult dtc={dtc} />;
}
