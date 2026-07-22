import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMakeDtcCode } from "@/lib/dtc";
import { DtcCodeResult } from "@/components/DtcCodeResult";
import { isReservedMakeSlug } from "@/lib/reserved-slugs";
import { createClient } from "@/lib/supabase/server";
import { recordSearchHistory } from "@/lib/search-history";

export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; make: string; slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { make, slug } = await params;
  if (isReservedMakeSlug(make)) return {};

  const dtc = await getMakeDtcCode(make.toLowerCase(), slug.toLowerCase());
  if (!dtc || !dtc.is_published) return {};

  return {
    title: dtc.title,
    description: dtc.meta_description ?? dtc.meaning,
  };
}

export default async function MakeDtcCodePage({ params }: Props) {
  const { make, slug } = await params;

  // Reserved names (blog, dtc, admin, ...) are never valid `make` values —
  // their own static routes already own that path, so this is unreachable
  // in practice, but guards against a stale/bad row surfacing here anyway.
  if (isReservedMakeSlug(make)) notFound();

  const dtc = await getMakeDtcCode(make.toLowerCase(), slug.toLowerCase());
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
