"use client";

import { useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { Truck, CheckCircle2, ArrowRight, Package } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";
import { getSampleBoxesAvailable } from "@/lib/sample-boxes";

// US states only (50 states + DC) – value = abbreviation for sheet
const US_STATES = [
  { value: "", label: "Select state" },
  { value: "AL", label: "Alabama" },
  { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" },
  { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" },
  { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" },
  { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" },
  { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" },
  { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" },
  { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" },
  { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" },
  { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" },
  { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" },
  { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" },
  { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" },
  { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" },
  { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" },
  { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" },
  { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" },
  { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

export default function SampleBoxPage() {
  const spotsLeft = getSampleBoxesAvailable();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    zip: "",
    phone: "",
    company: "",
    state: "",
    boxChoice: "",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Push to dataLayer so GTM Custom Event trigger fires (key conversion)
    pushEvent(CTA_EVENTS.sample_box_request, {
      box_choice: formData.boxChoice,
      cta_location: "sample_box_form",
      state: formData.state,
    });

    try {
      // Submit to Google Sheets webhook
      // Column order: Timestamp, Name, Email, Address, City, Zip code, State, Phone, Company, Box Choice, Notes
      await fetch('https://script.google.com/macros/s/AKfycbydKGArw3wL4NNI0-lx0ZbSwmtAHHRTD3RzdZo0PYKJfn_EisMALt9qKcpjXKwg8OA/exec', {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          name: formData.name,
          email: formData.email,
          address: formData.address,
          city: formData.city,
          zip: formData.zip,
          state: formData.state,
          phone: formData.phone,
          company: formData.company,
          boxChoice: formData.boxChoice,
          notes: formData.notes,
        }),
      });
      setIsSuccess(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsSuccess(true); // Still show success since no-cors doesn't return response
    }

    setIsSubmitting(false);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Sample Box Requested!</h1>
          <p className="text-lg text-slate-600 mb-8">
            We'll be in touch within 24 hours to confirm your sample box details.
          </p>
          <div className="flex flex-col gap-4">
            <a
              href="https://eshops.kometsales.com/762172?utm_source=Website&utm_campaign=Shop-website"
              className="bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all inline-flex items-center justify-center gap-2"
              onClick={(e) => handleOutboundClick(e, CTA_EVENTS.shop_now_click, { cta_location: "sample_box_success" })}
            >
              Browse Our Catalog
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link
              href="/"
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      {/* Hero + Form Section */}
      <section className="py-12 px-4 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left: Form */}
            <div className="bg-white p-8 rounded-2xl shadow-xl">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">
                Request Your Free Sample Box
              </h1>
              <p className="text-slate-600 mb-6">
                Try our premium flowers risk-free. No obligation, no credit card required.
              </p>

              {spotsLeft > 0 ? (
                <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-6 rounded-r-lg">
                  <p className="text-amber-900 font-semibold flex items-center gap-2">
                    <span className="text-xl">⏰</span>
                    {spotsLeft === 2
                      ? `Only ${spotsLeft} sample boxes left this week!`
                      : `${spotsLeft} sample boxes available this week`}
                  </p>
                  <p className="text-sm text-amber-700 mt-1">Resets every Monday at 9am EST • First come, first serve</p>
                </div>
              ) : (
                <div className="bg-slate-100 border-l-4 border-slate-400 p-4 mb-6 rounded-r-lg">
                  <p className="text-slate-700 font-semibold flex items-center gap-2">
                    <span className="text-xl">✉️</span>
                    New sample boxes available Monday
                  </p>
                  <p className="text-sm text-slate-600 mt-1">Submit your request now and we&apos;ll process it Monday morning</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Your flower shop or business"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Shipping Address *</label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Street address"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">City *</label>
                    <input
                      type="text"
                      required
                      value={formData.city}
                      onChange={(e) => setFormData({...formData, city: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Zip Code *</label>
                    <input
                      type="text"
                      required
                      value={formData.zip}
                      onChange={(e) => setFormData({...formData, zip: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="ZIP code"
                      maxLength={10}
                      pattern="[0-9\-]+"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State *</label>
                  <select
                    required
                    value={formData.state}
                    onChange={(e) => setFormData({...formData, state: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                  >
                    {US_STATES.map((s) => (
                      <option key={s.value || "empty"} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="For delivery updates"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Select Your Sample Box *</label>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors">
                      <input
                        type="radio"
                        name="boxChoice"
                        value="roses"
                        required
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">Box 1: Premium Roses (100 stems)</div>
                        <div className="text-sm text-slate-600">Ecoroses - Playa Blanca, Veggie, Toffee, Freedom</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors">
                      <input
                        type="radio"
                        name="boxChoice"
                        value="summer"
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">Box 2: Summer Flowers Mix</div>
                        <div className="text-sm text-slate-600">Megaflor - Ranunculus, Anemones, Delphinium, Eryngium</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors">
                      <input
                        type="radio"
                        name="boxChoice"
                        value="gypsophilia"
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">Box 3: Gypsophilia (250g)</div>
                        <div className="text-sm text-slate-600">Flodecol - Premium baby's breath</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-4 border border-slate-200 rounded-lg cursor-pointer hover:border-emerald-500 transition-colors">
                      <input
                        type="radio"
                        name="boxChoice"
                        value="tropical"
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">Box 4: Tropical Flower</div>
                        <div className="text-sm text-slate-600">Magic Flower - Best of assorted combo box</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    rows={3}
                    placeholder="Any specific requirements or questions?"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-emerald-600 text-white py-4 px-6 rounded-lg font-bold text-lg hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Submitting...' : 'Request Free Sample Box'}
                  <Package className="w-5 h-5" />
                </button>
              </form>
            </div>

            {/* Right: Benefits */}
            <div className="lg:pt-8">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Why Try Our Sample Box?</h2>
              
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Truck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">Fast Delivery</h3>
                    <p className="text-slate-600">48-72 hours from Ecuador farm to your door</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">No Obligation</h3>
                    <p className="text-slate-600">Try before you commit. No credit card, no strings.</p>
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-1">$0 Cost to You</h3>
                    <p className="text-slate-600">We cover shipping. Just enjoy the flowers.</p>
                  </div>
                </div>
              </div>

              <div className="mt-12 lg:pt-4">
                <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">
                  Real Flowers, Real Results
                </h2>

                <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide">
                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202025-11-09%20at%2018.21.31.jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202025-12-12%20at%2010.04.44%20(2).jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202026-01-30%20at%2010.28.32.jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202025-12-12%20at%2010.04.44.jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202025-12-12%20at%2010.04.45.jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202026-02-01%20at%2010.12.56.jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202026-02-01%20at%2010.12.56%20(1).jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>

                  <div className="flex-none w-64 snap-center">
                    <div className="aspect-square relative rounded-xl overflow-hidden shadow-lg bg-slate-100">
                      <img
                        src="/images/TESTIMONIALS/WhatsApp%20Image%202025-11-07%20at%2017.08.07.jpeg"
                        alt="Customer photo"
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>

                <p className="text-center text-sm text-slate-500 mt-4 italic">
                  Real photos from florists who ordered from us
                </p>
              </div>

              <style jsx>{`
                .scrollbar-hide::-webkit-scrollbar {
                  display: none;
                }
                .scrollbar-hide {
                  -ms-overflow-style: none;
                  scrollbar-width: none;
                }
              `}</style>

              <div className="mt-10 p-6 bg-slate-50 rounded-xl">
                <p className="text-slate-600 italic">
                  "The sample box sold me immediately. These roses are stunning and my profit margins have improved significantly."
                </p>
                <p className="text-sm text-slate-500 mt-2">— Jennifer T., Garden Gate Florist</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
