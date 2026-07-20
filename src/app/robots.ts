import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = env.siteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/account/", "/admin/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
