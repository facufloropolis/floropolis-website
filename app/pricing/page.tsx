import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import Link from "next/link";
import { Check, X } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Transparent Wholesale Flower Pricing | Floropolis',
  description: 'See exactly what you\'ll pay before you order. Fixed pricing, no auctions or daily fluctuations. All prices include shipping.',
};

export default function Pricing() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      
      {/* Hero Section */}
      <section className="py-20 md:py-28 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
            Transparent Pricing, No Surprises
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            See exactly what you'll pay before you order. No auctions, no daily price fluctuations.
          </p>
        </div>
      </section>

      {/* How Our Pricing Works Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-8">Fixed Pricing You Can Count On</h2>
          
          <p className="text-lg text-slate-600 leading-relaxed mb-6">
            Unlike traditional wholesalers with daily auction pricing, we publish fixed prices for each product. This lets you:
          </p>

          <ul className="space-y-3 text-lg text-slate-600 mb-8">
            <li className="flex items-start">
              <span className="text-emerald-600 mr-3">✓</span>
              <span>Quote customers with confidence</span>
            </li>
            <li className="flex items-start">
              <span className="text-emerald-600 mr-3">✓</span>
              <span>Pre-book for events months in advance</span>
            </li>
            <li className="flex items-start">
              <span className="text-emerald-600 mr-3">✓</span>
              <span>Protect your margins during peak seasons</span>
            </li>
          </ul>

          <p className="text-lg text-slate-600 leading-relaxed">
            All prices include FedEx Priority shipping and our 7-day freshness guarantee.
          </p>
        </div>
      </section>

      {/* Pricing Structure Box */}
      <section className="py-12 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white border-2 border-emerald-600 rounded-2xl p-8 md:p-12 shadow-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-8 text-center">Standard Terms</h2>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Minimum Order</p>
                <p className="text-2xl font-bold text-slate-900">$200</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Shipping</p>
                <p className="text-2xl font-bold text-emerald-600">Included</p>
                <p className="text-sm text-slate-600">FedEx Priority</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Payment Terms</p>
                <p className="text-lg text-slate-900">First order prepaid, then</p>
                <p className="text-lg font-bold text-emerald-600">Flexible payment terms available</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">Guarantee</p>
                <p className="text-2xl font-bold text-slate-900">7-Day Freshness</p>
                <p className="text-sm text-slate-600">or full refund</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Sample Pricing Table */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Example Pricing</h2>
            <p className="text-xl text-slate-600">
              (Actual prices vary by season and availability. Register to see live pricing.)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-2xl shadow-lg border border-gray-200">
              <thead>
                <tr className="bg-slate-50 border-b border-gray-200">
                  <th className="px-6 py-4 text-left font-bold text-slate-900">Product</th>
                  <th className="px-6 py-4 text-center font-bold text-slate-900">Stem Count</th>
                  <th className="px-6 py-4 text-center font-bold text-slate-900">Price Range</th>
                  <th className="px-6 py-4 text-left font-bold text-slate-900">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr className="bg-white hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Premium Red Roses (50cm)</td>
                  <td className="px-6 py-4 text-center text-slate-600">25 stems</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">$18-24</td>
                  <td className="px-6 py-4 text-slate-600">Ecuador grown</td>
                </tr>
                <tr className="bg-slate-50 hover:bg-slate-100 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Premium Red Roses (70cm)</td>
                  <td className="px-6 py-4 text-center text-slate-600">25 stems</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">$24-32</td>
                  <td className="px-6 py-4 text-slate-600">Premium grade</td>
                </tr>
                <tr className="bg-white hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Garden Roses</td>
                  <td className="px-6 py-4 text-center text-slate-600">12 stems</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">$28-36</td>
                  <td className="px-6 py-4 text-slate-600">Seasonal availability</td>
                </tr>
                <tr className="bg-slate-50 hover:bg-slate-100 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Gypsophila (Baby's Breath)</td>
                  <td className="px-6 py-4 text-center text-slate-600">10 bunches</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">$45-60</td>
                  <td className="px-6 py-4 text-slate-600">Year-round</td>
                </tr>
                <tr className="bg-white hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-900">Summer Mixed Box</td>
                  <td className="px-6 py-4 text-center text-slate-600">Assorted</td>
                  <td className="px-6 py-4 text-center font-bold text-emerald-600">$85-120</td>
                  <td className="px-6 py-4 text-slate-600">Seasonal varieties</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Cost Comparison Visual */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Why Floropolis Costs Less</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 mb-8">
            {/* Traditional Model */}
            <div className="bg-slate-50 rounded-2xl p-8 border border-gray-200">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Traditional Model</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Farm</span>
                  <span className="text-2xl">→</span>
                </div>
                <div className="flex items-center justify-between bg-white px-4 py-2 rounded">
                  <span className="text-slate-600">Importer (+20%)</span>
                  <span className="text-2xl">→</span>
                </div>
                <div className="flex items-center justify-between bg-white px-4 py-2 rounded">
                  <span className="text-slate-600">Regional Wholesaler (+25%)</span>
                  <span className="text-2xl">→</span>
                </div>
                <div className="flex items-center justify-between bg-white px-4 py-2 rounded">
                  <span className="text-slate-600">Local Wholesaler (+24%)</span>
                  <span className="text-2xl">→</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">You</span>
                </div>
                <div className="mt-4 text-center bg-red-50 border-2 border-red-200 rounded-lg py-3">
                  <p className="text-lg font-bold text-red-700">Total markup: 69%</p>
                </div>
              </div>
            </div>

            {/* Floropolis Model */}
            <div className="bg-emerald-50 rounded-2xl p-8 border-2 border-emerald-600">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Floropolis Model</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-slate-900 font-semibold">Farm</span>
                  <span className="text-2xl text-emerald-600">→</span>
                </div>
                <div className="flex items-center justify-between bg-white px-4 py-2 rounded border-2 border-emerald-600">
                  <span className="font-bold text-emerald-700">You (Direct)</span>
                </div>
                <div className="mt-4 text-center bg-emerald-100 border-2 border-emerald-500 rounded-lg py-3">
                  <p className="text-lg font-bold text-emerald-700">Total markup: 27%</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-2xl p-8 text-center text-white shadow-xl">
            <p className="text-xl md:text-2xl font-semibold">
              By eliminating 2-3 middlemen, we save you <span className="font-bold">15-25%</span> while delivering flowers <span className="font-bold">5-7 days fresher</span>.
            </p>
          </div>
        </div>
      </section>

      {/* What's Included Section */}
      <section className="py-20 px-4 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-12 text-center">What's Included</h2>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Included */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-emerald-600">
              <div className="flex items-center mb-6">
                <Check className="w-8 h-8 text-emerald-600 mr-3" />
                <h3 className="text-2xl font-bold text-slate-900">Included ✓</h3>
              </div>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-center">
                  <span className="text-emerald-600 mr-2">✓</span>
                  FedEx Priority shipping
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-600 mr-2">✓</span>
                  Quality inspection at source
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-600 mr-2">✓</span>
                  Temperature-controlled packaging
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-600 mr-2">✓</span>
                  Real-time tracking
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-600 mr-2">✓</span>
                  7-day freshness guarantee
                </li>
                <li className="flex items-center">
                  <span className="text-emerald-600 mr-2">✓</span>
                  Customer support
                </li>
              </ul>
            </div>

            {/* Not Included */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
              <div className="flex items-center mb-6">
                <X className="w-8 h-8 text-slate-400 mr-3" />
                <h3 className="text-2xl font-bold text-slate-900">Not Included ✗</h3>
              </div>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-center">
                  <X className="w-5 h-5 text-slate-400 mr-2" />
                  No membership fees
                </li>
                <li className="flex items-center">
                  <X className="w-5 h-5 text-slate-400 mr-2" />
                  No monthly minimums
                </li>
                <li className="flex items-center">
                  <X className="w-5 h-5 text-slate-400 mr-2" />
                  No contracts required
                </li>
                <li className="flex items-center">
                  <X className="w-5 h-5 text-slate-400 mr-2" />
                  No hidden surcharges
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            Want to See Live Pricing?
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Register for a trade account to access our full catalog with current pricing and availability
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="bg-emerald-600 text-white px-12 py-6 rounded-lg text-xl font-bold hover:bg-emerald-700 transition-all shadow-xl hover:shadow-2xl inline-block">
              Register Now
            </a>
            <a href="https://shop.floropolis.com/spa/sign-up/e-commerce/user.do?code=762172" className="bg-white border-2 border-emerald-600 text-emerald-600 px-12 py-6 rounded-lg text-xl font-bold hover:bg-emerald-50 transition-all shadow-lg inline-block">
              Request Sample Box
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

