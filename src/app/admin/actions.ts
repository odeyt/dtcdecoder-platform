"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createDtcCode,
  updateDtcCode,
  setDtcCodePublished,
  type DtcCodeInput,
} from "@/lib/admin-dtc";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DtcDifficulty, DtcSeverity, DtcFaqEntry, BlogCategory } from "@/lib/types";

function linesToArray(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseFaq(value: FormDataEntryValue | null): DtcFaqEntry[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  // One FAQ per line, "question :: answer".
  return raw
    .split("\n")
    .map((line) => line.split("::"))
    .filter((parts) => parts.length === 2)
    .map(([q, a]) => ({ q: q.trim(), a: a.trim() }));
}

function parseDtcInput(formData: FormData): DtcCodeInput {
  const difficulty = String(formData.get("difficulty") ?? "moderate") as DtcDifficulty;
  const severity = String(formData.get("severity") ?? "moderate") as DtcSeverity;

  return {
    code: String(formData.get("code") ?? "").trim(),
    make: String(formData.get("make") ?? "").trim().toLowerCase() || null,
    model: String(formData.get("model") ?? "").trim() || null,
    engineCode: String(formData.get("engineCode") ?? "").trim().toLowerCase() || null,
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    title: String(formData.get("title") ?? "").trim(),
    metaDescription: String(formData.get("metaDescription") ?? "").trim(),
    meaning: String(formData.get("meaning") ?? "").trim(),
    symptoms: linesToArray(formData.get("symptoms")),
    causes: linesToArray(formData.get("causes")),
    diagnosticSteps: linesToArray(formData.get("diagnosticSteps")),
    commonMistakes: String(formData.get("commonMistakes") ?? "").trim(),
    difficulty,
    severity,
    driveRecommendation: String(formData.get("driveRecommendation") ?? "").trim(),
    relatedMakes: linesToArray(formData.get("relatedMakes")),
    faq: parseFaq(formData.get("faq")),
    pdfUrl: String(formData.get("pdfUrl") ?? "").trim(),
    youtubeUrl: String(formData.get("youtubeUrl") ?? "").trim(),
  };
}

export async function createDtcCodeAction(formData: FormData) {
  await requireAdmin();
  const input = parseDtcInput(formData);
  const dtc = await createDtcCode(input);
  revalidatePath("/admin/dtc-codes");
  redirect(`/admin/dtc-codes/${dtc.id}/edit`);
}

export async function updateDtcCodeAction(id: string, formData: FormData) {
  await requireAdmin();
  const input = parseDtcInput(formData);
  await updateDtcCode(id, input);
  revalidatePath("/admin/dtc-codes");
  revalidatePath(`/admin/dtc-codes/${id}/edit`);
}

export async function toggleDtcPublishAction(id: string, isPublished: boolean) {
  await requireAdmin();
  await setDtcCodePublished(id, isPublished);
  revalidatePath("/admin/dtc-codes");
}

const blogPostSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  category: z.string(),
  excerpt: z.string().default(""),
  content: z.string().min(1),
});

export async function saveBlogPostAction(id: string | null, formData: FormData) {
  await requireAdmin();
  const parsed = blogPostSchema.parse({
    title: formData.get("title"),
    slug: formData.get("slug"),
    category: formData.get("category"),
    excerpt: formData.get("excerpt") ?? "",
    content: formData.get("content"),
  });

  const supabase = createAdminClient();
  const payload = {
    title: parsed.title,
    slug: parsed.slug.toLowerCase(),
    category: parsed.category as BlogCategory,
    excerpt: parsed.excerpt || null,
    content: parsed.content,
  };

  if (id) {
    const { error } = await supabase.from("blog_posts").update(payload).eq("id", id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("blog_posts").insert(payload);
    if (error) throw error;
  }

  revalidatePath("/admin/blog");
  redirect("/admin/blog");
}

export async function toggleBlogPublishAction(id: string, isPublished: boolean) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("blog_posts")
    .update({
      is_published: isPublished,
      published_at: isPublished ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) throw error;
  revalidatePath("/admin/blog");
}

export async function updateAiSystemPromptAction(formData: FormData) {
  await requireAdmin();
  const value = String(formData.get("prompt") ?? "").trim();

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admin_settings")
    .upsert({ key: "ai_system_prompt", value }, { onConflict: "key" });

  if (error) throw error;
  revalidatePath("/admin/settings");
}
