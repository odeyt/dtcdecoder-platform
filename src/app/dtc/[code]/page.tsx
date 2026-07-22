import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGenericDtcCode } from "@/lib/dtc";
import { DtcCodeResult } from "@/components/DtcCodeResult";
import { createClient } from "@/lib/supabase/server";
import { recordSearchHistory } from "@/lib/search-history";

export const revalidate = 3600;

type Props = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const dtc = await getGenericDtcCode(code.toLowerCase());
  if (!dtc || !dtc.is_published) return {};

  return {
    title: dtc.title,
    description: dtc.meta_description ?? dtc.meaning,
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
