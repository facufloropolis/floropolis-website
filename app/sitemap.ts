import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/data/product-helpers";
import { getAllBlogSlugs } from "@/lib/data/blog-posts";

const BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.floropolis.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/shop`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE}/sample-box`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/how-it-works`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/quote`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/wholesale-delphiniums`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/wholesale-ranunculus`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/wholesale-anemone`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = [
    "roses", "tropicals", "greens", "combo-boxes", "spring-collection",
  ].map((cat) => ({
    url: `${BASE}/shop/${cat}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // Product pages
  const productPages: MetadataRoute.Sitemap = getAllSlugs().map(({ slug }) => ({
    url: `${BASE}/shop/${slug}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  // Blog pages
  const blogPages: MetadataRoute.Sitemap = getAllBlogSlugs().map((slug) => ({
    url: `${BASE}/blog/${slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  // Blog index
  const blogIndex: MetadataRoute.Sitemap = [
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
  ];

  return [...staticPages, ...categoryPages, ...productPages, ...blogIndex, ...blogPages];
}
