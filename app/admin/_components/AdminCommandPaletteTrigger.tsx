'use client';

// AdminCommandPaletteTrigger -- the "Search... Cmd+K" pill in the top bar that
// opens the palette via the 'admin-cmdk-open' CustomEvent bus.
// v1 | 2026-05-19 | Job_PM SHELL-V2 [V8 SHADOW]
//
// We dispatch a CustomEvent (rather than lifting open-state into a context)
// because the palette already owns the Cmd+K keyboard listener; this keeps
// state in one place.

export default function AdminCommandPaletteTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent('admin-cmdk-open'))}
      className="text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center gap-2 text-slate-600"
    >
      <span>Search</span>
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono">
        Cmd+K
      </span>
    </button>
  );
}
