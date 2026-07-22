import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getPublishedBlogPost, BLOG_CATEGORY_LABELS } from "@/lib/blog";
import { EmailSignupForm } from "@/components/EmailSignupForm";

export const revalidate = 3600;

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedBlogPost(slug);
  if (!post) notFound();

  const html = await marked.parse(post.content);

  return (
    <article className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs text-red-400">{BLOG_CATEGORY_LABELS[post.category]}</p>
      <h1 className="mt-1 text-3xl font-bold text-white">{post.title}</h1>
      <div className="blog-content mt-8" dangerouslySetInnerHTML={{ __html: html }} />
      <div className="mt-12">
        <EmailSignupForm />
      </div>
    </article>
  );
}
