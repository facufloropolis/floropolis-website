"use client";

import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Heart, Truck, DollarSign, ArrowRight, CheckCircle2 } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

export default function ShopPage() {
  const trackShopClick = (e: React.MouseEvent<HTMLAnchorElement>, product: string) => {
    handleOutboundClick(e, CTA_EVENTS.valentine_shop_click, {
      cta_location: "shop_page",
      product_type: product,
    });
  };

  const trackSampleClick = () => {
    pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "shop_page" });
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Announcement Banner */}
      <div className="bg-emerald-600 text-white py-3 text-center text-sm font-semibold">
        🌸 Order by Monday, flowers at your shop by Thursday · Farm direct from Ecuador & Colombia
      </div>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 py-6 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
            Farm-Direct Flowers at Your Door in 4 Days
          </h1>
          <p className="text-lg text-slate-600 mb-2 max-w-2xl mx-auto">
            Roses from $1.30/stem. Tropicals from $0.63/stem. Greens from $0.13/stem. Direct from Ecuador & Colombia farms to your shop.
          </p>
          <p className="text-sm text-slate-500 mb-4">
            Rose prices include delivery. Tropicals, greens & combo boxes ship free.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Collection"
              onClick={(e) => trackShopClick(e, "browse_order")}
              className="bg-emerald-600 text-white px-8 py-4 text-lg font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl hover:scale-105 inline-flex items-center justify-center gap-2"
            >
              Browse & Order
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link
              href="/sample-box"
              onClick={trackSampleClick}
              className="border-2 border-emerald-600 text-emerald-600 px-8 py-4 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all inline-flex items-center justify-center"
            >
              Get a Free Sample Box
            </Link>
          </div>

          {/* Trust Strip */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 justify-items-center text-sm text-slate-500 max-w-2xl mx-auto md:flex md:flex-wrap md:justify-center md:gap-x-2 md:gap-y-0">
            <span>📦 4-Day Delivery</span>
            <span className="text-slate-400 hidden md:inline">·</span>
            <span>🌱 Farm Direct</span>
            <span className="text-slate-400 hidden md:inline">·</span>
            <span>💰 No Middlemen</span>
            <span className="text-slate-400 hidden md:inline">·</span>
            <span>✈️ Free Shipping on Many Items</span>
          </div>
        </div>
      </section>

      {/* Premium Roses */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Premium Roses — 30+ Varieties in Stock
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Ecoroses direct from Ecuador. Same farms that supply the biggest wholesalers — without the middlemen.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Card 1: Freedom Red Rose */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/Freedom.png"
                  alt="Freedom Red Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Freedom Red Rose</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BESTSELLER
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $1.88/stem</p>
                <p className="text-sm text-slate-500 mb-2">60cm · 20 stems/bunch · Price includes delivery</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses"
                  onClick={(e) => trackShopClick(e, "freedom_red")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 2: White Tibet */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/white-tibet-ai.png"
                  alt="White Tibet Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">White Tibet</h3>
                  <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-sm font-semibold">
                    BEST PRICE
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $1.30/stem</p>
                <p className="text-sm text-slate-500 mb-2">40-70cm · 25 stems/bunch · Our lowest-priced rose</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses"
                  onClick={(e) => trackShopClick(e, "white_tibet")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 3: Orange Crush */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/orange-crush-ai.png"
                  alt="Orange Crush Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Orange Crush</h3>
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-semibold">
                    VIBRANT
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $1.45/stem</p>
                <p className="text-sm text-slate-500 mb-2">50-70cm · 25 stems/bunch</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses"
                  onClick={(e) => trackShopClick(e, "orange_crush")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 4: Lavender Deep Purple */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/lavender-deep-purple-ai.png"
                  alt="Lavender Deep Purple Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Lavender Deep Purple</h3>
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                    UNIQUE COLOR
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $1.45/stem</p>
                <p className="text-sm text-slate-500 mb-2">50cm · 25 stems/bunch</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses"
                  onClick={(e) => trackShopClick(e, "lavender_deep_purple")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 5: Pink Faith */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/Pink_Floyd.png"
                  alt="Pink Faith Rose - Premium Ecoroses"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Pink Faith</h3>
                  <span className="bg-pink-100 text-pink-700 px-3 py-1 rounded-full text-sm font-semibold">
                    POPULAR
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $1.52/stem</p>
                <p className="text-sm text-slate-500 mb-2">50-60cm · 25 stems/bunch</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses"
                  onClick={(e) => trackShopClick(e, "pink_faith")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 6: Browse All Roses */}
            <div className="relative rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group flex flex-col justify-center p-6 bg-gradient-to-br from-slate-100 to-slate-200">
              <img src="/images/shop/shop-all-roses.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" aria-hidden />
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">30+ rose varieties in stock</h3>
                <p className="text-slate-600 mb-4">
                  Reds, pinks, whites, lavenders, oranges, bi-colors. 40-70cm. From $1.30/stem delivered.
                </p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Roses"
                  onClick={(e) => trackShopClick(e, "shop_all_roses")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105 mt-auto"
                >
                  Shop All Roses →
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6 max-w-2xl mx-auto">
            Compare: Potomac Floral charges $1.89/stem for Freedom Red 50cm. Floropolis: $1.88/stem for 60cm — longer stems, same price.
          </p>
          <p className="text-center text-sm text-slate-500 mt-2">
            All rose prices include delivery to your door.
          </p>
        </div>
      </section>

      {/* Exotic Tropicals */}
      <section className="py-8 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Exotic Tropicals — Direct from Ecuador's Jungle
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              From Magic Flowers' 80-hectare farms. Gingers, heliconias, anthuriums — flowers most wholesalers can't get. Last 2x longer than traditional cuts. All ship free.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Card 1: Heliconia Fire Opal */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/heliconia-fire-opal.png"
                  alt="Heliconia Fire Opal - Exotic Tropical"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Heliconia Fire Opal</h3>
                  <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-sm font-semibold">
                    $0.93/STEM
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">$0.93/stem</p>
                <p className="text-sm text-slate-500 mb-2">70cm · 5 stems/bunch · Lasts 14+ days · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Tropicals"
                  onClick={(e) => trackShopClick(e, "heliconia_fire_opal")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 2: Heliconia Rostrata */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/heliconia-rostrata.png"
                  alt="Heliconia Rostrata - Exotic Tropical"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Heliconia Rostrata</h3>
                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-semibold">
                    SHOWSTOPPER
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">$2.94/stem</p>
                <p className="text-sm text-slate-500 mb-2">90cm · Iconic hanging tropical · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Tropicals"
                  onClick={(e) => trackShopClick(e, "heliconia_rostrata")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 3: Ginger Nicole */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/ginger-nicole-pink.PNG"
                  alt="Ginger Nicole (Pink) - Exotic Tropical"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Ginger Nicole (Pink)</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    POPULAR
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">$1.94/stem</p>
                <p className="text-sm text-slate-500 mb-2">90cm · 3 stems/bunch · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Tropicals"
                  onClick={(e) => trackShopClick(e, "ginger_nicole")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 4: Anthurium Assorted */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/anthurium-red.jpg"
                  alt="Anthurium Assorted - Exotic Tropical"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Anthurium Assorted</h3>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                    3+ WEEKS VASE LIFE
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $2.72/stem</p>
                <p className="text-sm text-slate-500 mb-2">50cm · 10-14cm heads · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Tropicals"
                  onClick={(e) => trackShopClick(e, "anthurium_assorted")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 5: Novelties & Musas */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/french-kiss.png"
                  alt="Novelties & Musas - Exotic Tropical"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Novelties & Musas</h3>
                  <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-sm font-semibold">
                    RARE FINDS
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">French Kiss $0.63 · Musa $1.18 · Anana $2.12</p>
                <p className="text-sm text-slate-500 mb-2">Unique tropicals your clients have never seen</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Tropicals"
                  onClick={(e) => trackShopClick(e, "novelties_musas")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 6: Browse All Tropicals */}
            <div className="relative rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group flex flex-col justify-center p-6 bg-gradient-to-br from-slate-100 to-slate-200">
              <img src="/images/shop/shop-all-tropicals.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" aria-hidden />
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">16+ tropical varieties in stock</h3>
                <p className="text-slate-600 mb-4">
                  Gingers, heliconias, musas, anthuriums, novelties. From $0.63/stem. All ship free.
                </p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Tropicals"
                  onClick={(e) => trackShopClick(e, "shop_all_tropicals")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105 mt-auto"
                >
                  Shop All Tropicals →
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            All tropical stems and boxes include free shipping.
          </p>
        </div>
      </section>

      {/* Tropical Combo Boxes */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Not Sure Where to Start? Try a Combo Box.
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Pre-designed assorted boxes mixing tropical flowers and greens. One box = instant tropical collection. All ship free.
            </p>
          </div>

          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <table className="w-full min-w-[640px] border border-slate-200 rounded-xl overflow-hidden shadow-lg">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Box Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">What&apos;s Inside</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Stems</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Price/Stem</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">~Box Total</th>
                  <th className="text-left py-3 px-4 font-semibold text-slate-900">Shipping</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-white border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">
                    <span className="inline-flex items-center gap-2">
                      Tabasco
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-semibold">BEST VALUE</span>
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">113</td>
                  <td className="py-3 px-4 text-slate-600">$0.60</td>
                  <td className="py-3 px-4 text-slate-600">~$68</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Mini Fiesta</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">50</td>
                  <td className="py-3 px-4 text-slate-600">$0.75</td>
                  <td className="py-3 px-4 text-slate-600">~$38</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Mini Tabasco</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">66</td>
                  <td className="py-3 px-4 text-slate-600">$0.79</td>
                  <td className="py-3 px-4 text-slate-600">~$52</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Fire</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">51</td>
                  <td className="py-3 px-4 text-slate-600">$0.82</td>
                  <td className="py-3 px-4 text-slate-600">~$42</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Tiki Limbo</td>
                  <td className="py-3 px-4 text-slate-600">Flower Kit</td>
                  <td className="py-3 px-4 text-slate-600">95</td>
                  <td className="py-3 px-4 text-slate-600">$0.84</td>
                  <td className="py-3 px-4 text-slate-600">~$80</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Fiesta</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">52</td>
                  <td className="py-3 px-4 text-slate-600">$0.89</td>
                  <td className="py-3 px-4 text-slate-600">~$46</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Tiki Limbo (Large)</td>
                  <td className="py-3 px-4 text-slate-600">Flower Kit</td>
                  <td className="py-3 px-4 text-slate-600">180</td>
                  <td className="py-3 px-4 text-slate-600">$0.97</td>
                  <td className="py-3 px-4 text-slate-600">~$175</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Capricho</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">41</td>
                  <td className="py-3 px-4 text-slate-600">$1.02</td>
                  <td className="py-3 px-4 text-slate-600">~$42</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-white border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Escarlata</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">41</td>
                  <td className="py-3 px-4 text-slate-600">$1.02</td>
                  <td className="py-3 px-4 text-slate-600">~$42</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-slate-50/50 border-b border-slate-100">
                  <td className="py-3 px-4 text-slate-900 font-medium">Iniziativa</td>
                  <td className="py-3 px-4 text-slate-600">Flowers + Greens</td>
                  <td className="py-3 px-4 text-slate-600">41</td>
                  <td className="py-3 px-4 text-slate-600">$1.02</td>
                  <td className="py-3 px-4 text-slate-600">~$42</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
                <tr className="bg-white">
                  <td className="py-3 px-4 text-slate-900 font-medium">Ginger Mix</td>
                  <td className="py-3 px-4 text-slate-600">Assorted Gingers</td>
                  <td className="py-3 px-4 text-slate-600">24</td>
                  <td className="py-3 px-4 text-slate-600">$2.34</td>
                  <td className="py-3 px-4 text-slate-600">~$56</td>
                  <td className="py-3 px-4"><span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full text-sm font-medium">Free ✅</span></td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-center mt-8">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-ComboBoxes"
              onClick={(e) => trackShopClick(e, "combo_boxes")}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl hover:scale-105"
            >
              Shop Combo Boxes →
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Ready-Made Tropical Bouquets */}
      <section className="py-8 px-4 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Ready-Made Tropical Bouquets
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Pre-designed bouquets straight from the farm. Buy, mark up, and resell — or use as a base for your arrangements. Zero labor. All ship free.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {/* Group 1: Green Bouquets */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Green Bouquets · From $5.85/bunch</h3>
              <ul className="space-y-2 text-slate-600">
                <li className="flex justify-between gap-2"><span>Green Round Emerald</span><span className="font-medium text-slate-900 whitespace-nowrap">$5.85/bunch</span></li>
                <li className="text-sm text-slate-500">11 stems · 60cm</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Green Round Forest</span><span className="font-medium text-slate-900 whitespace-nowrap">$5.85/bunch</span></li>
                <li className="text-sm text-slate-500">11 stems · 60cm</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Green Round Paradise</span><span className="font-medium text-slate-900 whitespace-nowrap">$5.85/bunch</span></li>
                <li className="text-sm text-slate-500">11 stems · 60cm</li>
              </ul>
            </div>

            {/* Group 2: Tropical Bouquets */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Tropical Bouquets · From $8.82/bunch</h3>
              <ul className="space-y-2 text-slate-600">
                <li className="flex justify-between gap-2"><span>Flat Hanna Farm Choice</span><span className="font-medium text-slate-900 whitespace-nowrap">$8.82/bunch</span></li>
                <li className="text-sm text-slate-500">13 stems · 55cm · Assorted</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Red Round Lua Fuego</span><span className="font-medium text-slate-900 whitespace-nowrap">$8.82/bunch</span></li>
                <li className="text-sm text-slate-500">13 stems · 50cm · Red</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Orange Round Confeti</span><span className="font-medium text-slate-900 whitespace-nowrap">$8.96/bunch</span></li>
                <li className="text-sm text-slate-500">13 stems · 50cm · Orange</li>
              </ul>
            </div>

            {/* Group 3: Premium Bouquets */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden p-5">
              <h3 className="text-lg font-bold text-slate-900 mb-3">Premium Bouquets (21 stems) · From $10.19/bunch</h3>
              <ul className="space-y-2 text-slate-600">
                <li className="flex justify-between gap-2"><span>Medium Round Amazon</span><span className="font-medium text-slate-900 whitespace-nowrap">$10.19/bunch</span></li>
                <li className="text-sm text-slate-500">21 stems · 50cm · Assorted</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Medium Round Brushed</span><span className="font-medium text-slate-900 whitespace-nowrap">$10.19/bunch</span></li>
                <li className="text-sm text-slate-500">21 stems · 50cm · Assorted</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Medium Round Confeti</span><span className="font-medium text-slate-900 whitespace-nowrap">$10.19/bunch</span></li>
                <li className="text-sm text-slate-500">21 stems · 50cm · Assorted</li>
                <li className="flex justify-between gap-2 border-t border-slate-100 pt-2 mt-2"><span>Medium Round Fuego</span><span className="font-medium text-slate-900 whitespace-nowrap">$10.36/bunch</span></li>
                <li className="text-sm text-slate-500">21 stems · 50cm · Assorted</li>
              </ul>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 max-w-2xl mx-auto">
            <p className="text-slate-800 font-medium">
              💡 Quick math: Buy 10 Lua Fuego bouquets for $88. Mark up to $25 each → $250 revenue, $162 profit. Zero arranging.
            </p>
          </div>

          <div className="text-center mb-6">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Bouquets"
              onClick={(e) => trackShopClick(e, "bouquets")}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 px-8 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl hover:scale-105"
            >
              Shop Bouquets →
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>

          <p className="text-center text-sm text-slate-500">
            All bouquets include free shipping. Prices per bunch.
          </p>
        </div>
      </section>

      {/* Greens & Foliage */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">
              Greens & Foliage — From $0.13/stem
            </h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Palms, monstera, ferns, philodendrons, pandanus, eucalyptus. Bulk boxes available. All ship free.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Card 1: Willow Greens */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/Greens.png"
                  alt="Willow Greens - Bulk foliage"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Willow Greens</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    FROM $0.13
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">$0.13/stem</p>
                <p className="text-sm text-slate-500 mb-2">90cm · 1,500-2,500 stems/box · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Greens"
                  onClick={(e) => trackShopClick(e, "willow_greens")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 2: Pandanus Green & Variegated */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/pandanus-variegated.jpg"
                  alt="Pandanus Green & Variegated - Foliage"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Pandanus Green & Variegated</h3>
                  <span className="bg-teal-100 text-teal-700 px-3 py-1 rounded-full text-sm font-semibold">
                    TROPICAL ACCENT
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">$0.21/stem</p>
                <p className="text-sm text-slate-500 mb-2">80cm · 1,300-2,500 stems/box · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Greens"
                  onClick={(e) => trackShopClick(e, "pandanus_green_variegated")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 3: Foliage Mix Boxes */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/foliage-mix-box.png"
                  alt="Foliage Mix Boxes - Jungle, Amazon, Greenery"
                  className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Foliage Mix Boxes</h3>
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-semibold">
                    STARTER BOX
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $0.31/stem</p>
                <p className="text-sm text-slate-500 mb-2">Jungle 115 stems · Amazon 90 stems · Greenery 90 stems</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Greens"
                  onClick={(e) => trackShopClick(e, "foliage_mix_boxes")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 4: Palm Areca */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/palm-areca.jpg"
                  alt="Palm Areca - Foliage"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Palm Areca</h3>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $0.39/stem</p>
                <p className="text-sm text-slate-500 mb-2">50-65cm · Up to 6,000 stems/box · Free shipping</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Greens"
                  onClick={(e) => trackShopClick(e, "palm_areca")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 5: Monstera */}
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2">
                <img
                  src="/images/shop/monstera.jpg"
                  alt="Monstera - Iconic Leaf Foliage"
                  className="object-contain w-full h-full group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-2xl font-bold text-slate-900">Monstera</h3>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-semibold">
                    ICONIC LEAF
                  </span>
                </div>
                <p className="text-2xl font-bold text-emerald-600 mb-1">From $1.15/stem</p>
                <p className="text-sm text-slate-500 mb-2">Petite 30cm from $1.15 · Small 50cm from $1.64</p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Greens"
                  onClick={(e) => trackShopClick(e, "monstera")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105"
                >
                  Order Now →
                </a>
              </div>
            </div>

            {/* Card 6: Browse All Greens */}
            <div className="relative rounded-2xl shadow-xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all group flex flex-col justify-center p-6 bg-gradient-to-br from-slate-100 to-slate-200">
              <img src="/images/shop/shop-all-greens.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" aria-hidden />
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">60+ green varieties in stock</h3>
                <p className="text-slate-600 mb-4">
                  Ferns, palms, philodendrons, foliage boxes. From $0.13/stem. All ship free.
                </p>
                <a
                  href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Greens"
                  onClick={(e) => trackShopClick(e, "shop_all_greens")}
                  className="block w-full bg-emerald-600 text-white py-2 px-6 rounded-lg font-bold hover:bg-emerald-700 transition-all text-center group-hover:scale-105 mt-auto"
                >
                  Shop All Greens →
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-sm text-slate-500 mt-6">
            All greens include free shipping.
          </p>
        </div>
      </section>

      {/* How It Works (in-page section for /shop) */}
      <section id="how-it-works" className="py-8 px-4 bg-slate-50 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-10 text-center">
            Order Monday. Flowers at Your Shop by Thursday.
          </h2>

          {/* 4-step timeline: horizontal desktop, vertical mobile */}
          <div className="flex flex-col md:flex-row md:items-stretch gap-6 md:gap-0 mb-12 border-l-2 border-emerald-300 pl-8 md:border-l-0 md:pl-0">
            {/* Step 1 */}
            <div className="relative flex-1 flex flex-col md:text-center p-5 bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="text-2xl mb-2">📋</div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">You Order</h3>
              <p className="text-slate-600 text-sm mb-2">Browse our catalog, pick your flowers, place your order.</p>
              <p className="text-xs font-semibold text-emerald-600">Monday / Tuesday</p>
            </div>
            <div className="hidden md:flex flex-shrink-0 items-center justify-center px-2 text-emerald-500">
              <ArrowRight className="w-8 h-8" />
            </div>
            {/* Step 2 */}
            <div className="relative flex-1 flex flex-col md:text-center p-5 bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="text-2xl mb-2">✂️</div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Farm Picks & Packs</h3>
              <p className="text-slate-600 text-sm mb-2">Your flowers are cut fresh and packed at the farm in Ecuador or Colombia.</p>
              <p className="text-xs font-semibold text-emerald-600">Tuesday / Wednesday</p>
            </div>
            <div className="hidden md:flex flex-shrink-0 items-center justify-center px-2 text-emerald-500">
              <ArrowRight className="w-8 h-8" />
            </div>
            {/* Step 3 */}
            <div className="relative flex-1 flex flex-col md:text-center p-5 bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="text-2xl mb-2">✈️</div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Direct Ship</h3>
              <p className="text-slate-600 text-sm mb-2">FedEx from farm to your door. No warehouse stops, no middlemen.</p>
              <p className="text-xs font-semibold text-emerald-600">Wednesday / Thursday</p>
            </div>
            <div className="hidden md:flex flex-shrink-0 items-center justify-center px-2 text-emerald-500">
              <ArrowRight className="w-8 h-8" />
            </div>
            {/* Step 4 */}
            <div className="relative flex-1 flex flex-col md:text-center p-5 bg-white rounded-xl shadow-lg border border-slate-200">
              <div className="text-2xl mb-2">📦</div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">You Receive</h3>
              <p className="text-slate-600 text-sm mb-2">A fresh box arrives at your shop. 4 days from farm to your cooler.</p>
              <p className="text-xs font-semibold text-emerald-600">Thursday / Friday</p>
            </div>
          </div>

          {/* Two-column comparison */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-slate-100 rounded-2xl p-6 border border-slate-200">
              <h3 className="text-xl font-bold text-slate-900 mb-4">Traditional Wholesale</h3>
              <ul className="space-y-2 text-slate-700">
                <li>Farm → Importer (+20%)</li>
                <li>→ Distributor (+15%)</li>
                <li>→ Regional Warehouse (+10%)</li>
                <li>→ You</li>
              </ul>
              <p className="text-sm text-slate-500 mt-4">8-10 days. 3 middlemen. Each taking a cut.</p>
            </div>
            <div className="bg-emerald-50 rounded-2xl p-6 border-2 border-emerald-200">
              <h3 className="text-xl font-bold text-emerald-900 mb-4">Floropolis</h3>
              <p className="text-emerald-900 font-semibold mb-2">Farm → You</p>
              <p className="text-emerald-800">4 days. 0 middlemen. Same farms, direct prices.</p>
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
              onClick={() => pushEvent(CTA_EVENTS.footer_instagram_click, { cta_location: "shop_page" })}
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
              onClick={() => pushEvent(CTA_EVENTS.footer_tiktok_click, { cta_location: "shop_page" })}
            >
              <svg className="w-12 h-12" viewBox="0 0 24 24" fill="#000000">
                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
              </svg>
            </a>
          </div>
        </div>
      </section>

      {/* Pricing Note */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Real Prices. No Surprises.
          </h2>
          <p className="text-slate-600 leading-relaxed">
            The prices on this page are what you&apos;ll pay. Rose prices include delivery to your door. Tropicals, greens, bouquets, and combo boxes all ship free. We don&apos;t inflate &apos;list prices&apos; to make discounts look bigger. What you see is what you pay. We&apos;re cheaper because we cut out the middlemen, not because of pricing tricks.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-8 px-4 bg-emerald-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Ready to order?
          </h2>
          <p className="text-xl text-emerald-100 mb-8">
            Browse our full catalog — roses, tropicals, greens, bouquets, combo boxes. Place an order today, flowers at your shop in 4 days.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-6">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-Collection"
              onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "shop_final_cta" })}
              className="bg-white text-emerald-600 px-10 py-5 text-lg font-bold rounded-lg hover:bg-emerald-50 transition-all shadow-xl hover:scale-105 inline-flex items-center justify-center gap-2"
            >
              Shop Now →
              <ArrowRight className="w-5 h-5" />
            </a>
            <a
              href="https://wa.me/17869308463"
              onClick={(e) => handleOutboundClick(e, CTA_EVENTS.footer_whatsapp_click, { cta_location: "shop_final_cta" })}
              className="border-2 border-white text-white px-10 py-5 text-lg font-bold rounded-lg hover:bg-white/10 transition-all inline-flex items-center justify-center"
            >
              Talk to Us
            </a>
          </div>
          <Link
            href="/sample-box"
            onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "shop_final_cta" })}
            className="text-emerald-100 hover:text-white underline font-medium"
          >
            Or request a free sample box →
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
