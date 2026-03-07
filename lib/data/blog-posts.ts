// Blog posts data — content from Talin_Marketing's SEO blog series
// Each post targets high-intent florist search queries

import fs from "fs";
import path from "path";

export interface BlogPost {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  date: string;
  category: string;
  readingTime: string;
  shopLink: string;
  shopLinkLabel: string;
}

export const blogPosts: BlogPost[] = [
  {
    slug: "tropical-flower-guide-florists",
    title: "The Complete Tropical Flower Guide for Florists",
    metaTitle: "Tropical Flowers for Florists: Sourcing, Care & Design Guide | Floropolis",
    metaDescription: "The complete florist's guide to working with tropical flowers: heliconia, bird of paradise, anthurium, torch ginger. Sourcing, conditioning, and design tips.",
    date: "2026-03-07",
    category: "Tropicals",
    readingTime: "8 min read",
    shopLink: "/shop?category=Tropicals",
    shopLinkLabel: "Shop Tropical Flowers",
  },
  {
    slug: "anemone-care-guide-florists",
    title: "Anemone Care Guide for Florists",
    metaTitle: "Anemone Care Guide for Florists: Conditioning & Vase Life | Floropolis",
    metaDescription: "How to condition anemone flowers, extend vase life, and use them in arrangements. A professional florist's guide to buying and working with anemones wholesale.",
    date: "2026-03-07",
    category: "Anemone",
    readingTime: "7 min read",
    shopLink: "/shop?category=Anemone",
    shopLinkLabel: "Shop Anemones",
  },
  {
    slug: "ranunculus-season-guide-florists",
    title: "When Is Ranunculus Season? A Florist's Complete Buying Guide",
    metaTitle: "When Is Ranunculus Season? A Florist's Buying Guide | Floropolis",
    metaDescription: "Ranunculus peak season runs January–May. Here's when to source them, what to pay wholesale, how to condition them, and which colors are trending for weddings.",
    date: "2026-03-07",
    category: "Ranunculus",
    readingTime: "7 min read",
    shopLink: "/shop?category=Ranunculus",
    shopLinkLabel: "Shop Ranunculus",
  },
  {
    slug: "wholesale-roses-guide-florists",
    title: "Wholesale Roses for Florists: The Complete Buying Guide",
    metaTitle: "Wholesale Roses for Florists: Varieties, Pricing & Buying Guide | Floropolis",
    metaDescription: "How to buy wholesale roses as a florist: variety guide, pricing, vase life, and why farm-direct beats local distributors. 40+ varieties from $0.94/stem.",
    date: "2026-03-07",
    category: "Rose",
    readingTime: "8 min read",
    shopLink: "/shop?category=Rose",
    shopLinkLabel: "Shop Roses",
  },
  {
    slug: "heliconia-varieties-care",
    title: "Heliconia Varieties: The Complete Florist's Guide",
    metaTitle: "Heliconia Varieties: Florist's Guide to Buying, Conditioning & Design | Floropolis",
    metaDescription: "The complete florist's guide to heliconia: Golden Fire Opal, Rostrata, Iris, and Sassy varieties. Conditioning tips, vase life, design ideas, and wholesale sourcing.",
    date: "2026-03-07",
    category: "Tropicals",
    readingTime: "7 min read",
    shopLink: "/shop?category=Tropicals",
    shopLinkLabel: "Shop Heliconia",
  },
  {
    slug: "delphinium-care-prevent-petal-drop",
    title: "Delphinium Care Guide: Preventing Petal Drop and Getting 10+ Days of Vase Life",
    metaTitle: "Delphinium Care for Florists: Prevent Petal Drop & Extend Vase Life | Floropolis",
    metaDescription: "The florist's guide to delphinium care: how to prevent petal drop, maximize vase life, and source year-round from Ecuador. Varieties, conditioning, and design tips.",
    date: "2026-03-07",
    category: "Delphinium",
    readingTime: "7 min read",
    shopLink: "/shop?category=Delphinium",
    shopLinkLabel: "Shop Delphiniums",
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return blogPosts.find((p) => p.slug === slug);
}

export function getAllBlogSlugs(): string[] {
  return blogPosts.map((p) => p.slug);
}

export function getBlogContent(slug: string): string {
  const filePath = path.join(process.cwd(), "content", "blog", `${slug}.md`);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}
