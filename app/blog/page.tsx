import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { blogPosts } from "@/lib/data/blog-posts";

const CATEGORY_COLORS: Record<string, string> = {
  Roses: "bg-rose-100 text-rose-700",
  Ranunculus: "bg-pink-100 text-pink-700",
  Anemone: "bg-purple-100 text-purple-700",
  Tropicals: "bg-orange-100 text-orange-700",
  Greens: "bg-emerald-100 text-emerald-700",
  Delphinium: "bg-blue-100 text-blue-700",
  Gypsophila: "bg-slate-100 text-slate-700",
  "Garden Roses": "bg-rose-100 text-rose-700",
  "Business Guides": "bg-amber-100 text-amber-700",
  "Seasonal Flowers": "bg-yellow-100 text-yellow-700",
};

function categoryClass(cat: string) {
  return CATEGORY_COLORS[cat] ?? "bg-slate-100 text-slate-600";
}

export const metadata = {
  title: "Wholesale Flower Guides for Florists | Floropolis",
  description:
    "Care guides, buying guides, and business tips for professional florists. Sourcing, conditioning, and design — from Ecuador farms to your shop.",
};

export default function BlogIndexPage() {
  const sorted = [...blogPosts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const categories = Array.from(new Set(sorted.map((p) => p.category))).sort();

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
            Florist Guides &amp; Resources
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Care guides, sourcing tips, and business advice for wholesale flower buyers — written by florists, for florists.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 justify-center mb-10">
          {categories.map((cat) => (
            <span key={cat} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${categoryClass(cat)}`}>
              {cat}
            </span>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sorted.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white hover:shadow-lg hover:border-emerald-300 transition-all overflow-hidden"
            >
              <div className="p-5 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${categoryClass(post.category)}`}>
                    {post.category}
                  </span>
                  <span className="text-[11px] text-slate-400">{post.readingTime}</span>
                </div>
                <h2 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug mb-2 flex-1">
                  {post.title}
                </h2>
                <p className="text-sm text-slate-500 line-clamp-2 mb-3">{post.metaDescription}</p>
                <span className="text-xs font-semibold text-emerald-600 group-hover:underline">
                  Read guide &#x2192;
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-16 text-center bg-emerald-50 rounded-2xl border border-emerald-200 px-6 py-10">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Ready to order farm-direct?</h2>
          <p className="text-slate-600 mb-6 max-w-md mx-auto">270+ varieties, transparent pricing, no minimum order. Shipping always included.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/shop" className="bg-emerald-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors">
              Browse All Varieties &#x2192;
            </Link>
            <Link href="/sample-box" className="border-2 border-emerald-600 text-emerald-700 px-8 py-3 rounded-lg font-bold hover:bg-emerald-50 transition-colors">
              Get Free Sample Box
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
