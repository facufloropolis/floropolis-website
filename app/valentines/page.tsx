"use client";

import Link from "next/link";
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
      {/* Urgency Banner */}
      <div className="bg-emerald-600 text-white py-3 text-center text-sm font-semibold sticky top-0 z-50">
        🌹 Valentine's Day 2026 | Premium varieties selling out fast - Order while supplies last
      </div>

      {/* Hero Section - Compact */}
      <section className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 py-12 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            Valentine's Roses — 15-40% Off
          </h1>
          <p className="text-lg text-slate-600 mb-6 max-w-2xl mx-auto">
            Premium Ecoroses from Ecuador. Direct to your door in 48-72 hours.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-6">
            <a
              href="https://shop.floropolis.com/762172?tags=Valentines&utm_source=website&utm_campaign=vday2025&utm_content=valentines"
              onClick={() => trackShopClick('valentines_all')}
              className="bg-emerald-600 text-white px-8 py-4 text-lg font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl hover:scale-105 inline-flex items-center justify-center gap-2"
            >
              Shop Valentine's Collection
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link
              href="/sample-box"
              onClick={trackSampleClick}
              className="border-2 border-emerald-600 text-emerald-600 px-8 py-4 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all inline-flex items-center justify-center gap-2"
            >
              Free Sample Box
              <Heart className="w-5 h-5" />
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
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
              Valentine's Best Sellers
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Premium varieties at prices that protect your margins
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Product 1: Freedom Red Roses */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-4">
                <img
                  src="/images/valentines/Freedom.png"
                  alt="Freedom Red Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-900">Freedom Red</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Premium Ecoroses, 50cm stems</p>
                <p className="text-xs text-slate-500 mb-4 italic">Classic Valentine's red</p>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $1.60-1.70/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$1.45/stem</span>
                    <span className="text-green-600 font-semibold text-sm">Save 15%+</span>
                  </div>
                </div>

                <a
                  href="https://shop.floropolis.com/762172?utm_source=website&utm_campaign=vday2025&utm_content=freedom-red&tags=Roses"
                  onClick={() => trackShopClick('freedom_red')}
                  className="block w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Freedom Roses →
                </a>
              </div>
            </div>

            {/* Product 2: Pink Floyd Roses */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-4">
                <img
                  src="/images/valentines/Pink_Floyd.png"
                  alt="Pink Floyd Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-900">Pink Floyd</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Premium Ecoroses, 50cm stems</p>
                <p className="text-xs text-slate-500 mb-4 italic">Dark pink elegance</p>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $1.25-1.35/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$1.12/stem</span>
                    <span className="text-green-600 font-semibold text-sm">Save 15%+</span>
                  </div>
                </div>

                <a
                  href="https://shop.floropolis.com/762172?utm_source=website&utm_campaign=vday2025&utm_content=pink-floyd&tags=Roses"
                  onClick={() => trackShopClick('pink_floyd')}
                  className="block w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Pink Roses →
                </a>
              </div>
            </div>

            {/* Product 3: Anemones */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-4">
                <img
                  src="/images/valentines/Anemone_3.png"
                  alt="Anemone Mix - Mistral Red"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-900">Anemone Mix</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Mistral white & red</p>
                <p className="text-xs text-slate-500 mb-4 italic">Unique focal flowers</p>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $1.50-1.75/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$1.21/stem</span>
                    <span className="text-green-600 font-semibold text-sm">Save 20%+</span>
                  </div>
                </div>

                <a
                  href="https://shop.floropolis.com/762172?tags=Valentines&utm_source=website&utm_campaign=vday2025&utm_content=anemones&categories=Anemone"
                  onClick={() => trackShopClick('anemones')}
                  className="block w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Anemones →
                </a>
              </div>
            </div>

            {/* Product 4: Summer Flowers */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-4">
                <img
                  src="/images/valentines/Summer_Flowers.PNG"
                  alt="Summer Flowers - Ranunculus"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-900">Summer Flowers</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-slate-600 mb-4">Ranunculus, delphinium, unique varieties</p>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">Premium quality</span>
                    <span className="text-2xl font-bold text-emerald-600">Best Value</span>
                  </div>
                </div>

                <a
                  href="https://shop.floropolis.com/762172?tags=Summer+Flowers&utm_source=website&utm_campaign=vday2025&utm_content=summer-flowers"
                  onClick={() => trackShopClick('summer_flowers')}
                  className="block w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Shop Summer Flowers →
                </a>
              </div>
            </div>

            {/* Product 5: Greens Bundle */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-4">
                <img
                  src="/images/valentines/Greens.png"
                  alt="Premium Greens - Bells of Ireland"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold text-slate-900">Premium Greens</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    40% OFF
                  </span>
                </div>
                <p className="text-slate-600 mb-1">Ruscus, eucalyptus, leatherleaf</p>
                <p className="text-xs text-slate-500 mb-4 italic">Essential fillers</p>
                
                <div className="mb-6 bg-slate-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500 line-through text-sm">Wholesale: $0.35-0.65/stem</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold text-emerald-600">$0.21-0.37</span>
                    <span className="text-green-600 font-semibold text-sm">Up to 40% off</span>
                  </div>
                </div>

                <a
                  href="https://shop.floropolis.com/762172?tags=Valentines&utm_source=website&utm_campaign=vday2025&utm_content=greens&colors=Green"
                  onClick={() => trackShopClick('greens')}
                  className="block w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Greens →
                </a>
              </div>
            </div>

            {/* Product 6: Full Valentine's Collection */}
            <div className="bg-gradient-to-br from-rose-600 to-pink-600 rounded-2xl shadow-xl overflow-hidden hover:shadow-2xl transition-all group text-white">
              <div className="aspect-square flex items-center justify-center text-6xl">
                💐
              </div>
              <div className="p-6">
                <h3 className="text-2xl font-bold mb-2">Browse Full Collection</h3>
                <p className="mb-6 text-emerald-100">
                  50+ Valentine's varieties available. Roses, ranunculus, anemones, and more.
                </p>

                <a
                  href="https://shop.floropolis.com/762172?tags=Valentines&utm_source=website&utm_campaign=vday2025&utm_content=full-collection"
                  onClick={() => trackShopClick('full_collection')}
                  className="block w-full bg-white text-emerald-600 py-3 px-6 rounded-lg font-bold hover:bg-emerald-50 transition-all text-center group-hover:scale-105"
                >
                  View All Products →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Cheaper Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">
              Why We're 15-40% Cheaper
            </h2>
            <p className="text-xl text-slate-600">
              It's simple: we eliminate every middleman between the farm and you
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Traditional Wholesale:</h3>
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
              <h3 className="text-2xl font-bold text-emerald-900 mb-6">Floropolis Direct:</h3>
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
      <section className="py-16 px-4 bg-emerald-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Clock className="w-12 h-12" />
            <h2 className="text-4xl font-bold">Order Early for Best Selection</h2>
          </div>
          <p className="text-xl mb-4 text-emerald-100">
            Premium varieties like Freedom Red and Pink Floyd sell out quickly
          </p>
          <p className="text-lg mb-8 text-emerald-100">
            We source directly from Ecuador farms with limited Valentine's inventory. Once bestsellers are gone, they're gone.
          </p>
          <a
            href="https://shop.floropolis.com/762172?tags=Valentines&utm_source=website&utm_campaign=vday2025&utm_content=urgency-cta"
            onClick={() => trackShopClick('urgency_cta')}
            className="inline-block bg-white text-emerald-600 px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all shadow-2xl hover:scale-105"
          >
            Secure Your Valentine's Inventory →
          </a>
        </div>
      </section>

      {/* Instagram Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-slate-900 mb-4">
            See Our Flowers in Action
          </h2>
          <p className="text-xl text-slate-600 mb-8">
            Follow us on Instagram & TikTok for daily inspiration from professional florists
          </p>
          <div className="flex gap-4 justify-center">
            <a
              href="https://www.instagram.com/floropolisdirect"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-4 rounded-lg font-bold hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              @floropolisdirect on Instagram →
            </a>
            <a
              href="https://www.tiktok.com/@floropolisdirect"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-black text-white px-8 py-4 rounded-lg font-bold hover:bg-slate-800 transition-all"
            >
              @floropolisdirect on TikTok →
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Not Ready to Order?
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Request a free sample box and see the quality difference for yourself
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sample-box"
              onClick={trackSampleClick}
              className="bg-emerald-600 text-white px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-xl hover:scale-105 inline-flex items-center justify-center gap-2"
            >
              Get Free Sample Box
              <Heart className="w-5 h-5" />
            </Link>
            <a
              href="https://shop.floropolis.com/762172?tags=Valentines&utm_source=website&utm_campaign=vday2025&utm_content=final-cta"
              onClick={() => trackShopClick('final_cta')}
              className="border-2 border-emerald-600 text-emerald-600 px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all inline-flex items-center justify-center gap-2"
            >
              Browse Full Catalog
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
