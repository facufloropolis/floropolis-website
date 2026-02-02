"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Search, Package, Plane, Truck } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
            Farm to Door in 48-72 Hours
          </h1>
          <p className="text-xl text-slate-600">
            We've simplified the entire process so you can focus on creating beautiful arrangements.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Search className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">1</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Browse & Order</h3>
              <p className="text-slate-600">Shop our real-time inventory online. See exactly what's available at our partner farms.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Package className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">2</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Farm Picks Fresh</h3>
              <p className="text-slate-600">Flowers are cut to order and packed within 24 hours of your purchase.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Plane className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">3</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Direct Flight</h3>
              <p className="text-slate-600">Climate-controlled cargo flies direct from Ecuador to Miami.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Truck className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">4</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Delivered Fresh</h3>
              <p className="text-slate-600">Full tracking and delivery to your door in 48-72 hours.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Traditional vs. Floropolis</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <h3 className="text-2xl font-bold text-red-600 mb-6">Traditional Wholesale</h3>
              <ul className="space-y-4 text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="text-red-500">✗</span>
                  <span>7-10 days from farm to you</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">✗</span>
                  <span>2-3 middlemen with markups</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">✗</span>
                  <span>Multiple warehouse stops</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">✗</span>
                  <span>Limited visibility on sourcing</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-red-500">✗</span>
                  <span>4 AM market runs</span>
                </li>
              </ul>
            </div>

            <div className="bg-emerald-50 p-8 rounded-2xl shadow-lg border-2 border-emerald-200">
              <h3 className="text-2xl font-bold text-emerald-600 mb-6">Floropolis Direct</h3>
              <ul className="space-y-4 text-slate-700">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span>48-72 hours from farm to you</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span>Zero middlemen</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span>Direct farm-to-door shipping</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span>Full transparency & tracking</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600">✓</span>
                  <span>Order online, delivered to you</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-emerald-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to Try It?</h2>
          <p className="text-xl text-emerald-100 mb-8">Get a free sample box and see the quality difference yourself.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sample-box" className="bg-white text-emerald-600 px-10 py-5 rounded-lg text-lg font-bold hover:bg-emerald-50 transition-all" onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "how_it_works" })}>
              Get Free Sample Box
            </Link>
            <a href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website" className="border-2 border-white text-white px-10 py-5 rounded-lg text-lg font-bold hover:bg-white/10 transition-all" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "how_it_works" })}>
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
