"use client";
// ProfileForm — v1 | 2026-03-24 | Job_PM
// Inline-edit for business name, phone, address, instagram on account page

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Pencil, Check, X } from "lucide-react";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
];

interface Profile {
  business_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  instagram: string | null;
  status: string | null;
  koronet_id: string | null;
}

export default function ProfileForm({ profile, userId }: { profile: Profile; userId: string }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [businessName, setBusinessName] = useState(profile.business_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [addressLine1, setAddressLine1] = useState(profile.address_line1 ?? "");
  const [addressLine2, setAddressLine2] = useState(profile.address_line2 ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [state, setState] = useState(profile.state ?? "");
  const [zip, setZip] = useState(profile.zip ?? "");
  const [instagram, setInstagram] = useState(profile.instagram ?? "");

  const handleCancel = () => {
    setBusinessName(profile.business_name ?? "");
    setPhone(profile.phone ?? "");
    setAddressLine1(profile.address_line1 ?? "");
    setAddressLine2(profile.address_line2 ?? "");
    setCity(profile.city ?? "");
    setState(profile.state ?? "");
    setZip(profile.zip ?? "");
    setInstagram(profile.instagram ?? "");
    setEditing(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!businessName.trim()) { setError("Business name is required."); return; }
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("client_profiles")
      .update({
        business_name: businessName.trim(),
        phone: phone.trim() || null,
        address_line1: addressLine1.trim() || null,
        address_line2: addressLine2.trim() || null,
        city: city.trim() || null,
        state: state || null,
        zip: zip.trim() || null,
        instagram: instagram.trim().replace(/^@/, "") || null,
      })
      .eq("user_id", userId);

    setSaving(false);
    if (updateError) { setError("Failed to save. Please try again."); return; }

    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none";

  return (
    <div className="rounded-2xl border border-slate-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-slate-900 text-base">Business Profile</h2>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
          {profile.status && (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              profile.status === "approved" ? "bg-emerald-100 text-emerald-700" :
              profile.status === "rejected" ? "bg-red-100 text-red-700" :
              "bg-amber-100 text-amber-700"
            }`}>
              {profile.status === "approved" ? "Approved" :
               profile.status === "rejected" ? "Rejected" : "Pending approval"}
            </span>
          )}
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-600 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 hover:border-emerald-300"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>
      )}

      <div className="space-y-4">
        {/* Business name */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Business Name</label>
            {editing ? (
              <input type="text" value={businessName} onChange={e => setBusinessName(e.target.value)} className={inputClass} placeholder="Bloom & Co." />
            ) : (
              <p className="text-sm text-slate-900">{profile.business_name || <span className="text-slate-400 italic">Not set</span>}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Phone</label>
            {editing ? (
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="+1 555 000 0000" />
            ) : (
              <p className="text-sm text-slate-900">{profile.phone || <span className="text-slate-400 italic">Not set</span>}</p>
            )}
          </div>
        </div>

        {/* Address */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Delivery Address</label>
          {editing ? (
            <div className="space-y-2">
              <input type="text" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} className={inputClass} placeholder="Street address" />
              <input type="text" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} className={inputClass} placeholder="Suite, unit, etc. (optional)" />
              <div className="grid grid-cols-3 gap-2">
                <input type="text" value={city} onChange={e => setCity(e.target.value)} className={inputClass} placeholder="City" />
                <select value={state} onChange={e => setState(e.target.value)} className={`${inputClass} bg-white`}>
                  <option value="">State</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="text" value={zip} onChange={e => setZip(e.target.value)} className={inputClass} placeholder="ZIP" maxLength={10} />
              </div>
            </div>
          ) : (
            <div className="text-sm text-slate-900">
              {profile.address_line1 ? (
                <>
                  <p>{profile.address_line1}{profile.address_line2 ? `, ${profile.address_line2}` : ""}</p>
                  <p>{[profile.city, profile.state, profile.zip].filter(Boolean).join(", ")}</p>
                </>
              ) : <span className="text-slate-400 italic">Not set</span>}
            </div>
          )}
        </div>

        {/* Instagram */}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Instagram</label>
            {editing ? (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                <input
                  type="text"
                  value={instagram}
                  onChange={e => setInstagram(e.target.value.replace(/^@/, ""))}
                  className={`${inputClass} pl-7`}
                  placeholder="yourshop"
                />
              </div>
            ) : (
              <p className="text-sm text-slate-900">
                {profile.instagram ? `@${profile.instagram}` : <span className="text-slate-400 italic">Not set</span>}
              </p>
            )}
          </div>
          {profile.koronet_id && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Koronet ID</label>
              <p className="text-sm text-slate-900 font-mono">{profile.koronet_id}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
