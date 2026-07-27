import { createClient } from "@/lib/supabase/server";
import type { DtcCode } from "@/lib/types";

// Public reads — RLS restricts these to is_published = true, so the plain
// cookie-session client is safe to use even for anonymous visitors.

export async function getGenericDtcCode(slug: string): Promise<DtcCode | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .is("make", null)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getMakeDtcCode(
  make: string,
  slug: string,
): Promise<DtcCode | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .eq("make", make)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Same-family generic codes (shared first 3 characters, e.g. "P04" for
// P0420) — used as the "related or adjacent codes" suggestion when the
// exact code searched for isn't in the database yet. Deterministic
// database read, no AI involved, same as every other function here.
export async function getRelatedDtcCodes(code: string, limitCount = 5): Promise<DtcCode[]> {
  const prefix = code.trim().slice(0, 3);
  if (prefix.length < 3) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .is("make", null)
    .eq("is_published", true)
    .ilike("code", `${prefix}%`)
    .neq("code", code.trim().toUpperCase())
    .order("code", { ascending: true })
    .limit(limitCount);

  if (error) throw error;
  return data ?? [];
}

export async function listPublishedDtcCodes(): Promise<DtcCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Free-text lookup for the public search bar — matches on code prefix or a
// plain-English full-text search over meaning/symptoms/causes, so "P0420"
// and "catalyst efficiency" both work from the same box.
export async function searchDtcCodes(query: string): Promise<DtcCode[]> {
  const supabase = await createClient();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const codeMatch = trimmed.match(/^[pbcu]\d{3,4}/i);
  if (codeMatch) {
    const { data, error } = await supabase
      .from("dtc_codes")
      .select("*")
      .eq("is_published", true)
      .ilike("code", `${codeMatch[0]}%`)
      .order("make", { ascending: true, nullsFirst: true })
      .limit(20);

    if (error) throw error;
    if (data && data.length > 0) return data;
  }

  const { data, error } = await supabase
    .from("dtc_codes")
    .select("*")
    .eq("is_published", true)
    .textSearch("fts", trimmed.split(/\s+/).join(" | "), {
      type: "plain",
      config: "english",
    })
    .limit(20);

  if (error) throw error;
  return data ?? [];
}
