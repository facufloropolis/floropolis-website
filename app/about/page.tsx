"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Sprout, Briefcase, Laptop, Shield } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-8 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-4 leading-tight">
            We're Fixing a Broken Supply Chain
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Floropolis connects professional florists directly with premium flower farms, eliminating the waste, delays, and markups of traditional wholesale.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Why We Built Floropolis</h2>
          
          <div className="space-y-3 text-lg text-slate-600 leading-relaxed">
            <p>
              The traditional flower supply chain hasn't changed in 80 years. Flowers pass through 2-3 middlemen, spending 7-10 days in transit and cold storage before reaching your shop.
            </p>
            <p>
              We built Floropolis to fix this. By partnering directly with premium farms in Ecuador and Colombia, we cut out the middlemen and deliver flowers that are 5-7 days fresher—at prices 15-40% lower than traditional wholesale.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-2xl p-6 text-center text-white shadow-xl">
            <p className="text-xl md:text-2xl leading-relaxed font-medium">
              "To give every professional florist access to the same quality, pricing, and reliability that only large wholesalers enjoyed before."
            </p>
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-8 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-6 text-center">What Makes Us Different</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                <Sprout className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Farm Partnerships</h3>
              <p className="text-slate-600 text-sm">We work directly with trusted farms in Ecuador and Colombia. No importers, no middlemen.</p>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                <Briefcase className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">B2B Only</h3>
              <p className="text-slate-600 text-sm">We built Floropolis exclusively for professional florists, event designers, and funeral homes.</p>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                <Laptop className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Technology First</h3>
              <p className="text-slate-600 text-sm">Real-time inventory, online ordering, full tracking. We're modernizing the flower industry.</p>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-lg">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                <Shield className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">Freshness Guarantee</h3>
              <p className="text-slate-600 text-sm">7-day freshness guarantee or your money back. We stand behind every shipment.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Farm Partners */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">Our Farm Partners</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-50 p-4 rounded-xl text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-1">Ecoroses</h3>
              <p className="text-slate-600 text-sm">Premium roses, Ecuador</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-1">Megaflor</h3>
              <p className="text-slate-600 text-sm">Summer flowers, Ecuador</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-1">Flodecol</h3>
              <p className="text-slate-600 text-sm">Gypsophila, Colombia</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-8 px-4 bg-emerald-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Make the Switch?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sample-box" className="bg-white text-emerald-600 px-10 py-5 rounded-lg text-lg font-bold hover:bg-emerald-50 transition-all" onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "about" })}>
              Get Free Sample Box
            </Link>
            <a href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website" className="border-2 border-white text-white px-10 py-5 rounded-lg text-lg font-bold hover:bg-white/10 transition-all" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "about" })}>
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
