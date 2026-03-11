import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/quote/confirmation"],
      },
    ],
    sitemap: `${process.env.NEXT_PUBLIC_SITE_URL || "https://www.floropolis.com"}/sitemap.xml`,
  };
}
