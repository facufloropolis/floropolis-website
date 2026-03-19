import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { CheckCircle, ArrowRight, Truck, Leaf, Package } from "lucide-react";

export const metadata: Metadata = {
  title: "Wholesale Delphiniums — Farm-Direct | Floropolis",
  description:
    "Professional florists: farm-direct delphiniums from $1.22/stem. 53+ varieties. Free delivery. 31% below major B2B suppliers. No minimums.",
  openGraph: {
    title: "Wholesale Delphiniums — Farm-Direct from Ecuador | Floropolis",
    description:
      "53 delphinium varieties. From $1.22/stem delivered. 31% below PetalJet and BloomsByTheBox. No minimums.",
    images: ["/images/shop/delphinium/sky-waltz-light-blue.png"],
  },
};

const SHOP_URL =
  "/shop?category=Delphinium&utm_source=seo&utm_medium=organic&utm_campaign=wholesale-delphiniums";

const GALLERY_IMAGES = [
  {
    src: "/images/shop/delphinium/sky-waltz-light-blue.png",
    alt: "wholesale delphinium Sky Waltz light blue farm-direct",
    label: "Sky Waltz Light Blue",
  },
  {
    src: "/images/shop/delphinium/blue-bird.png",
    alt: "wholesale delphinium Blue Bird blue farm-direct",
    label: "Blue Bird Blue",
  },
  {
    src: "/images/shop/delphinium/galahad-white.png",
    alt: "wholesale delphinium Galahad white farm-direct",
    label: "Galahad White",
  },
  {
    src: "/images/shop/delphinium/summer-skies.png",
    alt: "wholesale delphinium Summer Skies farm-direct",
    label: "Summer Skies",
  },
  {
    src: "/images/shop/delphinium/bella-andes-white.png",
    alt: "wholesale delphinium Bella Andes white farm-direct",
    label: "Bella Andes White",
  },
  {
    src: "/images/shop/delphinium/astolat.png",
    alt: "wholesale delphinium Astolat pink farm-direct",
    label: "Astolat Pink",
  },
];

const TRUST_POINTS = [
  { icon: Truck, text: "Delivery included in every price — no hidden fees" },
  { icon: Leaf, text: "Farm-direct from Ecuador — 14-day vase life" },
  { icon: Package, text: "No minimums — order exactly what you need" },
  { icon: CheckCircle, text: "53+ varieties — widest delphinium selection online" },
];

export default function WholesaleDelphiniums() {
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      {/* Hero */}
      <section className="py-10 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
            Farm-Direct · Free Delivery · No Minimums
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">
            Wholesale Delphiniums —<br className="hidden md:block" /> Farm-Direct from Ecuador
          </h1>
          <p className="text-xl text-slate-600 mb-6 max-w-2xl mx-auto">
            53 varieties. Professional wholesale pricing with delivery already included.
          </p>

          {/* Price callout */}
          <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-2xl px-8 py-5 mb-8">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-700">From $1.22</p>
                <p className="text-sm text-slate-600">per stem · delivered</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-emerald-200" />
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-500 line-through">$1.78–$1.95</p>
                <p className="text-sm text-slate-500">typical B2B wholesale</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-emerald-200" />
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-700">31%</p>
                <p className="text-sm text-slate-600">below market</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={SHOP_URL}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold text-base hover:bg-emerald-700 transition-colors"
            >
              Shop Delphiniums
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/sample-box"
              className="inline-flex items-center justify-center gap-2 border border-slate-300 text-slate-700 px-8 py-4 rounded-lg font-semibold text-base hover:bg-slate-50 transition-colors"
            >
              Try a Free Sample Box
            </Link>
          </div>
        </div>
      </section>

      {/* Photo gallery */}
      <section className="py-10 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {GALLERY_IMAGES.map((img) => (
              <div key={img.src} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 group">
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                  sizes="(max-width: 768px) 50vw, 33vw"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-3">
                  <p className="text-white text-xs font-medium">{img.label}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-500 mt-4">
            53+ varieties available ·{" "}
            <Link href={SHOP_URL} className="text-emerald-600 hover:underline font-medium">
              Browse full catalog →
            </Link>
          </p>
        </div>
      </section>

      {/* Trust points */}
      <section className="py-8 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TRUST_POINTS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-start gap-3 bg-white rounded-xl p-4 shadow-sm">
                <Icon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Body copy */}
      <section className="py-12 px-4 bg-white">
        <div className="max-w-3xl mx-auto prose prose-slate prose-lg">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Why Professional Florists Choose Farm-Direct Delphiniums
          </h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            Delphiniums are one of the most versatile varieties a professional florist can stock.
            From wedding arrangements to everyday bouquets, their tall spikes add height and color
            that few flowers match. The challenge is sourcing them at a price that leaves room for
            a real margin.
          </p>
          <p className="text-slate-600 leading-relaxed mb-8">
            Most florists pay $1.78 to $2.50 per stem when buying from B2B wholesale distributors.
            At Floropolis, our delphiniums start at $1.22 per stem — farm-direct with delivery
            already included in the price.
          </p>

          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            Farm-Direct Pricing: What That Means for Your Business
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            When you buy from a distributor, you're paying for the farm's price plus the
            distributor's margin plus shipping. Farm-direct eliminates the middle layer. Our
            delphiniums go from the farms in Ecuador directly to your shop. The delivery cost is
            already in the per-stem price you see — no surprises at checkout.
          </p>

          {/* Savings table */}
          <div className="bg-emerald-50 rounded-xl p-5 mb-8 not-prose">
            <p className="text-sm font-semibold text-slate-700 mb-3">
              For a 100-stem order:
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center py-2 border-b border-emerald-200">
                <span className="text-slate-600">Floropolis (100 stems × $1.22, delivery included)</span>
                <span className="font-bold text-emerald-700">~$122</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-emerald-200">
                <span className="text-slate-600">Typical B2B wholesale (same 100 stems)</span>
                <span className="font-bold text-slate-600">$178–$195</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="font-semibold text-emerald-700">Your savings per 100-stem box</span>
                <span className="font-bold text-emerald-700">$56–$73</span>
              </div>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-4">
            53 Varieties — The Most Extensive Delphinium Selection Online
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            We carry 53+ Delphinium SKUs — varieties organized by color, stem length, and growing
            season. Whether you need Sky Waltz Light Blue (60–70cm), Magic Fountain White, or a
            specific color to match a wedding palette, we have it.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 not-prose">
            {[
              { label: "By Color", items: ["Blue", "White", "Purple", "Pink", "Mixed"] },
              { label: "By Stem Length", items: ["50cm", "60cm", "70cm", "80cm", "90cm"] },
              { label: "Box Sizes", items: ["Quarter Box", "Half Box", "Full Box"] },
            ].map(({ label, items }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{label}</p>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item} className="text-sm text-slate-700 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="text-center not-prose mb-8">
            <Link
              href={SHOP_URL}
              className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
            >
              Browse all 53 Delphinium varieties
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-4">How to Order</h2>
          <ol className="space-y-3 mb-8 not-prose">
            {[
              "Browse our delphinium catalog — filter by color or stem length",
              "Select your variety and box size",
              "Submit a quote — we confirm within 1 hour (Mon–Fri, 8AM–6PM ET)",
              "No minimum order requirement. Delivery included — ships from Ecuador weekly.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-slate-600 text-sm">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-12 px-4 bg-emerald-700">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            Ready to order farm-direct delphiniums?
          </h2>
          <p className="text-emerald-200 mb-6 text-sm">
            53 varieties · From $1.22/stem delivered · No minimums
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href={SHOP_URL}
              className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 px-8 py-4 rounded-lg font-bold hover:bg-emerald-50 transition-colors"
            >
              Shop Delphiniums
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/quote"
              className="inline-flex items-center justify-center gap-2 border border-emerald-400 text-white px-8 py-4 rounded-lg font-semibold hover:bg-emerald-600 transition-colors"
            >
              Request a quote
            </Link>
          </div>
        </div>
      </section>

      {/* Internal links footer */}
      <section className="py-6 px-4 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-4 justify-center text-sm">
          <Link href="/sample-box" className="text-slate-500 hover:text-emerald-600">
            Try a Free Sample Box
          </Link>
          <span className="text-slate-200">|</span>
          <Link href="/shop" className="text-slate-500 hover:text-emerald-600">
            Browse Full Catalog
          </Link>
          <span className="text-slate-200">|</span>
          <Link href="/how-it-works" className="text-slate-500 hover:text-emerald-600">
            How It Works
          </Link>
          <span className="text-slate-200">|</span>
          <Link href="/contact" className="text-slate-500 hover:text-emerald-600">
            Questions? Contact Us
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
