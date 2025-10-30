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
      <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            We're Fixing a Broken Supply Chain
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Floropolis connects professional florists directly with premium flower farms, eliminating the waste, delays, and markups of traditional wholesale.
          </p>
        </div>
      </section>

      {/* Our Story Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8">Why We Built Floropolis</h2>
          
          <div className="space-y-6 text-lg text-slate-600 leading-relaxed">
            <p>
              The traditional flower supply chain hasn't changed in 80 years. Flowers pass through 2-3 middlemen, spending 7-10 days in transit and cold storage before reaching your shop. By the time you buy them, they've already lost half their vase life.
            </p>
            <p>
              We built Floropolis to fix this broken system. By partnering directly with premium farms in Ecuador and Colombia, we cut out the middlemen and deliver flowers that are 5-7 days fresher—at prices 15-25% lower than traditional wholesale.
            </p>
            <p>
              This isn't just better for your business. It's better for your customers, better for the farms, and better for the planet.
            </p>
          </div>
        </div>
      </section>

      {/* Mission Box */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-2xl p-12 text-center text-white shadow-xl">
            <p className="text-xl md:text-2xl leading-relaxed font-medium">
              "To give every professional florist—from rural towns to major cities—access to the same quality, pricing, and reliability that only large wholesalers enjoyed before."
            </p>
          </div>
        </div>
      </section>

      {/* How We're Different Section */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">What Makes Us Different</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Card 1 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Sprout className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Farm Partnerships</h3>
              <p className="text-slate-600 leading-relaxed">
                We work directly with trusted farms in Ecuador (roses, summer flowers) and Colombia (gypsophila). No importers, no middlemen.
              </p>
            </div>

            {/* Card 2 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Briefcase className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">B2B Only</h3>
              <p className="text-slate-600 leading-relaxed">
                We built Floropolis exclusively for professional florists, event designers, and funeral homes. Not consumers.
              </p>
            </div>

            {/* Card 3 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Laptop className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Technology First</h3>
              <p className="text-slate-600 leading-relaxed">
                Real-time inventory, online ordering, API integration for larger customers. We're bringing the flower industry into the 21st century.
              </p>
            </div>

            {/* Card 4 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Shield className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Reliability Guarantee</h3>
              <p className="text-slate-600 leading-relaxed">
                95% on-time delivery SLA with full tracking. 7-day freshness guarantee or your money back.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Our Partners Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Our Farm Partners</h2>
            <p className="text-xl text-slate-600">
              We partner with premium farms that meet our standards for quality, sustainability, and worker treatment
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Partner 1 */}
            <div className="bg-gradient-to-br from-slate-50 to-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Megaflor USA - Ecuador</h3>
              <p className="text-lg text-slate-600 leading-relaxed">
                Premium roses and seasonal summer flowers
              </p>
            </div>

            {/* Partner 2 */}
            <div className="bg-gradient-to-br from-slate-50 to-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-2xl font-bold text-slate-900 mb-4">Flodecol - Colombia</h3>
              <p className="text-lg text-slate-600 leading-relaxed">
                Gypsophila (baby's breath) and specialty fillers
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8 text-center">Our Team</h2>
          <p className="text-lg text-slate-600 leading-relaxed">
            Floropolis is a small team passionate about modernizing the floral supply chain. We're building the technology and logistics infrastructure that professional florists deserve, backed by industry veterans who understand both flowers and B2B operations.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Ready to Make the Switch?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="bg-emerald-600 text-white px-12 py-6 rounded-lg text-xl font-bold hover:bg-emerald-700 transition-all shadow-xl hover:shadow-2xl inline-block">
              Request Sample Box
            </a>
            <a href="https://shop.floropolis.com" className="border-2 border-emerald-600 text-emerald-600 px-12 py-6 rounded-lg text-xl font-bold hover:bg-emerald-50 transition-all inline-block">
              Shop Now
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

