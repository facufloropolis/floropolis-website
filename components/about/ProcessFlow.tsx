import { SUPPLY_CHAIN } from "@/lib/about-farms";

export default function ProcessFlow() {
  return (
    <ol className="grid md:grid-cols-5 gap-4">
      {SUPPLY_CHAIN.map((step, idx) => (
        <li
          key={step.title}
          className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Step {idx + 1}
            </span>
            <span className="h-7 w-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-sm font-bold">
              {idx + 1}
            </span>
          </div>
          <div className="text-lg font-bold text-slate-900 mb-1">{step.title}</div>
          <div className="text-sm text-slate-600">{step.detail}</div>
        </li>
      ))}
    </ol>
  );
}
