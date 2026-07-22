import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isReservedMakeSlug } from "@/lib/reserved-slugs";
import type { DtcCode, DtcDifficulty, DtcFaqEntry } from "@/lib/types";

export interface DtcCodeInput {
  code: string;
  make: string | null;
  model: string | null;
  engineCode: string | null;
  slug: string;
  title: string;
  metaDescription: string;
  meaning: string;
  symptoms: string[];
  causes: string[];
  diagnosticSteps: string[];
  commonMistakes: string;
  difficulty: DtcDifficulty;
  relatedMakes: string[];
  faq: DtcFaqEntry[];
  pdfUrl: string;
  youtubeUrl: string;
}

export function validateDtcCodeInput(input: DtcCodeInput): void {
  if (input.make && isReservedMakeSlug(input.make)) {
    throw new Error(
      `"${input.make}" collides with a reserved top-level route and cannot be used as a make slug.`,
    );
  }
}

export async function listAllDtcCodesForAdmin(): Promise<DtcCode[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getDtcCodeForAdmin(id: string): Promise<DtcCode | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listTopSearchedDtcCodes(limit = 20): Promise<DtcCode[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .order("search_count", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function createDtcCode(input: DtcCodeInput): Promise<DtcCode> {
  validateDtcCodeInput(input);
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .insert({
      code: input.code.toUpperCase(),
      make: input.make || null,
      model: input.model || null,
      engine_code: input.engineCode || null,
      slug: input.slug.toLowerCase(),
      title: input.title,
      meta_description: input.metaDescription || null,
      meaning: input.meaning,
      symptoms: input.symptoms,
      causes: input.causes,
      diagnostic_steps: input.diagnosticSteps,
      common_mistakes: input.commonMistakes || null,
      difficulty: input.difficulty,
      related_makes: input.relatedMakes,
      faq: input.faq,
      pdf_url: input.pdfUrl || null,
      youtube_url: input.youtubeUrl || null,
      is_published: false,
    })
    .select()
    .single();

  if (error || !data) throw error ?? new Error("DTC code insert failed");
  return data;
}

export async function updateDtcCode(
  id: string,
  input: DtcCodeInput,
): Promise<void> {
  validateDtcCodeInput(input);
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("dtc_codes")
    .update({
      code: input.code.toUpperCase(),
      make: input.make || null,
      model: input.model || null,
      engine_code: input.engineCode || null,
      slug: input.slug.toLowerCase(),
      title: input.title,
      meta_description: input.metaDescription || null,
      meaning: input.meaning,
      symptoms: input.symptoms,
      causes: input.causes,
      diagnostic_steps: input.diagnosticSteps,
      common_mistakes: input.commonMistakes || null,
      difficulty: input.difficulty,
      related_makes: input.relatedMakes,
      faq: input.faq,
      pdf_url: input.pdfUrl || null,
      youtube_url: input.youtubeUrl || null,
    })
    .eq("id", id);

  if (error) throw error;
}

export async function setDtcCodePublished(
  id: string,
  isPublished: boolean,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("dtc_codes")
    .update({ is_published: isPublished })
    .eq("id", id);

  if (error) throw error;
}

export async function incrementDtcSearchCount(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("increment_dtc_search_count", {
    dtc_id: id,
  });
  if (error) throw error;
}
