"use client";
// Mockup: /mockups/confirm-address — florist-facing one-click address confirm
// v1 | 2026-06-05 | Job_PM (CPO)
//
// The page a florist lands on from the Brevo email token link. Mobile-first card,
// three local states: confirm -> (edit) -> done. No real token logic, no DB/API.
//
// Style: emerald-600 primary, slate scale, ASCII-clean copy.

import { useState } from "react";

type ViewState = "confirm" | "edit" | "done";

interface Address {
  name: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
}

const PREFILLED: Address = {
  name: "Carolyn Savko",
  line1: "1234 Melrose Ave",
  city: "Los Angeles",
  state: "CA",
  zip: "90038",
};

export default function ConfirmAddressPage() {
  const [view, setView] = useState<ViewState>("confirm");
  const [addr, setAddr] = useState<Address>(PREFILLED);
  const [draft, setDraft] = useState<Address>(PREFILLED);

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10 bg-slate-50">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <span className="text-xl font-bold tracking-tight text-emerald-700">
            Floropolis
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
          {view === "done" ? (
            // ---------------- DONE ----------------
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200">
                <span className="text-emerald-600 text-2xl" aria-hidden>
                  ✓
                </span>
              </div>
              <h1 className="text-lg font-bold text-slate-900">Confirmed</h1>
              <p className="text-sm text-slate-600 mt-2">
                Your box ships Thursday. Tracking lands in your inbox.
              </p>
              <div className="mt-5 rounded-xl bg-slate-50 border border-slate-100 p-3 text-left text-sm text-slate-600">
                <div className="font-medium text-slate-800">{addr.name}</div>
                <div>{addr.line1}</div>
                <div>
                  {addr.city}, {addr.state} {addr.zip}
                </div>
              </div>
            </div>
          ) : view === "edit" ? (
            // ---------------- EDIT ----------------
            <div>
              <h1 className="text-lg font-bold text-slate-900">Edit address</h1>
              <p className="text-sm text-slate-500 mt-1">
                Update where the sample box should ship.
              </p>
              <div className="mt-4 space-y-3">
                <Field
                  label="Name"
                  value={draft.name}
                  onChange={(v) => setDraft({ ...draft, name: v })}
                />
                <Field
                  label="Street address"
                  value={draft.line1}
                  onChange={(v) => setDraft({ ...draft, line1: v })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="City"
                    value={draft.city}
                    onChange={(v) => setDraft({ ...draft, city: v })}
                  />
                  <Field
                    label="State"
                    value={draft.state}
                    onChange={(v) => setDraft({ ...draft, state: v })}
                  />
                  <Field
                    label="ZIP"
                    value={draft.zip}
                    onChange={(v) => setDraft({ ...draft, zip: v })}
                  />
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAddr(draft);
                    setView("confirm");
                  }}
                  className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                >
                  Save address
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(addr);
                    setView("confirm");
                  }}
                  className="text-sm font-medium px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            // ---------------- CONFIRM ----------------
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Hi {addr.name.split(" ")[0]} — confirm your shipping address and
                we&apos;ll ship your sample box
              </h1>

              <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 text-sm text-slate-700">
                <div className="font-medium text-slate-900">{addr.name}</div>
                <div>{addr.line1}</div>
                <div>
                  {addr.city}, {addr.state} {addr.zip}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setView("done")}
                className="mt-5 w-full text-base font-semibold px-4 py-3 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Confirm Address and Ship It
              </button>

              <button
                type="button"
                onClick={() => {
                  setDraft(addr);
                  setView("edit");
                }}
                className="mt-3 w-full text-sm font-medium text-emerald-700 hover:underline"
              >
                Edit address
              </button>
            </div>
          )}
        </div>

        {/* Footer microcopy */}
        <p className="mt-4 text-center text-[12px] text-slate-400">
          One click, no login. This link is unique to your request.
        </p>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Small labeled input.
// ---------------------------------------------------------------------------

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm rounded-lg border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}
