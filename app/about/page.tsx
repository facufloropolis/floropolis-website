import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Sprout, Briefcase, Laptop, Shield } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Floropolis - Farm-Direct Wholesale Flowers',
  description: 'Learn how Floropolis connects professional florists directly with premium flower farms in Ecuador and Colombia.',
};

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            We're Fixing a Broken Supply Chain
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Floropolis connects professional florists directly with premium flower farms, eliminating the waste, delays, and markups of traditional wholesale.
          </p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-8">Why We Built Floropolis</h2>
          
          <div className="space-y-6 text-lg text-slate-600 leading-relaxed">
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
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-2xl p-12 text-center text-white shadow-xl">
            <p className="text-xl md:text-2xl leading-relaxed font-medium">
              "To give every professional florist access to the same quality, pricing, and reliability that only large wholesalers enjoyed before."
            </p>
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">What Makes Us Different</h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Sprout className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Farm Partnerships</h3>
              <p className="text-slate-600">We work directly with trusted farms in Ecuador and Colombia. No importers, no middlemen.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Briefcase className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">B2B Only</h3>
              <p className="text-slate-600">We built Floropolis exclusively for professional florists, event designers, and funeral homes.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Laptop className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Technology First</h3>
              <p className="text-slate-600">Real-time inventory, online ordering, full tracking. We're modernizing the flower industry.</p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Shield className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Freshness Guarantee</h3>
              <p className="text-slate-600">7-day freshness guarantee or your money back. We stand behind every shipment.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Farm Partners */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-slate-900 mb-8 text-center">Our Farm Partners</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-slate-50 p-6 rounded-xl text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Ecoroses</h3>
              <p className="text-slate-600">Premium roses, Ecuador</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-xl text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Megaflor</h3>
              <p className="text-slate-600">Summer flowers, Ecuador</p>
            </div>
            <div className="bg-slate-50 p-6 rounded-xl text-center">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Flodecol</h3>
              <p className="text-slate-600">Gypsophila, Colombia</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-emerald-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">Ready to Make the Switch?</h2>
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
