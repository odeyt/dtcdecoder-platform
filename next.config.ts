import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Supabase Storage public URLs are served from
    // https://<project-ref>.supabase.co/storage/v1/object/public/...
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
