"use client";

import Image from "next/image";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { ChevronDown, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Valentine's Banner */}
      <div className="bg-emerald-600 text-white py-3 text-center text-sm font-semibold tracking-wide">
        🌹 Valentine's Day 2026 - Premium roses 15-40% off wholesale | <Link href="/valentines" className="underline hover:no-underline">Shop Now →</Link>
      </div>

      <Navigation />

      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center">
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=2000"
            alt="Professional florist arranging fresh flowers"
            fill
            className="object-cover"
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
            Premium Ecuador roses and summer flowers. 15-40% cheaper than traditional wholesale. Delivered in 48-72 hours.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/valentines" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 text-lg font-semibold rounded-full shadow-2xl hover:scale-105 transition-all inline-flex items-center gap-2">
              Shop Valentine's
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/sample-box" className="border-2 border-white text-white px-10 py-5 text-lg font-semibold rounded-full hover:bg-white/10 backdrop-blur hover:scale-105 transition-all">
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
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">15-40% Cheaper</div>
              <div className="text-sm text-slate-600">by eliminating middlemen</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">48-72hr Delivery</div>
              <div className="text-sm text-slate-600">farm-to-door</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-bold text-emerald-600 mb-2">FREE Shipping</div>
              <div className="text-sm text-slate-600">on orders over $150</div>
            </div>
          </div>
        </div>
      </section>

      {/* Valentine's Promo Section */}
      <section className="py-10 px-6 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">Valentine's Day 2026</h2>
            <p className="text-xl text-slate-600">Premium Ecoroses from Ecuador — Order while supplies last</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            <div className="bg-white p-4 rounded-2xl shadow-lg text-center">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2">
                <img
                  src="/images/valentines/Freedom.png"
                  alt="Freedom Red Rose"
                  className="object-contain w-full h-full"
                />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Freedom Red</h3>
              <p className="text-slate-600 mb-2">Classic Valentine's red, 50cm stems</p>
              <div className="text-3xl font-bold text-emerald-600">$1.45/stem</div>
              <div className="text-sm text-slate-500 line-through">Wholesale: $1.60-1.70</div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-lg text-center">
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2">
                <img
                  src="/images/valentines/Pink_Floyd.png"
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
              <div className="aspect-square relative overflow-hidden bg-white flex items-center justify-center p-2 mb-2" style={{ backgroundColor: '#ffffff' }}>
                <img
                  src="/images/Summer-Flowers-Valentines.png"
                  alt="Summer Flowers"
                  className="object-contain w-full h-full"
                  style={{ backgroundColor: '#ffffff' }}
                />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-1">Summer Flowers</h3>
              <p className="text-slate-600 mb-2">Ranunculus, delphinium, unique varieties</p>
              <div className="text-3xl font-bold text-emerald-600">40% Cheaper</div>
              <div className="text-sm text-slate-500 line-through">vs. traditional wholesalers</div>
            </div>
          </div>
          
          <div className="text-center">
            <Link href="/valentines" className="bg-emerald-600 hover:bg-emerald-700 text-white px-10 py-5 text-lg font-bold rounded-lg shadow-xl hover:scale-105 transition-all inline-flex items-center gap-2">
              Shop Valentine's Collection
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
          
          <div className="grid md:grid-cols-3 gap-8">
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
            <div className="bg-white p-8 rounded-2xl shadow-md">
              <div className="flex mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                    <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z"/>
                  </svg>
                ))}
              </div>
              <p className="text-slate-600 mb-4 italic">"The sample box sold me immediately. These roses are stunning and my margins have improved."</p>
              <div className="font-semibold text-slate-900">Jennifer T.</div>
              <div className="text-sm text-slate-500">Garden Gate, Austin</div>
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
            <Link href="/sample-box" className="bg-white text-emerald-600 px-10 py-5 rounded-full text-lg font-bold hover:bg-emerald-50 hover:scale-105 transition-all shadow-lg">
              Get Free Sample Box
            </Link>
            <a href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website" className="border-2 border-white text-white px-10 py-5 rounded-full text-lg font-bold hover:bg-white/10 hover:scale-105 transition-all">
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
