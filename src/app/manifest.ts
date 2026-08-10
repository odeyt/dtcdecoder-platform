import type { MetadataRoute } from "next";

// Native Next.js 16 metadata-route convention (same pattern as robots.ts/
// sitemap.ts) — served at /manifest.webmanifest. proxy.ts's locale-rewrite
// must never touch this path; see PASSTHROUGH_TOP_LEVEL_SEGMENTS there,
// which exempts it the same way robots.txt/sitemap.xml already are.
//
// This is an installability layer only — no offline diagnostics, no cached
// AI/API responses. See public/sw.js for the caching policy.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DTCDecoder",
    short_name: "DTCDecoder",
    description: "AI-powered automotive diagnostics and DTC decoding",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // Sourced from src/app/globals.css (--surface-0, --accent-red) — not a
    // new color system.
    background_color: "#08080a",
    theme_color: "#08080a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
