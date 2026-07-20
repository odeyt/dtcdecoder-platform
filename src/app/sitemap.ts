import type { MetadataRoute } from "next";
import { listProducts } from "@/lib/products";
import { env } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = env.siteUrl();
  const products = await listProducts();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/catalog`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/wiring-diagrams`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/software-tools`, changeFrequency: "daily", priority: 0.8 },
  ];

  const productRoutes: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/products/${product.slug}`,
    lastModified: new Date(product.updated_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...productRoutes];
}
