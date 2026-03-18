"use client";

import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { pushEvent, handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";
import { FARMS, SUSTAINABILITY_RECEIPTS, TEAM } from "@/lib/about-farms";
import ProcessFlow from "@/components/about/ProcessFlow";
import FarmMap from "@/components/about/FarmMap";
import FarmProfileCard from "@/components/about/FarmProfileCard";

export default function About() {
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      {/* Hero */}
      <section className="py-12 px-4 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1.5 rounded-full mb-5">
            Farms-first · Florists-first
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-4 leading-tight">
            We built Floropolis so buying flowers doesn&apos;t feel like a gamble.
          </h1>
          <p className="text-xl text-slate-700 leading-relaxed max-w-3xl mx-auto">
            Farm partners in Ecuador & Colombia — and soon the US and Mexico — delivered with a cold chain built for real timelines.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/shop"
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 text-white px-7 py-3 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-lg"
            >
              Browse catalog
              <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#farms"
              className="inline-flex items-center justify-center gap-2 border-2 border-emerald-600 text-emerald-700 px-7 py-3 rounded-lg font-bold hover:bg-emerald-50 transition-all"
            >
              Meet the farms
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Section nav */}
      <section className="px-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-wrap justify-center gap-2 text-sm text-slate-600">
            <a href="#story" className="px-3 py-2 rounded-lg hover:bg-slate-100">
              Story
            </a>
            <a href="#how-it-works" className="px-3 py-2 rounded-lg hover:bg-slate-100">
              How it works
            </a>
            <a href="#map" className="px-3 py-2 rounded-lg hover:bg-slate-100">
              Map
            </a>
            <a href="#farms" className="px-3 py-2 rounded-lg hover:bg-slate-100">
              Farms
            </a>
            <a href="#sustainability" className="px-3 py-2 rounded-lg hover:bg-slate-100">
              Sustainability
            </a>
            <a href="#team" className="px-3 py-2 rounded-lg hover:bg-slate-100">
              Team
            </a>
          </div>
        </div>
      </section>

      {/* Story */}
      <section id="story" className="py-14 px-4 bg-white scroll-mt-24">
        <div className="max-w-5xl mx-auto grid lg:grid-cols-3 gap-10 items-start">
          <div className="lg:col-span-2">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Why we built Floropolis
            </h2>
            <div className="space-y-4 text-lg text-slate-700 leading-relaxed">
              <p>
                Floropolis didn&apos;t start as a &quot;big idea.&quot; It started as a pattern we couldn&apos;t ignore:
                flowers that looked great on a list and showed up tired, swapped, or late — and the florist
                was the one left to explain it.
              </p>
              <p>
                We built Floropolis to make sourcing feel predictable again. Fewer handoffs. Tighter cold chain.
                Farm partners we know by name — and whose standards show up in the stems.
              </p>
              <p className="font-semibold text-slate-900">
                If the flowers aren&apos;t right, the florist owns the moment. We built Floropolis to make that moment easier.
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white shadow-xl">
            <div className="text-xs font-bold uppercase tracking-wide text-emerald-100 mb-2">
              The promise
            </div>
            <p className="text-xl leading-relaxed font-semibold">
              Better stems come from better systems — and better relationships.
            </p>
            <div className="mt-4 text-emerald-100 text-sm leading-relaxed">
              Today: Ecuador & Colombia. Soon: partner farms shipping from the US and Mexico for faster turns and more seasonal flexibility.
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-14 px-4 bg-slate-50 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
              Farm → Miami → your door in 4 days
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              We don&apos;t try to be everything. We focus on the part that actually changes flower performance: handling, cold chain, and speed.
            </p>
          </div>
          <ProcessFlow />
          <p className="mt-6 text-center text-sm text-slate-500">
            Cold chain discipline is the difference between day‑3 stems and day‑6 stems.
          </p>
        </div>
      </section>

      {/* Map */}
      <section id="map" className="py-14 px-4 bg-white scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
            Where your flowers come from
          </h2>
          <p className="text-lg text-slate-700 leading-relaxed mb-6 max-w-3xl">
            Our farm partners are in Ecuador and Colombia today — and we&apos;re expanding soon with US and Mexico farms to add speed, seasonality, and backup lanes.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
            <div className="grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
              <div className="p-5">
                <div className="text-sm font-bold text-slate-900 mb-2">Our sourcing network</div>
                <FarmMap />
              </div>
              <div className="p-5">
                <div className="text-sm font-bold text-slate-900 mb-2">What changes when we ship from more regions</div>
                <ul className="text-sm text-slate-700 space-y-1.5">
                  <li>• Faster turns on select items</li>
                  <li>• More flexibility for seasonal windows</li>
                  <li>• A stronger supply chain when weather or freight gets weird</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Meet the farms */}
      <section id="farms" className="py-14 px-4 bg-slate-50 scroll-mt-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
              Meet the farms
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              These aren&apos;t anonymous suppliers. They&apos;re specialists — built around varieties, systems, and people who take pride in the work.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {FARMS.map((farm) => (
              <FarmProfileCard key={farm.id} farm={farm} />
            ))}
          </div>
        </div>
      </section>

      {/* Sustainability */}
      <section id="sustainability" className="py-14 px-4 bg-white scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
              Sustainability (with receipts)
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              We&apos;re not into vague claims. We look for standards and practices that show up in worker wellbeing and in stem performance.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {SUSTAINABILITY_RECEIPTS.map((block) => (
              <div
                key={block.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
              >
                <div className="text-lg font-bold text-slate-900 mb-3">{block.title}</div>
                <ul className="space-y-2 text-slate-700">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="py-14 px-4 bg-slate-50 scroll-mt-24">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">
              Who we are
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              Two people with different backgrounds — floral and farm, then tech — who wanted to fix how flowers get from farm to florist. If you reach out, you&apos;ll talk to one of us.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {TEAM.map((m) => (
              <div key={m.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-xl font-bold text-slate-900">{m.name}</div>
                <p className="text-slate-500 text-sm mt-2 italic">&quot;{m.line}&quot;</p>
                <p className="text-slate-600 mt-4 leading-relaxed">{m.bio}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border-2 border-emerald-600 text-emerald-700 px-7 py-3 rounded-lg font-bold hover:bg-emerald-50 transition-all"
            >
              Talk to us
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 px-4 bg-emerald-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ready to make the switch?</h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/sample-box"
              className="bg-white text-emerald-600 px-10 py-5 rounded-lg text-lg font-bold hover:bg-emerald-50 transition-all"
              onClick={() => pushEvent(CTA_EVENTS.sample_box_click, { cta_location: "about" })}
            >
              Get free sample box
            </Link>
            <Link
              href="/shop"
              className="border-2 border-white text-white px-10 py-5 rounded-lg text-lg font-bold hover:bg-white/10 transition-all"
            >
              Shop now
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
