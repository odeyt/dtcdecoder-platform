import type { MetadataRoute } from "next";
import { listPublishedDtcCodes } from "@/lib/dtc";
import { listPublishedBlogPosts } from "@/lib/blog";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = env.siteUrl();
  const [dtcCodes, blogPosts] = await Promise.all([
    listPublishedDtcCodes(),
    listPublishedBlogPosts(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/dtc`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/ai-assistant`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${siteUrl}/videos`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/blog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/pricing`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${siteUrl}/install`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/contact`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const dtcRoutes: MetadataRoute.Sitemap = dtcCodes.map((dtc) => ({
    url: dtc.make ? `${siteUrl}/${dtc.make}/${dtc.slug}` : `${siteUrl}/dtc/${dtc.slug}`,
    lastModified: new Date(dtc.updated_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const blogRoutes: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: new Date(post.updated_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...dtcRoutes, ...blogRoutes];
}
