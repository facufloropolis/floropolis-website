import type { Metadata } from "next";
import Link from "next/link";
import { blogPosts } from "@/lib/data/blog-posts";

export const metadata: Metadata = {
  title: "Florist Guides & Resources | Floropolis Blog",
  description:
    "Expert guides for professional florists: flower care, conditioning tips, wholesale buying guides, and design inspiration. Farm-direct from Ecuador.",
};

export default function BlogPage() {
  return (
    <main className="min-h-screen bg-white">
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

      {/* Posts grid */}
      <section className="max-w-4xl mx-auto px-4 py-10 sm:py-14">
        <div className="grid gap-6 sm:gap-8">
          {blogPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group block border border-slate-200 rounded-xl p-5 sm:p-7 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                  {post.category}
                </span>
                <span>{post.readingTime}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors mb-2">
                {post.title}
              </h2>
              <p className="text-sm sm:text-base text-slate-600 line-clamp-2">
                {post.metaDescription}
              </p>
              <span className="inline-block mt-3 text-sm font-semibold text-emerald-600 group-hover:text-emerald-700">
                Read guide &rarr;
              </span>
            </Link>
          ))}
        </div>
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
  );
}
