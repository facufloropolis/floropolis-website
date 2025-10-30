import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Search, ShoppingCart, CheckCircle, Plane, Truck, Package } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How It Works - Farm to Door in 48-72 Hours | Floropolis',
  description: 'See how Floropolis delivers fresher flowers at better prices. From farm to your door in 2-3 days with our streamlined process.',
};

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
              From Farm to Your Door in 48-72 Hours
            </h1>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
              Here's exactly how Floropolis delivers fresher flowers at better prices
            </p>
          </div>

          {/* 6-Step Process */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            {/* Step 1 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Search className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-3">1</div>
                <h3 className="text-2xl font-bold text-slate-900">Browse Our Catalog</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Access our live inventory of 300+ SKUs including premium roses from Ecuador, seasonal summer flowers, and gypsophila from our partner farms.
              </p>
            </div>

            {/* Step 2 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <ShoppingCart className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-3">2</div>
                <h3 className="text-2xl font-bold text-slate-900">Place Your Order</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Order online 24/7 or call our team. Minimum order $200. Flexible payment terms available for qualified businesses after first order.
              </p>
            </div>

            {/* Step 3 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-3">3</div>
                <h3 className="text-2xl font-bold text-slate-900">Quality Control at Source</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Our partner farms cut your flowers to order, inspect for quality, and pack them the same day in temperature-controlled boxes.
              </p>
            </div>

            {/* Step 4 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Plane className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-3">4</div>
                <h3 className="text-2xl font-bold text-slate-900">Direct Shipping</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Flowers ship via FedEx Priority the next morning. No stops at regional wholesalers or distribution centers.
              </p>
            </div>

            {/* Step 5 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Truck className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-3">5</div>
                <h3 className="text-2xl font-bold text-slate-900">Track Your Delivery</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Receive tracking information immediately. Monitor your shipment in real-time with guaranteed delivery dates.
              </p>
            </div>

            {/* Step 6 */}
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100 hover:shadow-2xl transition-all">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <Package className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="flex items-center mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-sm mr-3">6</div>
                <h3 className="text-2xl font-bold text-slate-900">Arrives Fresh</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Flowers arrive in 48-72 hours with 5-7 days longer vase life than traditional wholesale. Backed by our 7-day guarantee.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">The Floropolis Advantage</h2>
            <p className="text-xl text-slate-600">See the difference farm-direct makes</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-2xl shadow-lg border border-gray-200">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-4 text-left font-bold text-slate-900">Metric</th>
                  <th className="px-6 py-4 text-center font-bold text-slate-900">Traditional Wholesale</th>
                  <th className="px-6 py-4 text-center font-bold text-emerald-600">Floropolis Direct</th>
                  <th className="px-6 py-4 text-center font-bold text-slate-900">Your Benefit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Farm to Your Shop</td>
                  <td className="px-6 py-4 text-center text-slate-600">7-10 days</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">2-3 days</td>
                  <td className="px-6 py-4 text-center text-emerald-600">5-7 days faster</td>
                </tr>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Cost Markup</td>
                  <td className="px-6 py-4 text-center text-slate-600">69%</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">27%</td>
                  <td className="px-6 py-4 text-center text-emerald-600">42% reduction</td>
                </tr>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Vase Life Remaining</td>
                  <td className="px-6 py-4 text-center text-slate-600">5-7 days</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">12-14 days</td>
                  <td className="px-6 py-4 text-center text-emerald-600">7 days longer</td>
                </tr>
                <tr className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Sourcing Time</td>
                  <td className="px-6 py-4 text-center text-slate-600">4+ hours/week</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">15 minutes/week</td>
                  <td className="px-6 py-4 text-center text-emerald-600">12+ hours saved</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-slate-600">Everything you need to know about working with Floropolis</p>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What if flowers arrive damaged?</h3>
              <p className="text-slate-600 leading-relaxed">
                Full refund or replacement, no questions asked. We also provide a credit toward your next order.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Do you have minimum orders?</h3>
              <p className="text-slate-600 leading-relaxed">
                Yes, $200 minimum per order to ensure economical shipping costs.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What are your payment terms?</h3>
              <p className="text-slate-600 leading-relaxed">
                First order is prepaid. After that, flexible payment terms may be available for qualified businesses.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What if I need flowers today?</h3>
              <p className="text-slate-600 leading-relaxed">
                We currently specialize in planned orders with 2-3 day delivery. For emergency needs, we're building a Miami hub for same-day service in select markets (coming 2026).
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-xl font-bold text-slate-900 mb-3">What areas do you deliver to?</h3>
              <p className="text-slate-600 leading-relaxed">
                We deliver nationwide to all 50 states via FedEx Priority.
              </p>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
              <h3 className="text-xl font-bold text-slate-900 mb-3">Can I pre-book for holidays?</h3>
              <p className="text-slate-600 leading-relaxed">
                Yes! Pre-booking for Valentine's Day, Mother's Day, and other peak seasons opens 3-6 months in advance with locked-in pricing.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Ready to Try Farm-Direct?
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Get your sample box and see the difference for yourself
          </p>
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

