import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BlogCategory, BlogPost } from "@/lib/types";

export const BLOG_CATEGORY_LABELS: Record<BlogCategory, string> = {
  dtc_guides: "DTC Guides",
  check_engine_light: "Check Engine Light",
  limp_mode: "Limp Mode",
  can_bus_diagnostics: "CAN Bus Diagnostics",
  ev_diagnostics: "EV Diagnostics",
  transmission_faults: "Transmission Faults",
  immobilizer_problems: "Immobilizer Problems",
  bmw_diagnostics: "BMW Diagnostics",
  land_rover_diagnostics: "Land Rover Diagnostics",
  toyota_diagnostics: "Toyota Diagnostics",
};

export async function listPublishedBlogPosts(category?: BlogCategory): Promise<BlogPost[]> {
  const supabase = await createClient();
  let query = supabase
    .from("blog_posts")
    .select("*")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPublishedBlogPost(slug: string): Promise<BlogPost | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("is_published", true)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listAllBlogPostsForAdmin(): Promise<BlogPost[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getBlogPostForAdmin(id: string): Promise<BlogPost | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}
