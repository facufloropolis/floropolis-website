"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { Truck, CheckCircle2, ArrowRight, Package } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

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
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center text-slate-500">Loading…</div>}>
      <SampleBoxContent />
    </Suspense>
  );
}

function SampleBoxContent() {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    zip: "",
    phone: "",
    company: "",
    state: "",
    boxChoice: "summer",
    notes: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isError, setIsError] = useState(false);

  // Pre-populate from product page navigation
  useEffect(() => {
    const product = searchParams.get("product");
    const category = searchParams.get("category");
    if (product) {
      const preNote = `Interested in: ${product}${category ? ` (${category})` : ""}`;
      setFormData((prev) => ({
        ...prev,
        notes: prev.notes ? prev.notes : preNote,
        boxChoice: category?.toLowerCase().includes("rose") ? "roses"
          : category?.toLowerCase().includes("tropical") ? "tropical"
          : category?.toLowerCase().includes("gyps") ? "gypsophilia"
          : prev.boxChoice,
      }));
    }
  }, [searchParams]);

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
      // Trigger n8n (keep existing)
      fetch('https://n8n.floropolis.com/webhook/sample-box-new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }).catch(() => {});

      // NEW: Save to Supabase + send internal email + append to Google Sheet
      fetch('/api/notify-sample-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          company: formData.company,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
          city: formData.city,
          state: formData.state,
          zip: formData.zip,
          boxChoice: formData.boxChoice,
          notes: formData.notes,
        }),
      }).catch(() => {});

      setIsSuccess(true);
    } catch (error) {
      console.error('Error submitting form:', error);
      setIsError(true);
    }

    setIsSubmitting(false);
  };

  if (isError) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">⚠️</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-4">Something Went Wrong</h1>
          <p className="text-lg text-slate-600 mb-8">
            We couldn&apos;t submit your request. Please try again or contact us directly.
          </p>
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setIsError(false)}
              className="bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all"
            >
              Try Again
            </button>
            <a
              href="mailto:facu@floropolis.com"
              className="text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Email us directly →
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 px-4 py-12">
        <div className="max-w-lg mx-auto">
          {/* Success header */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-emerald-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">You&apos;re on the list!</h1>
            <p className="text-lg text-slate-600">
              We&apos;ll confirm by email within 24 hours and ship your sample box in 2–3 days.
            </p>
          </div>

          {/* What happens next */}
          <div className="bg-white rounded-2xl border border-emerald-100 p-6 mb-6">
            <h2 className="font-bold text-slate-900 mb-4 text-sm uppercase tracking-wide">What happens next</h2>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Confirmation email within 24h</p>
                  <p className="text-xs text-slate-500">We review every request and confirm shipping details.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Packed fresh at the farm</p>
                  <p className="text-xs text-slate-500">Cut to order in Ecuador, shipped same day.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">Arrives in 4 days via FedEx</p>
                  <p className="text-xs text-slate-500">Track your box and message us any time on WhatsApp.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Browse catalog CTA */}
          <div className="flex flex-col gap-3 mb-6">
            <Link
              href="/shop"
              className="bg-emerald-600 text-white px-8 py-4 rounded-lg font-bold hover:bg-emerald-700 transition-all inline-flex items-center justify-center gap-2"
            >
              Browse Catalog While You Wait
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="https://wa.me/17869308463?text=Hi!%20I%20just%20requested%20a%20sample%20box%20from%20Floropolis."
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              💬 Questions? WhatsApp us →
            </a>
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
      <section className="py-6 sm:py-12 px-4 bg-gradient-to-br from-emerald-50 to-green-50">
        <div className="max-w-6xl mx-auto">
          {/* Mobile-only trust strip — visible before the form on small screens */}
          <div className="lg:hidden flex gap-4 justify-center mb-6 flex-wrap">
            <div className="flex items-center gap-2 text-emerald-800 bg-emerald-100 px-4 py-2 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> No credit card
            </div>
            <div className="flex items-center gap-2 text-emerald-800 bg-emerald-100 px-4 py-2 rounded-full text-sm font-medium">
              <Truck className="w-4 h-4 flex-shrink-0" /> We cover shipping
            </div>
            <div className="flex items-center gap-2 text-emerald-800 bg-emerald-100 px-4 py-2 rounded-full text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> No obligation
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Left: Form */}
            <div className="bg-white p-5 sm:p-8 rounded-2xl shadow-xl">
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
                Request Your Free Sample Box
              </h1>
              <p className="text-slate-600 mb-6">
                Try our premium flowers risk-free. No obligation, no credit card required.
              </p>

              <div className="bg-emerald-50 border-l-4 border-emerald-400 p-4 mb-6 rounded-r-lg">
                <p className="text-emerald-900 font-semibold flex items-center gap-2">
                  <span className="text-xl">📦</span>
                  Ships within 48 hours of confirmation
                </p>
                <p className="text-sm text-emerald-700 mt-1">We review every request and confirm by email within 24 hours.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Step 1: Box choice FIRST — commitment before info */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Step 1: Choose Your Box *</label>
                  <div className="space-y-3">
                    <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${formData.boxChoice === "summer" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-400"}`}>
                      <input
                        type="radio"
                        name="boxChoice"
                        value="summer"
                        required
                        checked={formData.boxChoice === "summer"}
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">🌸 Summer Flowers Mix</span>
                          <span className="text-xs bg-emerald-600 text-white px-2 py-0.5 rounded-full font-medium">Most popular</span>
                        </div>
                        <div className="text-sm text-slate-600 mt-0.5">Megaflor — Ranunculus, Anemones, Delphinium, Eryngium. Farm-direct variety.</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${formData.boxChoice === "roses" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-400"}`}>
                      <input
                        type="radio"
                        name="boxChoice"
                        value="roses"
                        checked={formData.boxChoice === "roses"}
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-semibold text-slate-900">🌹 Premium Roses — 100 stems</span>
                        <div className="text-sm text-slate-600 mt-0.5">Ecoroses — Playa Blanca, Veggie, Toffee, Freedom. 14-day vase life.</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${formData.boxChoice === "gypsophilia" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-400"}`}>
                      <input
                        type="radio"
                        name="boxChoice"
                        value="gypsophilia"
                        checked={formData.boxChoice === "gypsophilia"}
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">✨ Gypsophilia — 250g</div>
                        <div className="text-sm text-slate-600 mt-0.5">Flodecol — Premium baby&apos;s breath. The freshest you&apos;ll find in the US market.</div>
                      </div>
                    </label>
                    <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${formData.boxChoice === "tropical" ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-400"}`}>
                      <input
                        type="radio"
                        name="boxChoice"
                        value="tropical"
                        checked={formData.boxChoice === "tropical"}
                        onChange={(e) => setFormData({...formData, boxChoice: e.target.value})}
                        className="mt-1"
                      />
                      <div>
                        <div className="font-semibold text-slate-900">🌺 Tropical Assorted</div>
                        <div className="text-sm text-slate-600 mt-0.5">Magic Flower — Best-of combo box. Variety you won&apos;t find at auction.</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-100 pt-2">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-4">Step 2: Where should we ship it?</p>
                </div>

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
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Shipping Address *
                    <span className="font-normal text-slate-400 ml-2 text-xs">We need this to ship your box — not shared.</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.address}
                    onChange={(e) => setFormData({...formData, address: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Street address"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="col-span-2 sm:col-span-1">
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">ZIP *</label>
                    <input
                      type="text"
                      required
                      value={formData.zip}
                      onChange={(e) => setFormData({...formData, zip: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="ZIP"
                      maxLength={10}
                      pattern="[0-9\-]+"
                    />
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
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Business Name</label>
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) => setFormData({...formData, company: e.target.value})}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      placeholder="Your flower shop"
                    />
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    rows={2}
                    placeholder="Any specific questions?"
                  />
                </div>

                <p className="text-center text-sm text-slate-500">
                  🌿 Join 11 florists who&apos;ve already tried our sample boxes
                </p>

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
                    <p className="text-slate-600">Farm-direct from Ecuador. Arrives in 4 days.</p>
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

      {/* FAQ — content matches FAQPage JSON-LD schema in layout.tsx for Google rich results */}
      <section className="max-w-3xl mx-auto px-4 py-10">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
        <div className="space-y-5 text-sm">
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Is the sample box really free?</h3>
            <p className="text-slate-600">Yes — we cover shipping and there&apos;s no credit card required. You pay nothing. We send it because we know once you see the quality, you&apos;ll want to order regularly.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">What&apos;s included in the sample box?</h3>
            <p className="text-slate-600">Your choice of roses, tropical flowers, or greens — one QB (quarter box). The exact varieties may vary by season and availability, but you&apos;ll receive a curated selection that represents our best current inventory.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">How long does the sample box take to arrive?</h3>
            <p className="text-slate-600">4 days from our Ecuador farms to your door via FedEx Priority. We coordinate the cutoff so flowers arrive Monday through Thursday — never on a weekend.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Do I have to buy after getting the sample box?</h3>
            <p className="text-slate-600">No obligation whatsoever. The sample box is exactly what it says — a free sample so you can see the quality yourself. If you love it, we&apos;d love your business. If not, no hard feelings.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Who is the sample box for?</h3>
            <p className="text-slate-600">Retail florists, event planners, and floral designers who want to evaluate farm-direct wholesale quality before committing to a first order. If you&apos;re buying flowers regularly for your business, this is for you.</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
