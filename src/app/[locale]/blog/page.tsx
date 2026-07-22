import type { Metadata } from "next";
import Link from "next/link";
import { listPublishedBlogPosts, BLOG_CATEGORY_LABELS } from "@/lib/blog";
import type { BlogCategory } from "@/lib/types";

export const metadata: Metadata = {
  title: "Blog",
  description: "Diagnostic guides, DTC breakdowns, and repair case studies.",
};

type Props = {
  searchParams: Promise<{ category?: string }>;
};

export default async function BlogIndexPage({ searchParams }: Props) {
  const { category } = await searchParams;
  const activeCategory = (category as BlogCategory | undefined) ?? undefined;
  const posts = await listPublishedBlogPosts(activeCategory);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">Blog</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/blog"
          className={`rounded-full px-3 py-1 text-xs ${!activeCategory ? "bg-red-600 text-white" : "border border-white/10 text-zinc-400"}`}
        >
          All
        </Link>
        {Object.entries(BLOG_CATEGORY_LABELS).map(([value, label]) => (
          <Link
            key={value}
            href={`/blog?category=${value}`}
            className={`rounded-full px-3 py-1 text-xs ${activeCategory === value ? "bg-red-600 text-white" : "border border-white/10 text-zinc-400"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="mt-10 text-zinc-400">No posts published yet.</p>
      ) : (
        <ul className="mt-10 space-y-4">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:bg-white/10"
              >
                <p className="text-xs text-red-400">{BLOG_CATEGORY_LABELS[post.category]}</p>
                <p className="mt-1 text-lg font-semibold text-white">{post.title}</p>
                {post.excerpt && <p className="mt-1 text-sm text-zinc-400">{post.excerpt}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
