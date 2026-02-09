"use client";

import Image from "next/image";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { ChevronDown, ArrowRight } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

export default function Home() {
  const getBoxesShipped = () => {
    const startDate = new Date('2026-02-01');
    const today = new Date();
    const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const dailyIncrease = 3; // +3 boxes per day, forever
    const baseCount = 124;
    return baseCount + (daysSinceStart * dailyIncrease);
  };

  const boxesShipped = getBoxesShipped();

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      {/* Hero Section - ~1/3 smaller, image anchored higher so flowers sit up */}
      <section className="relative min-h-[53vh] flex items-center justify-center">
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
          <h1 className="text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-4 tracking-tight drop-shadow-2xl">
            Farm-Direct Wholesale Flowers
          </h1>
          <p className="text-xl md:text-2xl text-white/90 font-light mb-6 max-w-2xl mx-auto">
            Premium Ecuador roses and summer flowers. 10-40% cheaper than traditional wholesale. Delivered in 48-72 hours.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/shop"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 text-lg font-semibold rounded-full shadow-2xl hover:scale-105 transition-all inline-flex items-center gap-2"
              onClick={() => pushEvent(CTA_EVENTS.valentine_shop_click, { cta_location: "hero" })}
            >
              Shop Flowers
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/sample-box"
              className="border-2 border-white text-white px-10 py-5 text-lg font-semibold rounded-full hover:bg-white/10 backdrop-blur hover:scale-105 transition-all"
              onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "hero" })}
            >
              Get Free Sample Box
            </Link>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <ChevronDown className="w-8 h-8 text-white/80" />
        </div>
      </section>

      {/* Trust Bar */}
      <section className="bg-white border-y border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">5-7 Days Fresher</div>
              <div className="text-sm text-slate-600">vs. traditional wholesale</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">10-40% Cheaper</div>
              <div className="text-sm text-slate-600">by eliminating middlemen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">48-72hr Delivery</div>
              <div className="text-sm text-slate-600">farm-to-door</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">{boxesShipped.toLocaleString()}+ boxes</div>
              <div className="text-sm text-slate-600">with free shipping</div>
            </div>
          </div>
        </div>
      </section>

      {/* Shop Promo Section */}
      <section className="py-10 px-6 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">Premium Roses & Summer Flowers</h2>
            <p className="text-xl text-slate-600">Ecoroses from Ecuador — Order while supplies last</p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-4 rounded-2xl shadow-lg text-center">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2">
                <img
                  src="/images/shop/Freedom.png"
                  alt="Freedom Red Rose"
                  className="object-contain w-full h-full"
                />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Freedom Red</h3>
              <p className="text-slate-600 mb-2">Classic red, 50cm stems</p>
              <div className="text-3xl font-bold text-emerald-600">$1.45/stem</div>
              <div className="text-sm text-slate-500 line-through">Wholesale: $1.60-1.70</div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-lg text-center">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2">
                <img
                  src="/images/shop/Pink_Floyd.png"
                  alt="Pink Floyd Rose"
                  className="object-contain w-full h-full"
                />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Pink Floyd</h3>
              <p className="text-slate-600 mb-2">Dark pink elegance, 50cm stems</p>
              <div className="text-3xl font-bold text-emerald-600">$1.12/stem</div>
              <div className="text-sm text-slate-500 line-through">Wholesale: $1.25-1.35</div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-lg text-center">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2">
                <img
                  src="/images/shop/Ranunculus_White_FINAL.PNG"
                  alt="Premium white ranunculus with elegant layered blooms"
                  className="object-contain w-full h-full"
                />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Premium Ranunculus</h3>
              <p className="text-slate-600 mb-2">Ecuador ranunculus, multiple colors</p>
              <div className="text-3xl font-bold text-emerald-600">From $1.21/stem</div>
              <div className="text-sm text-slate-500 line-through">Wholesale: $1.51+</div>
              <div className="text-emerald-600 font-semibold text-lg mt-1">Up to 40% cheaper</div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-lg text-center">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2">
                <img
                  src="/images/shop/Eucalyptus_Silve_Dollar_Green_FINAL.jpg"
                  alt="Eucalyptus Silver Dollar greenery"
                  className="object-contain w-full h-full"
                />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Eucalyptus Silver Dollar</h3>
              <p className="text-slate-600 mb-2">Premium greenery, 8-10 stems/bunch</p>
              <div className="text-3xl font-bold text-emerald-600">$0.37/stem</div>
              <div className="text-sm text-slate-500 line-through">Wholesale: $0.61</div>
              <div className="text-emerald-600 font-semibold text-lg mt-1">39% cheaper</div>
            </div>
          </div>
          
          <div className="text-center">
            <Link
              href="/shop"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 text-lg font-bold rounded-lg shadow-xl hover:scale-105 transition-all inline-flex items-center gap-2"
              onClick={() => pushEvent(CTA_EVENTS.valentine_shop_click, { cta_location: "promo_section" })}
            >
              Shop Flowers Collection
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-8 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-6">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-2">How It Works</h2>
            <p className="text-xl text-slate-600">From Ecuador farm to your door in 48-72 hours</p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">1</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Browse & Order</h3>
              <p className="text-slate-600 text-sm">Shop our catalog with real-time inventory</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">2</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Farm Picks Fresh</h3>
              <p className="text-slate-600 text-sm">Cut and packed within 24 hours</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">3</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Direct Flight</h3>
              <p className="text-slate-600 text-sm">Shipped via Miami, climate-controlled</p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-2xl font-bold text-emerald-600">4</span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Delivered Fresh</h3>
              <p className="text-slate-600 text-sm">To your door in 48-72 hours</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-10 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">What Florists Say</h2>
          </div>

          {/* Image carousel - real customer photos */}
          <div className="mb-10">
            <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202025-11-09%20at%2018.21.31.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202025-12-12%20at%2010.04.44%20(2).jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202026-01-30%20at%2010.28.32.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202025-12-12%20at%2010.04.44.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202025-12-12%20at%2010.04.45.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202026-02-01%20at%2010.12.56.jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202026-02-01%20at%2010.12.56%20(1).jpeg"
                    alt="Customer photo"
                    className="object-cover w-full h-full"
                    loading="lazy"
                  />
                </div>
              </div>
              <div className="flex-none w-64 snap-center">
                <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                  <img
                    src="/images/TESTIMONIALS/WhatsApp%20Image%202025-11-07%20at%2017.08.07.jpeg"
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
              <p className="text-slate-600 mb-4 italic">"Switching to Floropolis cut my flower costs by 20% and the quality is noticeably better."</p>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-semibold text-slate-900">Secure Checkout</div>
                <div className="text-sm text-slate-600">256-bit SSL encryption</div>
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

      {/* Final CTA */}
      <section className="py-10 px-6 bg-gradient-to-br from-emerald-600 to-green-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Ready to Try Farm-Direct?
          </h2>
          <p className="text-xl text-emerald-100 mb-6 max-w-2xl mx-auto">
            Get a free sample box and see the quality difference for yourself. No obligation.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sample-box"
              className="bg-white text-emerald-600 px-10 py-5 rounded-full text-lg font-bold hover:bg-emerald-50 hover:scale-105 transition-all shadow-lg"
              onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "green_banner" })}
            >
              Get Free Sample Box
            </Link>
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
              className="border-2 border-white text-white px-10 py-5 rounded-full text-lg font-bold hover:bg-white/10 hover:scale-105 transition-all"
              onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "green_banner" })}
            >
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
