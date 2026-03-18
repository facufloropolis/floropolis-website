import type { Metadata } from "next";
import Link from "next/link";
import { blogPosts } from "@/lib/data/blog-posts";
import BlogIndexList from "./BlogIndexList";
import Navigation from "@/components/Navigation";
import TopBanner from "@/components/TopBanner";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "Florist Guides & Resources | Floropolis Blog",
  description:
    "Expert guides for professional florists: flower care, conditioning tips, wholesale buying guides, and design inspiration. Farm-direct from Ecuador.",
  openGraph: {
    title: "Florist Guides & Resources | Floropolis Blog",
    description:
      "Expert guides for professional florists: flower care, conditioning tips, wholesale buying guides, and design inspiration.",
    url: "https://www.floropolis.com/blog",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Floropolis — Florist Guides & Resources" }],
    type: "website",
  },
};

export default function BlogPage() {
  const categories = [...new Set(blogPosts.map((p) => p.category))].sort();

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />
      <main>
      {/* Header */}
      <section className="bg-gradient-to-br from-emerald-50 to-green-50 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
            Florist Guides & Resources
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Expert care guides, sourcing tips, and design inspiration for
            professional florists. Written by florists, for florists.
          </p>
        </div>
      </section>

      {/* Posts grid with category filter */}
      <section className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
        <BlogIndexList posts={blogPosts} categories={categories} />
      </section>

      {/* CTA */}
      <section className="bg-slate-50 py-10 sm:py-14">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Ready to order?
          </h2>
          <p className="text-slate-600 mb-5">
            Farm-direct wholesale flowers from Ecuador. 4-day delivery.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/shop"
              className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition-colors"
            >
              Browse Catalog
            </Link>
            <Link
              href="/sample-box"
              className="border border-emerald-600 text-emerald-700 px-6 py-2.5 rounded-lg font-semibold hover:bg-emerald-50 transition-colors"
            >
              Free Sample Box
            </Link>
          </div>
        </div>
      </section>
      </main>
      <Footer />
    </div>
  );
}
