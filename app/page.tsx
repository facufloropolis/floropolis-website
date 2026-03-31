"use client";

import Image from "next/image";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ChevronDown, ArrowRight } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import { getFeaturedProducts } from "@/lib/data/product-helpers";
import { getProductImage } from "@/lib/product-images";

export default function Home() {
  const featured = getFeaturedProducts(4);

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Floropolis",
    url: "https://www.floropolis.com",
    description: "Farm-direct wholesale flowers from Ecuador. 270+ varieties, transparent pricing, no minimum order. Delivery included.",
    sameAs: [
      "https://www.instagram.com/floropolisdirect",
      "https://www.tiktok.com/@floropolisdirect",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "orders@floropolis.com",
      availableLanguage: "English",
    },
  };

  return (
    <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      {/* Hero Section */}
      <section className="relative min-h-[40vh] sm:min-h-[53vh] flex items-center justify-center">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=2000"
            alt="Professional florist arranging fresh flowers"
            fill
            className="object-cover object-center"
            style={{ objectPosition: 'center 38%' }}
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/60"></div>
        </div>
        <div className="relative z-10 max-w-4xl text-center px-6">
          <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-3 sm:mb-4 tracking-tight drop-shadow-2xl">
            Farm-Direct Wholesale Flowers — 270+ Varieties
          </h1>
          {/* EXP-036: Stronger wholesale signal — "no login required" is #1 differentiator vs Koronet */}
          <p className="text-lg sm:text-xl md:text-2xl text-white/90 font-light mb-4 sm:mb-6 max-w-2xl mx-auto">
            270+ varieties with transparent per-stem pricing. No login required to see prices.
          </p>
          {/* EXP-035: Flip CTA hierarchy — catalog/prices is primary for florists in discovery mode, sample box is hesitation handler */}
          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/shop"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3.5 sm:px-10 sm:py-5 text-base sm:text-lg font-semibold rounded-full shadow-2xl hover:scale-105 transition-all inline-flex items-center gap-2"
              onClick={() => pushEvent(CTA_EVENTS.valentine_shop_click, { cta_location: "hero" })}
            >
              See Flowers &amp; Prices
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/sample-box"
              className="border-2 border-white text-white px-6 py-3.5 sm:px-10 sm:py-5 text-base sm:text-lg font-semibold rounded-full hover:bg-white/10 backdrop-blur hover:scale-105 transition-all inline-flex items-center gap-2"
              onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "hero" })}
            >
              Try Free Sample Box
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <ChevronDown className="w-8 h-8 text-white/80" />
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-white border-y border-slate-200 py-4 sm:py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-8">
            <div className="text-center">
              <div className="text-lg sm:text-2xl md:text-3xl font-bold text-emerald-600 mb-1">5-7 Days Fresher</div>
              <div className="text-xs sm:text-sm text-slate-600">direct from farm</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl md:text-3xl font-bold text-emerald-600 mb-1">From $0.60/stem</div>
              <div className="text-xs sm:text-sm text-slate-600">shipping always included</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl md:text-3xl font-bold text-emerald-600 mb-1">4-Day Delivery</div>
              <div className="text-xs sm:text-sm text-slate-600">farm-to-door</div>
            </div>
            <div className="text-center">
              <div className="text-lg sm:text-2xl md:text-3xl font-bold text-emerald-600 mb-1">270+ Varieties</div>
              <div className="text-xs sm:text-sm text-slate-600">roses, tropicals & specialty</div>
            </div>
          </div>
        </div>
      </section>

      {/* Shop Promo Section */}
      <section className="py-10 px-6 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-6xl mx-auto">
          {/* EXP-035: Stronger B2B headline — lead with transparent pricing signal */}
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-2 sm:mb-3">Wholesale Pricing — Transparent, No Login Required</h2>
            <p className="text-base sm:text-xl text-slate-600">Roses, tropicals & specialty stems from Ecuador — shipping included in every price</p>
          </div>

          {/* EXP-073: Visual category cards — replaces text pill quick-links. Larger tap targets + visual hierarchy drive more category exploration clicks. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {[
              { emoji: "🌹", label: "Roses", sub: "Classic & garden", href: "/shop/roses" },
              { emoji: "🌺", label: "Tropicals", sub: "Birds of paradise, heliconias", href: "/shop/tropicals" },
              { emoji: "🌸", label: "Ranunculus", sub: "Spring favorites", href: "/shop?category=Ranunculus" },
              { emoji: "🌿", label: "Greens", sub: "Foliage & fillers", href: "/shop/greens" },
              { emoji: "💝", label: "Mother's Day →", sub: "Order by April 25", href: "/mothers-day-2026" },  // EXP-105: MDY seasonal card — replaces Spring Collection (higher urgency, Apr 25 cutoff)
              { emoji: "🌼", label: "All Varieties →", sub: "270+ varieties in stock", href: "/shop" },
            ].map(({ emoji, label, sub, href }) => (
              <Link
                key={label}
                href={href}
                onClick={() => pushEvent("homepage_category_click", { category: label })}
                className="group flex flex-col items-center text-center gap-1.5 bg-white rounded-2xl border border-slate-200 px-4 py-5 hover:border-emerald-400 hover:shadow-md transition-all"
              >
                <span className="text-3xl">{emoji}</span>
                <span className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors leading-snug">
                  {label}
                </span>
                <span className="text-[11px] text-slate-400 leading-snug">
                  {sub}
                </span>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 mb-8">
            {featured.map((p) => {
              const img = (Array.isArray(p.images) && p.images.length > 0)
                ? ((p.images[0].startsWith("http") || p.images[0].startsWith("/")) ? p.images[0] : `/product-photos/${p.images[0]}`)
                : getProductImage(p.variety, p.color, p.category);
              const displayPrice = p.deal_price ?? p.price;
              const unitLabel = p.unit === "Bunch" ? "bunch" : "stem";
              const displayName = [p.variety, p.color].filter(Boolean).join(" ");
              return (
                <Link
                  key={p.slug}
                  href={`/shop/${encodeURIComponent(p.slug)}`}
                  className="bg-white p-3 md:p-4 rounded-2xl shadow-lg text-center hover:shadow-xl hover:scale-[1.02] transition-all cursor-pointer group"
                >
                  <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-1 md:p-2 mb-2">
                    <img
                      src={img}
                      alt={displayName}
                      className="object-contain w-full h-full group-hover:scale-105 transition-transform"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/Floropolis-logo-only.png"; }}
                    />
                    {p.is_best_seller && (
                      <span className="absolute top-1 left-1 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">Bestseller</span>
                    )}
                    {p.is_on_deal && p.deal_label && (
                      <span className="absolute top-1 right-1 bg-amber-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{p.deal_label}</span>
                    )}
                  </div>
                  <h3 className="text-lg md:text-2xl font-bold text-slate-900 mb-0.5">{displayName}</h3>
                  <p className="text-slate-600 mb-1 text-xs md:text-base">{p.category}</p>
                  <div className="text-xl md:text-3xl font-bold text-emerald-600">
                    ${displayPrice.toFixed(2)}/{unitLabel}
                  </div>
                  {/* EXP-037: Shipping included signal — consistent with shop cards */}
                  {displayPrice > 0 && (
                    <p className="text-[10px] text-emerald-600 mt-0.5">✓ Shipping included</p>
                  )}
                  <span className="text-xs md:text-sm text-emerald-600 font-medium mt-1 inline-block">View Options →</span>
                </Link>
              );
            })}
          </div>
          
          <div className="text-center">
            <Link
              href="/shop"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 text-lg font-bold rounded-lg shadow-xl hover:scale-105 transition-all inline-flex items-center gap-2"
              onClick={() => pushEvent(CTA_EVENTS.valentine_shop_click, { cta_location: "promo_section" })}
            >
              Browse All 270+ Varieties →
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* EXP-037: Sample Box Banner moved below product grid — hesitation handler works after product exposure, not before */}
      <section className="bg-emerald-900 py-4 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-3 text-center sm:text-left">
            <span className="text-2xl hidden sm:block">📦</span>
            <div>
              <p className="text-white font-semibold text-sm sm:text-base">Not ready to commit? Try a free sample box first.</p>
              <p className="text-emerald-200 text-xs sm:text-sm">No credit card · Free shipping · Real farm-direct quality — judge for yourself</p>
            </div>
          </div>
          <Link
            href="/sample-box"
            className="bg-white text-emerald-900 px-5 py-2.5 rounded-full font-bold text-sm whitespace-nowrap hover:bg-emerald-50 transition-colors flex-shrink-0"
            onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "homepage_strip" })}
          >
            Get Free Sample Box →
          </Link>
        </div>
      </section>

      {/* Shop by Color */}
      <section className="py-10 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-2">Shop by Color</h2>
            <p className="text-base sm:text-xl text-slate-600">Find the perfect flowers for your next event</p>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 sm:gap-4 max-w-3xl mx-auto">
            {[
              { name: "Red", color: "bg-red-500", href: "/shop?color=Red" },
              { name: "Pink", color: "bg-pink-400", href: "/shop?color=Pink" },
              { name: "White", color: "bg-white border-2 border-slate-200", href: "/shop?color=White", textDark: true },
              { name: "Yellow", color: "bg-yellow-400", href: "/shop?color=Yellow" },
              { name: "Orange", color: "bg-orange-400", href: "/shop?color=Orange" },
              { name: "Purple", color: "bg-purple-500", href: "/shop?color=Purple" },
              { name: "Blue", color: "bg-blue-500", href: "/shop?color=Blue" },
              { name: "Green", color: "bg-emerald-500", href: "/shop?color=Green" },
              { name: "Mixed", color: "bg-gradient-to-br from-pink-400 via-yellow-300 to-purple-400", href: "/shop?color=Mixed" },
              { name: "All Colors", color: "bg-slate-800", href: "/shop" },
            ].map(({ name, color, href, textDark }) => (
              <Link
                key={name}
                href={href}
                className="group flex flex-col items-center gap-2"
              >
                <div className={`w-14 h-14 sm:w-18 sm:h-18 rounded-full ${color} shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all`} />
                <span className={`text-xs sm:text-sm font-medium ${textDark ? "text-slate-700" : "text-slate-700"} group-hover:text-emerald-600 transition-colors`}>
                  {name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-8 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-2">How It Works</h2>
            <p className="text-base sm:text-xl text-slate-600">Farm-direct from Ecuador to your door in 4 days</p>
          </div>
          
          {/* EXP-083: Added "Submit Quote — We Confirm in 1 Hour" step to show low-risk process */}
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">1</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Browse & Add to Quote</h3>
              <p className="text-slate-600 text-sm">270+ varieties, per-stem pricing — no login</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">2</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Submit — We Confirm in 1 Hour</h3>
              <p className="text-slate-600 text-sm">No commitment. We confirm availability & pricing, Mon–Fri 8–6 ET</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">3</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Farm Picks & Ships</h3>
              <p className="text-slate-600 text-sm">Cut-to-order, climate-controlled via Miami</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">4</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Delivered Fresh in 4 Days</h3>
              <p className="text-slate-600 text-sm">Farm-direct to your door</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-10 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-3">What Florists Say</h2>
          </div>

          {/* Image carousel - real customer photos */}
          <div className="mb-10">
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202025-11-09%20at%2018.21.31.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202025-12-12%20at%2010.04.44%20(2).jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202026-01-30%20at%2010.28.32.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202025-12-12%20at%2010.04.44.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202025-12-12%20at%2010.04.45.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202026-02-01%20at%2010.12.56.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202026-02-01%20at%2010.12.56%20(1).jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/Testimonials/WhatsApp%20Image%202025-11-07%20at%2017.08.07.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
            <p className="text-center text-sm text-slate-500 mt-4 italic">
              Real photos from florists who ordered from us
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"Your prices are fantastic—and I was thrilled to learn shipping is already included!"</p>
              <div className="font-semibold text-slate-900">Michelle T.</div>
              <div className="text-sm text-slate-500">Austin, TX</div>
            </div>

            {/* Testimonial 2 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"I didn&apos;t even realize door delivery was an option—what a game changer! Can&apos;t wait to try the summer flower box!"</p>
              <div className="font-semibold text-slate-900">Sandra K.</div>
              <div className="text-sm text-slate-500">Savannah, GA</div>
            </div>

            {/* Testimonial 3 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"We received the sample pack and the flowers arrived beautifully. We&apos;ve already started using them and they look wonderful."</p>
              <div className="font-semibold text-slate-900">Rachel M.</div>
              <div className="text-sm text-slate-500">Denver, CO</div>
            </div>

            {/* Testimonial 4 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"A major storm delayed our shipment—but the roses and hydrangeas looked like they&apos;d just been cut. That&apos;s when I knew this was different."</p>
              <div className="font-semibold text-slate-900">Christina D.</div>
              <div className="text-sm text-slate-500">Charlotte, NC</div>
            </div>

            {/* Testimonial 5 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"The quality is noticeably better and delivery is fast. I won't go back."</p>
              <div className="font-semibold text-slate-900">Sarah M.</div>
              <div className="text-sm text-slate-500">Bloom & Co., Miami</div>
            </div>

            {/* Testimonial 6 */}
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"No more 4 AM market runs! The flowers arrive fresher than anything I could get locally."</p>
              <div className="font-semibold text-slate-900">David C.</div>
              <div className="text-sm text-slate-500">Petals & Events, LA</div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Badges - below What Florists Say, white background */}
      <section className="py-8 px-6 bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-lg shadow-sm flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-900">FedEx Shipping</div>
                <div className="text-sm text-slate-600">95% on-time SLA</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-lg shadow-sm flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-900">Free Quote Request</div>
                <div className="text-sm text-slate-600">No commitment required</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-lg shadow-sm flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-900">7-Day Guarantee</div>
                <div className="text-sm text-slate-600">Freshness guaranteed</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EXP-085: FAQ — addresses top B2B florist objections before final CTA */}
      <section className="py-10 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 text-center mb-8">
            Common Questions
          </h2>
          <div className="space-y-4">
            {[
              {
                q: "Is there a minimum order?",
                a: "No minimum — order 1 box or 100. We ship to florists of all sizes, from independent studios to event companies."
              },
              {
                q: "How fresh will the flowers be?",
                a: "Cut to order within 24 hours of shipping, direct from Ecuador. No middlemen. Flowers arrive 5–7 days fresher than wholesale market alternatives."
              },
              {
                q: "What if a variety isn't available?",
                a: "We confirm availability within 1 hour (Mon–Fri, 8–6 ET) before any payment. If something is out, we'll offer alternatives or cancel at no charge."
              },
              {
                q: "Do I need to pay upfront?",
                a: "No. Submit a quote request (free), we confirm availability and pricing, then you decide. Payment only happens once you approve the final order."
              },
              {
                q: "What if the flowers don't arrive fresh?",
                a: "We have a 7-day freshness guarantee. If there's a quality issue, message us on WhatsApp with a photo — we'll make it right."
              },
              {
                q: "Can I mix varieties in one order?",
                a: "Yes — each item in your quote can be a different variety, box type, or delivery date. Your cart can hold as many varieties as you need."
              },
            ].map(({ q, a }, i) => (
              <details key={i} className="group border border-slate-200 rounded-xl overflow-hidden">
                <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer list-none hover:bg-slate-50 transition-colors">
                  <span className="font-semibold text-slate-900 text-sm sm:text-base">{q}</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform flex-shrink-0 text-lg">▾</span>
                </summary>
                <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-10 px-6 bg-gradient-to-br from-emerald-600 to-green-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-3 sm:mb-4">
            Ready to Try Farm-Direct?
          </h2>
          {/* EXP-115: MDY seasonal primary CTA on homepage final section — April urgency */}
          <p className="text-emerald-200 mb-3 text-sm">💐 Mother&apos;s Day pre-order cutoff: April 25 — guaranteed May 10 delivery</p>
          <p className="text-base sm:text-xl text-emerald-100 mb-4 sm:mb-6 max-w-2xl mx-auto">
            Get a free sample box and see the quality difference for yourself. No obligation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/mothers-day-2026"
              className="bg-white text-rose-600 px-6 py-3.5 sm:px-10 sm:py-5 rounded-full text-base sm:text-lg font-bold hover:bg-rose-50 hover:scale-105 transition-all shadow-lg"
              onClick={() => pushEvent("mdy_banner_click", { cta_location: "homepage_final" })}
            >
              Shop Mother&apos;s Day →
            </Link>
            <Link
              href="/sample-box"
              className="border-2 border-white text-white px-6 py-3.5 sm:px-10 sm:py-5 rounded-full text-base sm:text-lg font-bold hover:bg-white/10 hover:scale-105 transition-all"
              onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "green_banner" })}
            >
              Get Free Sample Box
            </Link>
          </div>
          {/* EXP-092: WA fallback on final CTA — captures engaged users who prefer chat over forms */}
          <p className="mt-4 text-emerald-200 text-sm">
            Prefer to chat first?{" "}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27m%20interested%20in%20wholesale%20flowers%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("whatsapp_click", { cta_location: "homepage_final_cta" })}
              className="text-white font-semibold underline hover:no-underline"
            >
              Message us on WhatsApp →
            </a>
          </p>
        </div>
      </section>

      <Footer />
    </div>
    </>
  );
}
