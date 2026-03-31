import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ArrowRight, Truck, Leaf, Package, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Wholesale Anemone — Farm-Direct | Floropolis",
  description:
    "Professional florists: farm-direct anemone from $1.16/stem. 39% below leading B2B suppliers. True blue for MDY. Free delivery. No minimums.",
  openGraph: {
    title: "Wholesale Anemone — Farm-Direct from Ecuador | Floropolis",
    description:
      "From $1.16/stem delivered. True blue anemone for Mother's Day. 39% below PetalJet. PetalJet MDY closed — we still have stock.",
    images: ["/images/shop/anemone/anemones-blue.png"],
  },
};

const SHOP_URL =
  "/shop?category=Anemone&utm_source=seo&utm_medium=organic&utm_campaign=wholesale-anemone";
const MDY_URL = "/mothers-day-2026"; // EXP-112: Updated from /contact to dedicated MDY page

const GALLERY_IMAGES = [
  { src: "/images/shop/anemone/anemones-blue.png", alt: "wholesale anemone blue mariane farm-direct ecuador", label: "Blue Mariane" },
  { src: "/images/shop/anemone/anemones-white.png", alt: "wholesale anemone white farm-direct", label: "White" },
  { src: "/images/shop/anemone/anemones-pink.png", alt: "wholesale anemone pink farm-direct", label: "Pink" },
  { src: "/images/shop/anemone/anemones-red.png", alt: "wholesale anemone red farm-direct", label: "Red" },
  { src: "/images/shop/anemone/anemones-fucsia.png", alt: "wholesale anemone fuchsia farm-direct", label: "Fuchsia" },
  { src: "/images/shop/anemone/full-star-blue.png", alt: "wholesale anemone full star blue farm-direct", label: "Full Star Blue" },
];

const TRUST_POINTS = [
  { icon: Truck, text: "Delivery included in every price — no hidden fees" },
  { icon: Leaf, text: "Andean highlands, Ecuador — 2,800-3,500m. Strong stems, vivid color." },
  { icon: Package, text: "No minimums — order exactly what you need" },
  { icon: Clock, text: "MDY stock available — PetalJet's allocation closed. Ours is open." },
];

export default function WholesaleAnemone() {
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <section className="py-10 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 mb-3">
            Farm-Direct · True Blue Available · MDY Stock Open
          </p>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">
            Wholesale Anemone —<br className="hidden md:block" /> Farm-Direct from Ecuador
          </h1>
          <p className="text-xl text-slate-600 mb-6 max-w-2xl mx-auto">
            Including true blue for Mother's Day. Starting at $1.16/stem with delivery included. 39% below leading B2B suppliers.
          </p>
          <div className="inline-block bg-emerald-50 border border-emerald-200 rounded-2xl px-8 py-5 mb-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-8">
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-700">From $1.16</p>
                <p className="text-sm text-slate-600">per stem · delivered</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-emerald-200" />
              <div className="text-center">
                <p className="text-lg font-semibold text-slate-500 line-through">$1.90–$2.12</p>
                <p className="text-sm text-slate-500">typical B2B wholesale</p>
              </div>
              <div className="hidden sm:block w-px h-10 bg-emerald-200" />
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-700">39%</p>
                <p className="text-sm text-slate-600">below market</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-amber-700 font-medium mb-6">
            PetalJet's Mother's Day anemone allocation closed. We still have stock. Order by May 4.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={SHOP_URL} className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold text-base hover:bg-emerald-700 transition-colors">
              See All Anemone Availability
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/sample-box" className="inline-flex items-center justify-center gap-2 border border-slate-300 text-slate-700 px-8 py-4 rounded-lg font-semibold text-base hover:bg-slate-50 transition-colors">
              Try a Free Sample Box
            </Link>
          </div>
        </div>
      </section>

      <section className="py-10 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {GALLERY_IMAGES.map((img) => (
              <div key={img.src} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-slate-100 group">
                <Image src={img.src} alt={img.alt} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 768px) 50vw, 33vw" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 to-transparent p-3">
                  <p className="text-white text-xs font-medium">{img.label}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-slate-500 mt-4">
            Blue, White, Pink, Red, Fuchsia, Full Star, and more ·{" "}
            <Link href={SHOP_URL} className="text-emerald-600 hover:underline font-medium">Browse full anemone catalog →</Link>
          </p>
        </div>
      </section>

      <section className="py-8 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
          {TRUST_POINTS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-start gap-3 bg-white rounded-xl p-4 shadow-sm">
              <Icon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-slate-700">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-10 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-5 text-center">Save $88–$115 Per Box vs. B2B Suppliers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left px-4 py-3 font-semibold text-slate-700 rounded-tl-lg" />
                  <th className="px-4 py-3 font-semibold text-emerald-700 text-center">Floropolis</th>
                  <th className="px-4 py-3 font-semibold text-slate-500 text-center rounded-tr-lg">Leading B2B Suppliers</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["100 stems", "$116", "$190–$212"],
                  ["120-stem EB box", "$139.20", "$228–$254"],
                  ["Per-stem price", "$1.16", "$1.90–$2.12"],
                  ["Delivery", "Included ✓", "Included"],
                  ["Your savings (EB box)", "—", "$88–$115 per box"],
                ].map(([label, ours, theirs], i) => (
                  <tr key={label} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                    <td className="px-4 py-3 text-slate-600 font-medium">{label}</td>
                    <td className="px-4 py-3 text-center font-bold text-emerald-700">{ours}</td>
                    <td className="px-4 py-3 text-center text-slate-500">{theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="py-8 px-4 bg-amber-50 border-y border-amber-200">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-2">Mother's Day — May 11</p>
          <h2 className="text-xl font-bold text-slate-900 mb-2">True Blue for Mother's Day — Order by May 4</h2>
          <p className="text-slate-600 text-sm mb-2 max-w-xl mx-auto">
            Blue anemone is one of the few true blues available for Mother's Day bouquets. Most florists can't find it. PetalJet's MDY allocation closed. We have stock.
          </p>
          <p className="text-slate-500 text-xs mb-4">Strong stock available now — order cutoff May 4 for guaranteed May 11 arrival.</p>
          <Link href={MDY_URL} className="inline-flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-lg font-semibold text-sm hover:bg-amber-700 transition-colors">
            Reserve MDY Anemone →
          </Link>
        </div>
      </section>

      <section className="py-12 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">Why Blue Anemone Is Worth Finding</h2>
          <p className="text-slate-600 leading-relaxed mb-6">
            Most Mother's Day flowers are pink, red, or white. True blue is rare — and that rarity commands a premium retail price. Blue anemone's poppy-like center with deep blue petals creates dramatic contrast in mixed bouquets, giving your arrangements a distinctive look that clients notice and remember.
          </p>
          <p className="text-slate-600 leading-relaxed mb-8">
            The challenge is sourcing it. Most B2B distributors don't stock blue anemone consistently, and when they do, the price reflects scarcity. At Floropolis, our Blue Mariane anemone is sourced direct from Ecuador and priced at $1.16/stem — 39% below what leading B2B suppliers charge, with delivery already included.
          </p>

          <div className="bg-emerald-50 rounded-xl p-6 mb-8">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Grown in Ecuador's Andean Highlands at Altitude</h3>
            <p className="text-slate-600 text-sm leading-relaxed">
              Our anemones are grown at 2,800–3,500m in the Ecuadorian Andes. Cool nights at altitude slow growth and produce strong stems with vivid color. The result: anemones that hold their shape and color for 5–7 days in your clients' arrangements. Ask your current supplier where their anemone is grown. Most can't tell you.
            </p>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-4">Available Colors</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {["Blue Mariane", "White", "Pink", "Red", "Fuchsia", "Full Star Blue", "Full Star White", "Full Star Red", "Assorted"].map((color) => (
              <div key={color} className="bg-slate-50 rounded-lg px-3 py-2.5 text-sm text-slate-700 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                {color}
              </div>
            ))}
          </div>

          <div className="text-center mb-8">
            <Link href={SHOP_URL} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-colors">
              Browse all anemone varieties
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-4">How to Order</h2>
          <ol className="space-y-3 mb-8">
            {[
              "Browse our anemone catalog — Blue Mariane is the MDY hero variety",
              "Select your box size (EB = 120 stems)",
              "Submit a quote — we confirm within 1 hour (Mon–Fri, 8AM–6PM ET)",
              "No minimum order. FedEx air — delivery cost included in per-stem price.",
            ].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-slate-600 text-sm">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-12 px-4 bg-emerald-700">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Ready to order farm-direct anemone?</h2>
          <p className="text-emerald-200 mb-6 text-sm">Including true blue · From $1.16/stem delivered · 39% below market · No minimums</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href={SHOP_URL} className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 px-8 py-4 rounded-lg font-bold hover:bg-emerald-50 transition-colors">
              Shop Anemone
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/quote" className="inline-flex items-center justify-center gap-2 border border-emerald-400 text-white px-8 py-4 rounded-lg font-semibold hover:bg-emerald-600 transition-colors">
              Request a quote
            </Link>
          </div>          {/* EXP-099/100/101: WA escape hatch — server component, no onClick tracking */}
          <p className="mt-5 text-emerald-200 text-sm">
            Prefer to chat first?{" "}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27d%20like%20to%20know%20more%20about%20wholesale%20anemone%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              className="text-white font-semibold underline hover:no-underline"
            >
              Message us on WhatsApp →
            </a>
          </p>
        </div>
      </section>

      <section className="py-6 px-4 bg-white border-t border-slate-100">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-4 justify-center text-sm">
          <Link href="/wholesale-delphiniums" className="text-slate-500 hover:text-emerald-600">Wholesale Delphiniums</Link>
          <span className="text-slate-200">|</span>
          <Link href="/wholesale-ranunculus" className="text-slate-500 hover:text-emerald-600">Wholesale Ranunculus</Link>
          <span className="text-slate-200">|</span>
          <Link href="/sample-box" className="text-slate-500 hover:text-emerald-600">Try a Free Sample Box</Link>
          <span className="text-slate-200">|</span>
          <Link href="/shop" className="text-slate-500 hover:text-emerald-600">Browse Full Catalog</Link>
          <span className="text-slate-200">|</span>
          <Link href="/contact" className="text-slate-500 hover:text-emerald-600">Questions? Contact Us</Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
