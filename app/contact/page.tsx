import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Mail, Phone, MessageCircle } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Floropolis - Wholesale Flower Supplier',
  description: 'Questions about wholesale accounts, ordering, or shipping? Contact Floropolis.',
};

export default function Contact() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6">
            Get in Touch
          </h1>
          <p className="text-xl text-slate-600">
            Questions about ordering, shipping, or becoming a wholesale customer? We're here to help.
          </p>
        </div>
      </section>

      {/* Contact Options */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-8 bg-slate-50 rounded-2xl">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Email</h3>
              <a href="mailto:orders@floropolis.com" className="text-emerald-600 hover:text-emerald-700 font-medium">
                orders@floropolis.com
              </a>
              <p className="text-sm text-slate-500 mt-2">We respond within 24 hours</p>
            </div>

            <div className="text-center p-8 bg-slate-50 rounded-2xl">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">WhatsApp</h3>
              <a href="https://wa.me/17869308463" className="text-emerald-600 hover:text-emerald-700 font-medium">
                +1 (786) 930-8463
              </a>
              <p className="text-sm text-slate-500 mt-2">Quick questions & support</p>
            </div>

            <div className="text-center p-8 bg-slate-50 rounded-2xl">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Phone className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Call Us</h3>
              <a href="tel:+17869308463" className="text-emerald-600 hover:text-emerald-700 font-medium">
                +1 (786) 930-8463
              </a>
              <p className="text-sm text-slate-500 mt-2">Mon-Fri, 9am-5pm EST</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Quick Links */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Common Questions</h2>
          
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-2">What's the minimum order?</h3>
              <p className="text-slate-600">Our minimum order is $150. Free shipping on all orders over $150.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-2">How fast do you deliver?</h3>
              <p className="text-slate-600">48-72 hours from our Ecuador farms to your door, depending on location.</p>
            </div>
            <div className="bg-white p-6 rounded-xl shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Do you offer samples?</h3>
              <p className="text-slate-600">Yes! Request a free sample box to see our quality before placing a full order.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-emerald-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to Start?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/sample-box" className="bg-white text-emerald-600 px-10 py-5 rounded-lg text-lg font-bold hover:bg-emerald-50 transition-all">
              Get Free Sample Box
            </Link>
            <a href="https://shop.floropolis.com/762172" className="border-2 border-white text-white px-10 py-5 rounded-lg text-lg font-bold hover:bg-white/10 transition-all">
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
