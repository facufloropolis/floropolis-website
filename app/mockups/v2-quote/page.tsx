// Floropolis v2 -- Quote streamlined (1-step submit)
// v0.1 | 2026-05-16 | Job_PM [V8 SHADOW]
//
// THE single biggest conversion lever in the platform: 96% abandon at submit (4% complete).
//
// v2 improvements vs current 3-step quote form:
//   - 1-step submit -- everything on one screen, scroll-to-submit
//   - Cart pre-populated from /shop or /inspiration-builder
//   - Save-as-draft on every change (no lost work)
//   - Guest mode (no signup required, email-only)
//   - Inline WhatsApp button "talk to a human" for hesitant buyers
//   - Trust signals next to submit (response time, no commitment)
//   - Auto-detect logged-in state (skips contact form fields)
//   - Optimistic UI: shows "got it" instantly while async submits to DB

'use client';

import { useState } from 'react';
import Link from 'next/link';

type CartItem = { id: string; name: string; vendor: string; boxes: number; stems_per_box: number; price_per_stem: number; delivery_week: string; };

const PREFILLED_CART: CartItem[] = [
  { id: 'eco_freedom_60', name: 'Rose Freedom Red 60cm', vendor: 'Ecoroses ECU', boxes: 2, stems_per_box: 125, price_per_stem: 1.14, delivery_week: 'W20' },
  { id: 'eco_mondial_60', name: 'Rose Mondial 60cm',     vendor: 'Ecoroses ECU', boxes: 1, stems_per_box: 125, price_per_stem: 1.17, delivery_week: 'W20' },
  { id: 'flo_delphinium', name: 'Delphinium Sea Waltz 80cm', vendor: 'Flodecol ECU', boxes: 1, stems_per_box: 200, price_per_stem: 1.61, delivery_week: 'W20' },
];

export default function V2Quote() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(PREFILLED_CART);
  const [name, setName] = useState(loggedIn ? 'Selena Ross' : '');
  const [email, setEmail] = useState(loggedIn ? 'selena@selenaross.com' : '');
  const [phone, setPhone] = useState('');
  const [businessName, setBusinessName] = useState(loggedIn ? 'Selena Ross Flowers' : '');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [savedDraft, setSavedDraft] = useState(false);

  const updateBoxes = (id: string, delta: number) => {
    setCart(cart.map(c => c.id === id ? { ...c, boxes: Math.max(0, c.boxes + delta) } : c).filter(c => c.boxes > 0));
    setSavedDraft(true);
  };

  const removeItem = (id: string) => {
    setCart(cart.filter(c => c.id !== id));
    setSavedDraft(true);
  };

  const totalStems = cart.reduce((s, c) => s + (c.boxes * c.stems_per_box), 0);
  const totalPrice = cart.reduce((s, c) => s + (c.boxes * c.stems_per_box * c.price_per_stem), 0);
  const totalBoxes = cart.reduce((s, c) => s + c.boxes, 0);

  if (submitted) {
    return (
      <div className="min-h-screen bg-emerald-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-emerald-200 p-8 max-w-md text-center">
          <div className="w-16 h-16 mx-auto bg-emerald-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4">OK</div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Got it.</h2>
          <p className="text-sm text-slate-600 mb-1">Quote <span className="font-mono font-semibold text-slate-900">#FLO-2826</span> received.</p>
          <p className="text-sm text-slate-600 mb-4">Facu or JJ will reply within <strong>1 business day</strong> with confirmed pricing + lead time.</p>
          <div className="bg-slate-50 rounded-lg p-3 text-left text-xs mb-4">
            <div className="flex justify-between mb-1"><span className="text-slate-500">Total stems</span><span className="font-semibold">{totalStems.toLocaleString()}</span></div>
            <div className="flex justify-between mb-1"><span className="text-slate-500">Estimated</span><span className="font-semibold">${totalPrice.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Delivery week</span><span className="font-semibold">W20</span></div>
          </div>
          <Link href="/mockups" className="inline-block bg-emerald-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700">Back to mockups</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-[33px] z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/mockups" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">F</div>
            <span className="font-bold text-slate-900 text-base">Floropolis</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 font-semibold">v2</span>
          </Link>
          <button onClick={() => setLoggedIn(!loggedIn)} className="text-xs px-2 py-1 rounded bg-slate-100 text-slate-600 hover:bg-slate-200">
            {loggedIn ? 'Selena Ross (signed in)' : 'Sign in'}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-900">Get a quote</h1>
          <p className="text-sm text-slate-500 mt-1">
            One screen. No multi-step form. We&apos;ll reply within 1 business day.
            {savedDraft && <span className="ml-2 text-xs text-emerald-700">. Draft saved</span>}
          </p>
        </div>

        <div className="grid grid-cols-12 gap-5">
          {/* LEFT: cart + contact (single column form) */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Cart */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">Your selection</h2>
                <span className="text-xs text-slate-400">+ Add more from catalog</span>
              </div>
              {cart.length === 0 ? (
                <div className="text-center py-8 text-sm text-slate-500">
                  Cart empty. Browse the catalog or describe what you need in the notes below.
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 border border-slate-100 rounded-lg">
                      <div className="w-14 h-14 bg-slate-100 rounded border border-slate-200 shrink-0"></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-900">{item.name}</div>
                        <div className="text-[11px] text-slate-500">{item.vendor} . {item.delivery_week} . {item.stems_per_box} stems/box . ${item.price_per_stem.toFixed(2)}/stem</div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => updateBoxes(item.id, -1)} className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-50">-</button>
                        <span className="w-10 text-center text-sm font-semibold">{item.boxes}</span>
                        <button onClick={() => updateBoxes(item.id, 1)} className="w-7 h-7 rounded border border-slate-200 hover:bg-slate-50">+</button>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <div className="text-sm font-bold text-slate-900">${(item.boxes * item.stems_per_box * item.price_per_stem).toFixed(2)}</div>
                        <div className="text-[10px] text-slate-500">{item.boxes * item.stems_per_box} stems</div>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-slate-400 hover:text-red-600 text-lg shrink-0">x</button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Contact (auto-hidden if logged in) */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold text-slate-900">Your details</h2>
                {!loggedIn && (
                  <Link href="/mockups/signup" className="text-xs text-emerald-700 hover:underline">Have an account? Sign in</Link>
                )}
              </div>
              {loggedIn ? (
                <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200 text-xs text-emerald-900">
                  Signed in as <strong>Selena Ross</strong> ({email}). Quote attached to your account.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Your name" value={name} onChange={setName} placeholder="Selena Ross" />
                  <Field label="Business name" value={businessName} onChange={setBusinessName} placeholder="Selena Ross Flowers" />
                  <Field label="Email" value={email} onChange={setEmail} placeholder="selena@selenaross.com" type="email" />
                  <Field label="Phone (optional)" value={phone} onChange={setPhone} placeholder="+1 555 555 5555" type="tel" />
                </div>
              )}
            </section>

            {/* Notes */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5">
              <h2 className="text-sm font-bold text-slate-900 mb-2">Anything else?</h2>
              <p className="text-xs text-slate-500 mb-2">Specific delivery date, alternative varieties OK, event type, recurring schedule.</p>
              <textarea
                value={notes}
                onChange={e => { setNotes(e.target.value); setSavedDraft(true); }}
                rows={4}
                placeholder="e.g. Wedding on Saturday May 31 in Oceano CA. Open to Mondial substitute if Freedom Red is short."
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </section>
          </div>

          {/* RIGHT: sticky submit + trust + WhatsApp */}
          <aside className="col-span-12 lg:col-span-4">
            <div className="sticky top-32 space-y-4">
              {/* Submit card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{totalBoxes} boxes</span>
                  <span>{cart.length} variet{cart.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-0.5">${totalPrice.toFixed(2)}</div>
                <div className="text-[11px] text-slate-500 mb-4">Estimated . {totalStems.toLocaleString()} stems . final price confirmed in reply</div>
                <button
                  onClick={() => setSubmitted(true)}
                  disabled={cart.length === 0 || !email}
                  className="w-full bg-emerald-600 text-white text-sm font-bold py-3 rounded-lg hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Send quote request
                </button>
                <p className="text-[11px] text-slate-500 text-center mt-2">
                  No commitment. We reply within 1 business day.
                </p>
              </div>

              {/* Trust */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900">
                <p className="font-semibold mb-1.5">What happens next</p>
                <ol className="space-y-1 list-decimal list-inside">
                  <li>We confirm pricing + lead time within 1 business day</li>
                  <li>You approve via reply or 1-click</li>
                  <li>Card saved (Stripe), charged 5d before delivery</li>
                </ol>
              </div>

              {/* WhatsApp alternative */}
              <a href="https://wa.me/16452405203?text=Hola,%20quiero%20una%20cotizacion" target="_blank" rel="noopener" className="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-emerald-300 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center text-white font-bold text-xs">WA</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">Prefer to chat?</p>
                    <p className="text-[11px] text-slate-500">Talk to Facu or JJ on WhatsApp. We reply in minutes during business hours.</p>
                  </div>
                </div>
              </a>
            </div>
          </aside>
        </div>
      </main>

      <section className="bg-slate-900 text-slate-300 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-2">v2 quote improvements vs current 3-step form</p>
          <ul className="text-xs space-y-1 list-disc list-inside text-left max-w-2xl mx-auto">
            <li><strong>1-step:</strong> cart + contact + notes + submit on ONE screen. No "next" buttons.</li>
            <li><strong>Pre-populated cart:</strong> items carry over from /shop or /inspiration-builder. No re-entry.</li>
            <li><strong>Auto-save draft</strong> on every change. Browser close doesn&apos;t lose work.</li>
            <li><strong>Logged-in skip:</strong> contact form hidden if signed in -- one less barrier.</li>
            <li><strong>WhatsApp alternative</strong> for hesitant buyers -- captures those who&apos;d otherwise bounce.</li>
            <li><strong>Trust block</strong> shows what happens next -- removes "what am I committing to?" anxiety.</li>
            <li>Target: drop abandon from 96% to ~80% = 5x lift on quotes/visitor.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-md border border-slate-200 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}
