"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Mail, Phone, MessageCircle } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

export default function Contact() {
  return (
    <div className="min-h-screen bg-white">
      {/* Announcement Banner */}
      <div className="bg-emerald-600 text-white py-3 text-center text-sm font-semibold">
        🌸 Order by Monday, flowers at your shop by Thursday · Farm direct from Ecuador & Colombia
      </div>
      <Navigation />
      
      {/* Hero */}
      <section className="py-6 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">

          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-2">
            Contact Us
          </h1>
          <p className="text-xl text-slate-600">
            Questions about ordering, shipping, or becoming a wholesale customer? We're here to help.
          </p>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center p-4 bg-slate-50 rounded-2xl">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Mail className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Email</h3>
              <a href="mailto:orders@floropolis.com" className="text-emerald-600 hover:text-emerald-700 font-medium" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.contact_email_click)}>
                orders@floropolis.com
              </a>
              <p className="text-sm text-slate-500 mt-2">We respond within 24 hours</p>
            </div>

            <div className="text-center p-4 bg-slate-50 rounded-2xl">
              <a href="https://wa.me/17869308463" className="block" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.contact_whatsapp_click)}>
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2 cursor-pointer hover:bg-emerald-200 transition-colors">
                  <MessageCircle className="w-7 h-7 text-emerald-600" />
                </div>
              </a>
              <h3 className="text-xl font-bold text-slate-900 mb-1">WhatsApp</h3>
              <a href="https://wa.me/17869308463" className="text-emerald-600 hover:text-emerald-700 font-medium" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.contact_whatsapp_click)}>
                +1 (786) 930-8463
              </a>
              <p className="text-sm text-slate-500 mt-2">Quick questions & support</p>
            </div>

            <div className="text-center p-4 bg-slate-50 rounded-2xl">
              <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Phone className="w-7 h-7 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">Call Us</h3>
              <a href="tel:+17869308463" className="text-emerald-600 hover:text-emerald-700 font-medium" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.contact_call_click)}>
                +1 (786) 930-8463
              </a>
              <p className="text-sm text-slate-500 mt-2">Mon-Fri, 9am-5pm EST</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-8 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-3">Frequently Asked Questions</h2>
            <p className="text-xl text-slate-600">Everything you need to know about working with Floropolis</p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Do you have a minimum order?</h3>
              <p className="text-slate-600 leading-relaxed">No minimum order required. Free shipping on all orders, regardless of size.</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Do you offer free shipping?</h3>
              <p className="text-slate-600 leading-relaxed">Yes, free shipping on all orders. No minimum purchase required.</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Fresh guaranteed?</h3>
              <p className="text-slate-600 leading-relaxed">Absolutely. Our flowers are cut fresh and delivered in 48-72 hours. If your flowers don't arrive fresh, we'll replace them or refund your order.</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What if I need flowers today?</h3>
              <p className="text-slate-600 leading-relaxed">We currently specialize in planned orders with 2-3 day delivery. For emergency needs, we're building a Miami hub for same-day service in select markets (coming 2026).</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What areas do you deliver to?</h3>
              <p className="text-slate-600 leading-relaxed">We deliver nationwide to all 50 states via FedEx Priority.</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-md hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Can I pre-book for holidays?</h3>
              <p className="text-slate-600 leading-relaxed">Yes! Pre-booking for peak seasons such as Mother's Day and other holidays opens 3-6 months in advance with locked-in pricing.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-8 px-4 bg-emerald-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to Start?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sample-box" className="bg-white text-emerald-600 px-10 py-5 rounded-lg text-lg font-bold hover:bg-emerald-50 transition-all" onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "contact_page" })}>
              Get Free Sample Box
            </Link>
            <a href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website" className="border-2 border-white text-white px-10 py-5 rounded-lg text-lg font-bold hover:bg-white/10 transition-all" onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "contact_page" })}>
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
