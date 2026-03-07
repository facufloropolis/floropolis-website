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
    sitemap: "https://mvp.floropolis.com/sitemap.xml",
  };
}
