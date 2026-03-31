"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import Link from "next/link";
import { Search, Package, Plane, Truck } from "lucide-react";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />
      
      {/* Hero */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
            Farm to Door in 4 Days
          </h1>
          <p className="text-xl text-slate-600">
            We've simplified the entire supply chain so you get fresher flowers with less friction.
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
              <h3 className="text-xl font-bold text-slate-900 mb-3">Browse & Add to Quote</h3>
              <p className="text-slate-600">270+ varieties with transparent per-stem pricing. No login required to see prices.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Package className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">2</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Submit — We Confirm in 1 Hour</h3>
              <p className="text-slate-600">No commitment. We verify availability and confirm pricing Mon–Fri, 8–6 ET. No payment yet.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Plane className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">3</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Farm Picks & Ships</h3>
              <p className="text-slate-600">Flowers are cut to order within 24 hours, climate-controlled direct flight from Ecuador.</p>
            </div>

            <div className="text-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                <Truck className="w-10 h-10 text-emerald-600" />
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-emerald-600 rounded-full text-white font-bold flex items-center justify-center">4</div>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Delivered Fresh in 4 Days</h3>
              <p className="text-slate-600">FedEx to your door. Farm-to-door in 4 days — 5–7 days fresher than wholesale market.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Floropolis */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">The Floropolis difference</h2>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <h3 className="text-2xl font-bold text-red-600 mb-6">The old supply chain</h3>
              <ul className="space-y-4 text-slate-600">
                <li className="flex items-start gap-3">
                  <span className="text-red-500">✗</span>
                  <span>7–14 days from farm to you (via distributors)</span>
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
                  <span>4 days from farm to your door</span>
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

      {/* FAQ — content matches FAQPage JSON-LD schema in layout.tsx for Google rich results */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How long does wholesale flower delivery take?</h3>
              <p className="text-slate-600 text-sm">Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Flowers are cut fresh to order and shipped with no warehouse stops or middlemen.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Do you ship wholesale flowers nationwide?</h3>
              <p className="text-slate-600 text-sm">Yes, Floropolis delivers to all 50 states via FedEx Priority. Free shipping on all orders, no minimum required.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">How fresh are the flowers when they arrive?</h3>
              <p className="text-slate-600 text-sm">Flowers are cut to order in Ecuador and arrive in 4 days. With no warehouse stops or distributor handling, you get flowers with 14+ days of vase life — significantly fresher than traditional wholesale channels.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">What farms does Floropolis source from?</h3>
              <p className="text-slate-600 text-sm">Floropolis sources direct from partner farms in Ecuador and Colombia, including MegaFlor, Ecoroses, Flodecol, and Magic Flowers. All farms ship direct — no middlemen or wholesale distributors.</p>
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 mb-1">Is there a minimum order for wholesale flowers?</h3>
              <p className="text-slate-600 text-sm">No minimum order. Order a single box or hundreds of stems — free shipping applies to all orders regardless of size.</p>
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
            <Link href="/shop" className="border-2 border-white text-white px-10 py-5 rounded-lg text-lg font-bold hover:bg-white/10 transition-all">
              Shop Now
            </Link>
          </div>
          {/* EXP-093: WA fallback — consistent with homepage final CTA */}
          <p className="mt-4 text-emerald-200 text-sm">
            Prefer to chat first?{" "}
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%27d%20like%20to%20know%20more%20about%20ordering%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => pushEvent("whatsapp_click", { cta_location: "how_it_works_final_cta" })}
              className="text-white font-semibold underline hover:no-underline"
            >
              Message us on WhatsApp →
            </a>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}
