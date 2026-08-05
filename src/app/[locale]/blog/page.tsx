import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listPublishedBlogPosts, BLOG_CATEGORY_LABELS } from "@/lib/blog";
import { buildLocaleAlternates } from "@/lib/i18n/metadata";
import type { BlogCategory } from "@/lib/types";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("blogTitle"),
    description: t("blogDescription"),
    alternates: await buildLocaleAlternates(locale, "/blog"),
  };
}

export default async function BlogIndexPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const { category } = await searchParams;
  const activeCategory = (category as BlogCategory | undefined) ?? undefined;
  const posts = await listPublishedBlogPosts(activeCategory);
  const t = await getTranslations({ locale, namespace: "blog" });
  const tCat = await getTranslations({ locale, namespace: "blogCategories" });

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <h1 className="text-3xl font-bold text-white">{t("heading")}</h1>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/blog"
          className={`rounded-full px-3 py-1 text-xs ${!activeCategory ? "bg-red-600 text-white" : "border border-white/10 text-zinc-400"}`}
        >
          {t("allCategories")}
        </Link>
        {Object.keys(BLOG_CATEGORY_LABELS).map((value) => (
          <Link
            key={value}
            href={`/blog?category=${value}`}
            className={`rounded-full px-3 py-1 text-xs ${activeCategory === value ? "bg-red-600 text-white" : "border border-white/10 text-zinc-400"}`}
          >
            {tCat(value)}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="mt-10 text-zinc-400">{t("noPostsYet")}</p>
      ) : (
        <ul className="mt-10 space-y-4">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-md transition hover:bg-white/10"
              >
                <p className="text-xs text-red-400">{tCat(post.category)}</p>
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
