import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getBlogPost,
  getBlogContent,
  getAllBlogSlugs,
  blogPosts,
} from "@/lib/data/blog-posts";
import { getProductsByCategory } from "@/lib/data/product-helpers";
import { getProductImage } from "@/lib/product-images";
import Image from "next/image";
import BlogContent from "./BlogContent";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post Not Found" };
  return {
    title: post.metaTitle,
    description: post.metaDescription,
    openGraph: {
      title: post.metaTitle,
      description: post.metaDescription,
      url: `https://www.floropolis.com/blog/${slug}`,
      siteName: "Floropolis",
      images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: post.title }],
      type: "article",
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const content = getBlogContent(slug);
  const otherPosts = blogPosts.filter((p) => p.slug !== slug).slice(0, 3);

  // Extract category from shopLink for featured products
  const categoryMatch = post.shopLink.match(/category=([^&]+)/);
  const categoryName = categoryMatch ? decodeURIComponent(categoryMatch[1]) : null;
  const featuredProducts = categoryName
    ? getProductsByCategory(categoryName)
        .filter((p) => p.price > 0 && p.has_photo)
        .sort((a, b) => Number(b.is_best_seller) - Number(a.is_best_seller))
        .slice(0, 3)
    : [];

  // Article JSON-LD structured data for SEO
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.metaDescription,
    url: `https://www.floropolis.com/blog/${slug}`,
    datePublished: post.date,
    dateModified: post.date,
    image: "https://www.floropolis.com/Floropolis-logo-only.png",
    author: { "@type": "Organization", name: "Floropolis" },
    publisher: {
      "@type": "Organization",
      name: "Floropolis",
      url: "https://www.floropolis.com",
      logo: { "@type": "ImageObject", url: "https://www.floropolis.com/Floropolis-logo-only.png" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://www.floropolis.com/blog/${slug}` },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.floropolis.com/blog" },
      { "@type": "ListItem", position: 3, name: post.title, item: `https://www.floropolis.com/blog/${slug}` },
    ],
  };

  return (
    <main className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {/* Breadcrumb */}
      <div className="max-w-3xl mx-auto px-4 pt-6 sm:pt-8">
        <nav className="flex items-center gap-2 text-sm text-slate-500">
          <Link href="/" className="hover:text-emerald-600">
            Home
          </Link>
          <span>/</span>
          <Link href="/blog" className="hover:text-emerald-600">
            Blog
          </Link>
          <span>/</span>
          <span className="text-slate-700 truncate">{post.title}</span>
        </nav>
      </div>

      {/* Post header */}
      <header className="max-w-3xl mx-auto px-4 pt-6 pb-8">
        <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
          <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
            {post.category}
          </span>
          <span>{post.readingTime}</span>
          <span>
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
          {post.title}
        </h1>
      </header>

      {/* Post content */}
      <article className="max-w-3xl mx-auto px-4 pb-12">
        <BlogContent content={content} />
      </article>

      {/* Shop CTA */}
      <section className="max-w-3xl mx-auto px-4 pb-10">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 sm:p-8">
          <div className="text-center mb-4">
            <h2 className="text-lg font-bold text-slate-900 mb-2">
              Ready to order?
            </h2>
            <p className="text-sm text-slate-600">
              Farm-direct wholesale flowers from Ecuador. 4-day delivery.
            </p>
          </div>

          {/* Featured products from this category */}
          {featuredProducts.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              {featuredProducts.map((p) => {
                const img = getProductImage(p.variety, p.color, p.category);
                const price = p.deal_price ?? p.price;
                const unit = p.unit === "Bunch" ? "bunch" : "stem";
                return (
                  <Link
                    key={p.slug}
                    href={`/shop/${encodeURIComponent(p.slug)}`}
                    className="group bg-white rounded-lg border border-emerald-100 overflow-hidden hover:shadow-md transition-all"
                  >
                    <div className="aspect-square relative bg-slate-50">
                      <Image
                        src={img}
                        alt={`${p.variety} ${p.color}`}
                        fill
                        className="object-contain group-hover:scale-105 transition-transform"
                        sizes="(max-width: 768px) 30vw, 200px"
                        unoptimized={img.startsWith("http")}
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-emerald-600 transition-colors">
                        {p.variety} {p.color}
                      </p>
                      <p className="text-xs font-bold text-emerald-600">
                        ${price.toFixed(2)}/{unit}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={post.shopLink}
              className="bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-emerald-700 transition-colors text-sm"
            >
              {post.shopLinkLabel}
            </Link>
            <Link
              href="/sample-box"
              className="border border-emerald-600 text-emerald-700 px-5 py-2.5 rounded-lg font-semibold hover:bg-emerald-50 transition-colors text-sm"
            >
              Free Sample Box
            </Link>
          </div>
        </div>
      </section>

      {/* Related posts */}
      {otherPosts.length > 0 && (
        <section className="border-t border-slate-200 bg-slate-50 py-10 sm:py-14">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-xl font-bold text-slate-900 mb-6">
              More guides for florists
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              {otherPosts.map((p) => (
                <Link
                  key={p.slug}
                  href={`/blog/${p.slug}`}
                  className="group block border border-slate-200 bg-white rounded-lg p-4 hover:border-emerald-300 hover:shadow-sm transition-all"
                >
                  <span className="text-xs text-emerald-600 font-medium">
                    {p.category}
                  </span>
                  <h3 className="text-sm font-semibold text-slate-900 mt-1 group-hover:text-emerald-700 transition-colors line-clamp-2">
                    {p.title}
                  </h3>
                  <span className="text-xs text-emerald-600 mt-2 inline-block">
                    Read &rarr;
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
