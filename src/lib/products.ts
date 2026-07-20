import { createClient } from "@/lib/supabase/server";
import type { Product, ProductCategory } from "@/lib/types";

// Public reads — RLS restricts these to is_published = true, so the plain
// cookie-session client is safe to use even for anonymous visitors.

export async function getProduct(slug: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listProducts(
  category?: ProductCategory,
): Promise<Product[]> {
  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
