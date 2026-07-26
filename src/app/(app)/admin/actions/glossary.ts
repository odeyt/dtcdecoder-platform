"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecognizedLocaleCode } from "@/lib/i18n/locale-codes";
import { glossaryEntrySchema, resolveReviewedAt } from "@/lib/glossary-schema";

export async function saveGlossaryEntryAction(id: string | null, formData: FormData): Promise<void> {
  await requireAdmin();

  const localeCode = String(formData.get("localeCode") ?? "").trim().toLowerCase();

  const parsed = glossaryEntrySchema.parse({
    termEn: formData.get("termEn"),
    localeCode,
    translatedTerm: formData.get("translatedTerm"),
    acronym: formData.get("acronym") || undefined,
    category: formData.get("category") || undefined,
    manufacturerContext: formData.get("manufacturerContext") || undefined,
    systemContext: formData.get("systemContext") || undefined,
    alternativeTranslation: formData.get("alternativeTranslation") || undefined,
    notes: formData.get("notes") || undefined,
    doNotTranslate: formData.get("doNotTranslate") === "on",
    safetyCritical: formData.get("safetyCritical") === "on",
    reviewStatus: formData.get("reviewStatus"),
    reviewedBy: formData.get("reviewedBy") || undefined,
  });

  if (!isRecognizedLocaleCode(parsed.localeCode)) {
    throw new Error(`Unrecognized locale code "${parsed.localeCode}".`);
  }

  const supabase = createAdminClient();
  const payload = {
    term_en: parsed.termEn,
    locale_code: parsed.localeCode,
    translated_term: parsed.translatedTerm,
    acronym: parsed.acronym ?? null,
    category: parsed.category ?? null,
    manufacturer_context: parsed.manufacturerContext ?? null,
    system_context: parsed.systemContext ?? null,
    alternative_translation: parsed.alternativeTranslation ?? null,
    notes: parsed.notes ?? null,
    do_not_translate: parsed.doNotTranslate,
    safety_critical: parsed.safetyCritical,
    review_status: parsed.reviewStatus,
    reviewed_by: parsed.reviewedBy ?? null,
    reviewed_at: resolveReviewedAt(parsed.reviewStatus),
  };

  if (id) {
    const { error } = await supabase.from("terminology_glossary").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("terminology_glossary").insert(payload);
    if (error) throw error;
  }

  revalidatePath("/admin/glossary");
  redirect("/admin/glossary");
}

export async function deleteGlossaryEntryAction(id: string): Promise<void> {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase.from("terminology_glossary").delete().eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/glossary");
}
