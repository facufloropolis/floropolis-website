"use client";

import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Heart, Truck, DollarSign, Clock, ArrowRight, CheckCircle2 } from "lucide-react";

export default function ValentinesPage() {
  const trackShopClick = (product: string) => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'valentine_shop_click', {
        product_type: product,
        campaign: 'vday2025',
      });
    }
  };

  const trackSampleClick = () => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'valentine_sample_click', {
        campaign: 'vday2025',
      });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Urgency Banner */}
      <div className="bg-emerald-600 text-white py-3 text-center text-sm font-semibold">
        🌹 Valentine's Day 2026 | Premium varieties selling out fast - Order while supplies last
      </div>

      {/* Hero Section - Compact */}
      <section className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 py-6 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
            Valentine's Roses — 15-40% Off
          </h1>
          <p className="text-lg text-slate-600 mb-4 max-w-2xl mx-auto">
            Premium Ecoroses from Ecuador. Direct to your door in 48-72 hours.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Valentines&tags=Valentines"
              onClick={() => trackShopClick('valentines_all')}
              className="bg-emerald-600 text-white px-8 py-4 text-lg font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl hover:scale-105 inline-flex items-center justify-center gap-2"
            >
              Shop Valentine's Collection
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link
              href="/sample-box"
              onClick={trackSampleClick}
              className="border-2 border-emerald-600 text-emerald-600 px-8 py-4 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all inline-flex items-center justify-center"
            >
              Free Sample Box
            </Link>
          </div>

          {/* Trust Badges - Inline */}
          <div className="flex flex-wrap justify-center items-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <Truck className="w-4 h-4 text-emerald-600" />
              48-72hr Delivery
            </span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              15-40% Below Wholesale
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              Premium Ecoroses
            </span>
          </div>
        </div>
      </section>

      {/* Product Grid */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Valentine's Best Sellers
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Premium varieties at prices that protect your margins
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Product 1: Freedom Red Roses */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/valentines/Freedom.png"
                  alt="Freedom Red Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Freedom Red</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Premium Ecoroses, 50cm stems</p>
                <p className="text-xs text-slate-500 mb-2 italic">Classic Valentine's red</p>
                
                <div className="mb-2 bg-slate-50 p-3 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $1.60-1.70/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$1.45/stem</span>
                    <span className="text-green-600 font-semibold text-sm">Save 15%+</span>
                  </div>
                </div>

                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses&categories=Rose"
                  onClick={() => trackShopClick('freedom_red')}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Freedom Roses →
                </a>
              </div>
            </div>

            {/* Product 2: Pink Floyd Roses */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/valentines/Pink_Floyd.png"
                  alt="Pink Floyd Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Pink Floyd</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Premium Ecoroses, 50cm stems</p>
                <p className="text-xs text-slate-500 mb-2 italic">Dark pink elegance</p>
                
                <div className="mb-2 bg-slate-50 p-3 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $1.25-1.35/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$1.12/stem</span>
                    <span className="text-green-600 font-semibold text-sm">Save 15%+</span>
                  </div>
                </div>

                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses&categories=Rose"
                  onClick={() => trackShopClick('pink_floyd')}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Pink Roses →
                </a>
              </div>
            </div>

            {/* Product 3: Anemones */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/valentines/Anemone_3.png"
                  alt="Anemone Mix - Mistral Red"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Anemone Mix</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Mistral white & red</p>
                <p className="text-xs text-slate-500 mb-2 italic">Unique focal flowers</p>
                
                <div className="mb-2 bg-slate-50 p-3 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $1.50-1.75/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$1.21/stem</span>
                    <span className="text-green-600 font-semibold text-sm">Save 20%+</span>
                  </div>
                </div>

                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_medium=Boton&utm_campaign=Summer%20Flowers&tags=Summer%20Flowers"
                  onClick={() => trackShopClick('anemones')}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Anemones →
                </a>
              </div>
            </div>

            {/* Product 4: Summer Flowers */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/Summer-Flowers-Valentines.png"
                  alt="Summer Flowers - Ranunculus"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Summer Flowers</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Ranunculus, delphinium, unique varieties</p>
                <p className="text-xs text-slate-500 mb-2 italic">Premium seasonal varieties</p>
                
                <div className="mb-2 bg-slate-50 p-3 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500 line-through text-sm">Traditional wholesalers</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">40% Cheaper</span>
                    <span className="text-green-600 font-semibold text-sm">Save 40%</span>
                  </div>
                </div>

                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_medium=Boton&utm_campaign=Summer%20Flowers&tags=Summer%20Flowers"
                  onClick={() => trackShopClick('summer_flowers')}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Shop Summer Flowers →
                </a>
              </div>
            </div>

            {/* Product 5: Greens Bundle */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/valentines/Greens.png"
                  alt="Premium Greens - Bells of Ireland"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Premium Greens</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    40% OFF
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Ruscus, eucalyptus, leatherleaf</p>
                <p className="text-xs text-slate-500 mb-2 italic">Essential fillers</p>
                
                <div className="mb-2 bg-slate-50 p-3 rounded-lg">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $0.35-0.65/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$0.21-0.37</span>
                    <span className="text-green-600 font-semibold text-sm">Up to 40% off</span>
                  </div>
                </div>

                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
                  onClick={() => trackShopClick('greens')}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Greens →
                </a>
              </div>
            </div>

            {/* Product 6: Full Valentine's Collection */}
            <div className="bg-gradient-to-br from-rose-600 to-pink-600 rounded-2xl shadow-xl overflow-hidden hover:shadow-2xl transition-all group text-white">
              <div className="aspect-square relative overflow-hidden">
                <img
                  src="https://images.unsplash.com/photo-1582794543139-8ac9cb0f7b11?w=800&q=80"
                  alt="Best Bouquet - Freedom Red, Premium Greens, Anemone Mix"
                  className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <h3 className="text-2xl font-bold mb-1">Browse Full Collection</h3>
                <p className="mb-1 text-emerald-100 font-semibold">
                  Best Bouquet: Freedom Red + Premium Greens + Anemone Mix
                </p>
                <p className="mb-2 text-emerald-100 text-sm">
                  50+ Valentine's varieties available. Roses, ranunculus, anemones, and more.
                </p>

                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
                  onClick={() => trackShopClick('full_collection')}
                  className="block w-full bg-white text-emerald-600 py-2 px-6 rounded-lg font-bold hover:bg-emerald-50 transition-all text-center group-hover:scale-105"
                >
                  View All Products →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Cheaper Section */}
      <section className="py-8 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold text-slate-900 mb-3">
              Why We're 15-40% Cheaper
            </h2>
            <p className="text-xl text-slate-600">
              It's simple: we eliminate every middleman between the farm and you
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Traditional Wholesale:</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
                  <div>
                    <div className="font-semibold text-slate-900">Farm → Importer</div>
                    <div className="text-slate-600 text-sm">+20% markup</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
                  <div>
                    <div className="font-semibold text-slate-900">Importer → Distributor</div>
                    <div className="text-slate-600 text-sm">+15% markup</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
                  <div>
                    <div className="font-semibold text-slate-900">Distributor → Regional Warehouse</div>
                    <div className="text-slate-600 text-sm">+10% markup</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0 font-bold">4</div>
                  <div>
                    <div className="font-semibold text-slate-900">Warehouse → You</div>
                    <div className="text-slate-600 text-sm">8-10 days old</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 p-8 rounded-2xl border-2 border-emerald-200">
              <h3 className="text-2xl font-bold text-emerald-900 mb-4">Floropolis Direct:</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">✓</div>
                  <div>
                    <div className="font-semibold text-emerald-900">Farm → You</div>
                    <div className="text-emerald-700 text-sm">0% middleman markup</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">✓</div>
                  <div>
                    <div className="font-semibold text-emerald-900">48-72hr delivery</div>
                    <div className="text-emerald-700 text-sm">5-7 days fresher</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">✓</div>
                  <div>
                    <div className="font-semibold text-emerald-900">12-40% lower prices</div>
                    <div className="text-emerald-700 text-sm">Same premium quality</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Inventory Urgency */}
      <section className="py-8 px-4 bg-emerald-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Clock className="w-12 h-12" />
            <h2 className="text-4xl font-bold">Order Early for Best Selection</h2>
          </div>
          <p className="text-xl mb-3 text-emerald-100">
            Premium varieties like Freedom Red and Pink Floyd sell out quickly
          </p>
          <p className="text-lg mb-6 text-emerald-100">
            We source directly from Ecuador farms with limited Valentine's inventory. Once bestsellers are gone, they're gone.
          </p>
          <a
            href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Valentines&tags=Valentines"
            onClick={() => trackShopClick('urgency_cta')}
            className="inline-block bg-white text-emerald-600 px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all shadow-2xl hover:scale-105"
          >
            Secure Your Valentine's Inventory →
          </a>
        </div>
      </section>

      {/* Instagram Section */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-slate-900 mb-3">
            See Our Flowers in Action
          </h2>
          <p className="text-xl text-slate-600 mb-6">
            Follow us on Instagram & TikTok for daily inspiration from professional florists
          </p>
          <div className="flex gap-6 justify-center items-center">
            <a
              href="https://www.instagram.com/floropolisdirect"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block hover:scale-110 transition-transform"
              aria-label="Follow us on Instagram"
            >
              <svg className="w-12 h-12" viewBox="0 0 24 24" fill="url(#instagram-gradient)">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#833AB4" />
                    <stop offset="50%" stopColor="#FD1D1D" />
                    <stop offset="100%" stopColor="#FCAF45" />
                  </linearGradient>
                </defs>
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
            <a
              href="https://www.tiktok.com/@floropolisdirect"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block hover:scale-110 transition-transform"
              aria-label="Follow us on TikTok"
            >
              <svg className="w-12 h-12" viewBox="0 0 24 24" fill="#000000">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-8 px-4 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Not Ready to Order?
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Request a free sample box and see the quality difference for yourself
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sample-box"
              onClick={trackSampleClick}
              className="bg-emerald-600 text-white px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-xl hover:scale-105 inline-flex items-center justify-center"
            >
              Get Free Sample Box
            </Link>
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
              onClick={() => trackShopClick('final_cta')}
              className="border-2 border-emerald-600 text-emerald-600 px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all inline-flex items-center justify-center gap-2"
            >
              Browse Full Catalog
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
