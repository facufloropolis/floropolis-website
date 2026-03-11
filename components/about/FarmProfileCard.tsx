import Link from "next/link";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import type { FarmProfile } from "@/lib/about-farms";
import { handleOutboundClick, CTA_EVENTS } from "@/lib/gtm";

export default function FarmProfileCard({ farm }: { farm: FarmProfile }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
      <div className="p-6 bg-gradient-to-br from-slate-50 to-white border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold text-slate-900">{farm.name}</div>
            <div className="text-sm text-slate-600 mt-1">{farm.regionLabel}</div>
          </div>
          <a
            href={farm.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) =>
              handleOutboundClick(e, CTA_EVENTS.shop_now_click, {
                cta_location: "about_farm_card",
                outbound: farm.website,
                farm: farm.id,
              })
            }
            className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-emerald-700"
          >
            Website <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <p className="mt-4 text-slate-700 leading-relaxed">{farm.vibeLine}</p>
      </div>

      <div className="p-6 flex-1">
        <div className="mb-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
            What they grow
          </div>
          <div className="flex flex-wrap gap-2">
            {farm.whatTheyGrow.map((x) => (
              <span
                key={x}
                className="text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-full"
              >
                {x}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap gap-4">
          {farm.proof.map((p) => (
            <div key={p.label} className="flex gap-2 items-start min-w-0 flex-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                <div className="text-xs text-slate-600 leading-snug">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 pt-0">
        {farm.shopHref.startsWith("http") ? (
          <a
            href={farm.shopHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) =>
              handleOutboundClick(e, CTA_EVENTS.shop_now_click, {
                cta_location: "about_farm_card_shop",
                outbound: farm.shopHref,
                farm: farm.id,
              })
            }
            className="block w-full text-center bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            {farm.shopCtaLabel}
          </a>
        ) : (
          <Link
            href={farm.shopHref}
            className="block w-full text-center bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors"
          >
            {farm.shopCtaLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
