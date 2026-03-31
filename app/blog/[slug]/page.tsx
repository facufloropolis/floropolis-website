import { notFound } from "next/navigation";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { getBlogPost, getBlogContent, getAllBlogSlugs, blogPosts } from "@/lib/data/blog-posts";
import type { Metadata } from "next";

const MDY_CATEGORIES = ["Rose", "Ranunculus", "Anemone", "Delphinium", "Mothers Day", "Garden Rose", "Peony"];

export async function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: post.metaTitle,
    description: post.metaDescription,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const content = getBlogContent(slug);

  // Related posts: same category first, then fill with others (exclude current)
  const sameCat = blogPosts.filter((p) => p.slug !== slug && p.category === post.category);
  const others = blogPosts.filter((p) => p.slug !== slug && p.category !== post.category);
  const related = [...sameCat, ...others].slice(0, 3);

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Breadcrumb */}
        <nav className="mb-6 text-sm text-slate-500 flex items-center gap-2">
          <Link href="/blog" className="hover:text-emerald-600">Guides</Link>
          <span>/</span>
          <span className="text-slate-700 truncate">{post.title}</span>
        </nav>

        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
              {post.category}
            </span>
            <span className="text-xs text-slate-400">{post.readingTime}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-3">
            {post.title}
          </h1>
          <p className="text-lg text-slate-600">{post.metaDescription}</p>
        </header>

        {/* Inline CTA — above content */}
        <div className="mb-8 rounded-xl bg-emerald-50 border border-emerald-200 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-800">Source {post.category} direct from Ecuador farms</p>
            <p className="text-xs text-slate-500 mt-0.5">Transparent per-stem pricing · No minimum order · Shipping included</p>
          </div>
          <Link
            href={post.shopLink}
            className="flex-shrink-0 bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap"
          >
            {post.shopLinkLabel} &#x2192;
          </Link>
        </div>

        {/* Article body */}
        <MarkdownRenderer content={content} />

        {/* MDY callout — relevant categories only, before April 25 */}
        {MDY_CATEGORIES.includes(post.category) && new Date() < new Date("2026-04-25T23:59:59-04:00") && (
          <div className="mt-10 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1">
              <p className="text-sm font-semibold text-rose-700">&#x1F497; Planning a Mother&apos;s Day order?</p>
              <p className="text-xs text-rose-500 mt-0.5">{post.category} is a Mother&apos;s Day favorite. Pre-order by April 25 for guaranteed May 10 delivery. Farm-direct pricing, delivery included.</p>
            </div>
            <Link href="/mothers-day-2026" className="flex-shrink-0 text-xs font-bold text-rose-600 border border-rose-300 bg-white rounded-lg px-3 py-1.5 hover:bg-rose-50 transition-colors whitespace-nowrap">
              View MDY Collection &#x2192;
            </Link>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 px-6 py-8 text-white text-center">
          <h2 className="text-2xl font-bold mb-2">Ready to order {post.category.toLowerCase()}?</h2>
          <p className="text-emerald-100 mb-5 text-sm max-w-md mx-auto">
            Farm-direct from Ecuador. Transparent pricing, delivery included, no minimum order.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href={post.shopLink}
              className="bg-white text-emerald-700 font-bold px-6 py-3 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              {post.shopLinkLabel} &#x2192;
            </Link>
            <Link
              href="/sample-box"
              className="border-2 border-white text-white font-bold px-6 py-3 rounded-lg hover:bg-white/10 transition-colors"
            >
              Try Free Sample Box
            </Link>
          </div>
        </div>

        {/* Related posts */}
        {related.length > 0 && (
          <div className="mt-12">
            <h3 className="text-lg font-bold text-slate-900 mb-4">More florist guides</h3>
            <div className="grid sm:grid-cols-3 gap-4">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group rounded-xl border border-slate-200 p-4 hover:border-emerald-300 hover:shadow-md transition-all"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 mb-1 block">{r.category}</span>
                  <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                    {r.title}
                  </p>
                  <span className="text-xs text-slate-400 mt-1 block">{r.readingTime}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/blog" className="text-sm text-slate-500 hover:text-emerald-600">
            &#x2190; All florist guides
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
