import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found | Floropolis",
  description: "The page you're looking for doesn't exist. Browse our wholesale flower catalog or get a free sample box.",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-50 flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        <div className="text-6xl mb-4">🌸</div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Page Not Found</h1>
        <p className="text-lg text-slate-600 mb-8">
          This page doesn&apos;t exist — but our flowers do. Let us point you somewhere useful.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Link
            href="/sample-box"
            className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            Get Free Sample Box
          </Link>
          <Link
            href="/shop"
            className="border-2 border-emerald-600 text-emerald-600 px-6 py-3 rounded-lg font-bold hover:bg-emerald-50 transition-colors"
          >
            Browse Catalog
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Link href="/shop/roses" className="bg-white rounded-xl border border-slate-200 p-3 hover:border-emerald-300 hover:shadow-sm transition-all">
            <div className="text-xl mb-1">🌹</div>
            <div className="font-medium text-slate-700">Roses</div>
          </Link>
          <Link href="/shop/tropicals" className="bg-white rounded-xl border border-slate-200 p-3 hover:border-emerald-300 hover:shadow-sm transition-all">
            <div className="text-xl mb-1">🌺</div>
            <div className="font-medium text-slate-700">Tropicals</div>
          </Link>
          <Link href="/shop/greens" className="bg-white rounded-xl border border-slate-200 p-3 hover:border-emerald-300 hover:shadow-sm transition-all">
            <div className="text-xl mb-1">🌿</div>
            <div className="font-medium text-slate-700">Greens</div>
          </Link>
          <Link href="/shop/combo-boxes" className="bg-white rounded-xl border border-slate-200 p-3 hover:border-emerald-300 hover:shadow-sm transition-all">
            <div className="text-xl mb-1">📦</div>
            <div className="font-medium text-slate-700">Combo Boxes</div>
          </Link>
        </div>

        <p className="mt-8 text-sm text-slate-400">
          Need help?{" "}
          <Link href="/contact" className="text-emerald-600 hover:underline">
            Contact us
          </Link>{" "}
          or{" "}
          <a href="https://wa.me/17869308463" className="text-emerald-600 hover:underline" target="_blank" rel="noopener noreferrer">
            WhatsApp us
          </a>
        </p>
      </div>
    </div>
  );
}
