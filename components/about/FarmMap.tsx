import { SOURCING_NETWORK, type MapPin } from "@/lib/about-farms";

function pinColor(kind: MapPin["kind"]) {
  switch (kind) {
    case "hub":
      return "bg-emerald-600";
    case "coming-soon":
      return "bg-amber-500";
    default:
      return "bg-slate-800";
  }
}

export default function FarmMap() {
  const active = SOURCING_NETWORK.filter((l) => l.kind !== "coming-soon");
  const comingSoon = SOURCING_NETWORK.filter((l) => l.kind === "coming-soon");

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-slate-700">
      {active.map((loc) => (
        <span key={`${loc.country}-${loc.name}`} className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pinColor(loc.kind)}`} aria-hidden />
          {loc.name}
          {loc.region !== "—" && (
            <span className="text-slate-500">({loc.region})</span>
          )}
        </span>
      ))}
      {comingSoon.map((loc) => (
        <span key={`${loc.country}-${loc.name}`} className="flex items-center gap-1.5 text-slate-600">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pinColor(loc.kind)}`} aria-hidden />
          {loc.country} <span className="text-slate-500 text-xs">(coming soon)</span>
        </span>
      ))}
    </div>
  );
}
