import Link from "next/link";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { WHATSAPP_NUMBER } from "@/lib/catalog-constants";

export default function QuoteConfirmationPage() {
  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">&#10003;</span>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
          Quote Request Received!
        </h1>

        <p className="text-base text-slate-600 mb-2">
          Our team will review your order and confirm availability within{" "}
          <span className="font-semibold text-slate-800">2 business hours</span>.
        </p>
        <p className="text-sm text-slate-500 mb-8">
          You'll receive a confirmation email with your quote details and next steps.
        </p>

        <div className="bg-slate-50 rounded-xl p-6 mb-8 text-left">
          <h2 className="text-sm font-bold text-slate-800 mb-3">What happens next?</h2>
          <ol className="space-y-2 text-sm text-slate-600">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">1</span>
              <span>We verify product availability and confirm pricing</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">2</span>
              <span>You receive a final quote with delivery details</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">3</span>
              <span>Approve and we ship directly to your door</span>
            </li>
          </ol>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white px-6 py-3 text-sm font-semibold hover:bg-emerald-700"
          >
            Message us on WhatsApp
          </a>
          <Link
            href="/shop"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 text-slate-700 px-6 py-3 text-sm font-semibold hover:bg-slate-50"
          >
            Continue Shopping
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
