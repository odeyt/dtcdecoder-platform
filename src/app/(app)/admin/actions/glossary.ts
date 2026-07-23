"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRecognizedLocaleCode } from "@/lib/i18n/locale-codes";

const glossarySchema = z.object({
  termEn: z.string().min(1),
  localeCode: z.string().min(2).max(10),
  translatedTerm: z.string().min(1),
  category: z.string().optional(),
  notes: z.string().optional(),
  doNotTranslate: z.boolean(),
  safetyCritical: z.boolean(),
  reviewStatus: z.enum(["draft", "reviewed", "approved"]),
  reviewedBy: z.string().optional(),
});

export async function saveGlossaryEntryAction(id: string | null, formData: FormData): Promise<void> {
  await requireAdmin();

  const localeCode = String(formData.get("localeCode") ?? "").trim().toLowerCase();

  const parsed = glossarySchema.parse({
    termEn: formData.get("termEn"),
    localeCode,
    translatedTerm: formData.get("translatedTerm"),
    category: formData.get("category") || undefined,
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
    category: parsed.category ?? null,
    notes: parsed.notes ?? null,
    do_not_translate: parsed.doNotTranslate,
    safety_critical: parsed.safetyCritical,
    review_status: parsed.reviewStatus,
    reviewed_by: parsed.reviewedBy ?? null,
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
