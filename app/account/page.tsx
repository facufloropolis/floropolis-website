// Account page — v2 | 2026-03-24 | Job_PM
// Added: profile display + inline edit (business name, address, instagram, phone)

export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import SignOutButton from "./SignOutButton";
import ProfileForm from "./ProfileForm";

export const metadata = {
  title: "My Account | Floropolis",
  description: "Manage your Floropolis wholesale account.",
};

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?next=/account");
  }

  const { data: profile } = await supabase
    .from("client_profiles")
    .select("business_name, phone, address_line1, address_line2, city, state, zip, instagram, status, koronet_id")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">My Account</h1>
            <p className="text-slate-500 mt-1 text-sm">{user.email}</p>
          </div>
          <SignOutButton />
        </div>

        {/* Profile info */}
        {profile && <ProfileForm profile={profile} userId={user.id} />}

        {/* Quick actions */}
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <Link
            href="/shop"
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-6 hover:border-emerald-300 hover:shadow-md transition-all"
          >
            <span className="text-2xl">🌹</span>
            <span className="font-bold text-slate-900">Browse Catalog</span>
            <span className="text-sm text-slate-500">Shop 270+ varieties</span>
          </Link>

          <Link
            href="/quote"
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-6 hover:border-emerald-300 hover:shadow-md transition-all"
          >
            <span className="text-2xl">📋</span>
            <span className="font-bold text-slate-900">My Quotes</span>
            <span className="text-sm text-slate-500">Review pending orders</span>
          </Link>

          <Link
            href="/sample-box"
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 p-6 hover:border-emerald-300 hover:shadow-md transition-all"
          >
            <span className="text-2xl">📦</span>
            <span className="font-bold text-slate-900">Sample Box</span>
            <span className="text-sm text-slate-500">Try before you order</span>
          </Link>
        </div>

        {/* Coming soon */}
        <div className="rounded-2xl bg-slate-50 border border-slate-200 p-8 text-center">
          <div className="text-4xl mb-3">🚧</div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Order history coming soon</h2>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            We're building your order history, standing orders, and invoices.
            In the meantime, reach out via WhatsApp for any order questions.
          </p>
          <a
            href="https://wa.me/17869308463?text=Hi%2C%20I%20have%20a%20question%20about%20my%20Floropolis%20account."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors"
          >
            💬 WhatsApp us
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
