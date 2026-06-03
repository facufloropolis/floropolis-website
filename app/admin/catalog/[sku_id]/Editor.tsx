// Client island: per-SKU inline editors + admin actions.
// v1 | 2026-05-18 | Job_PM CAT-S4 [V8 SHADOW]
//
// All editors POST to /api/admin/catalog/sku/[id]/update with a single
// {field, value} payload, then router.refresh() to repaint the server-rendered
// page with the new mirror values + new gate state.
//
// Admin-action buttons (force_publish / force_hide / forward_to_rose / reset)
// POST to /api/admin/catalog/sku/[id]/admin-action.

'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

interface SaveResult {
  ok: boolean;
  error?: string;
}

async function postUpdate(
  skuId: string,
  field: string,
  value: unknown,
): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/admin/catalog/sku/${skuId}/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, value }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.detail
          ? `${body.error ?? `HTTP ${res.status}`}: ${body.detail}`
          : (body.error ?? `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

async function postAdminAction(
  skuId: string,
  action: 'force_publish' | 'force_hide' | 'forward_to_rose' | 'reset',
  notes?: string,
): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/admin/catalog/sku/${skuId}/admin-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, notes }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        error: body.detail
          ? `${body.error ?? `HTTP ${res.status}`}: ${body.detail}`
          : (body.error ?? `HTTP ${res.status}`),
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

// ---------------------------------------------------------------------------
// Generic shell -- handles busy/error/refresh for every field type
// ---------------------------------------------------------------------------

interface SaverState {
  busy: boolean;
  error: string | null;
}

function useSaver(skuId: string): {
  state: SaverState;
  save: (field: string, value: unknown) => Promise<boolean>;
} {
  const router = useRouter();
  const [state, setState] = useState<SaverState>({ busy: false, error: null });
  async function save(field: string, value: unknown): Promise<boolean> {
    setState({ busy: true, error: null });
    const r = await postUpdate(skuId, field, value);
    if (r.ok) {
      setState({ busy: false, error: null });
      router.refresh();
      return true;
    }
    setState({ busy: false, error: r.error ?? 'failed' });
    return false;
  }
  return { state, save };
}

function Status({ state }: { state: SaverState }) {
  if (state.busy) return <span className="text-[11px] text-slate-500">Saving...</span>;
  if (state.error) {
    return <span className="text-[11px] text-red-600 font-mono">{state.error}</span>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Field editors
// ---------------------------------------------------------------------------

export function PriceEditor({
  skuId,
  current,
}: {
  skuId: string;
  current: number | null;
}) {
  const { state, save } = useSaver(skuId);
  const [value, setValue] = useState<string>(current != null ? String(current) : '');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
          return;
        }
        await save('price', n);
      }}
    >
      <span className="text-xs text-slate-500">$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state.busy}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
      >
        Save
      </button>
      <Status state={state} />
    </form>
  );
}

export function MarginStatusEditor({
  skuId,
  current,
}: {
  skuId: string;
  current: string | null;
}) {
  const { state, save } = useSaver(skuId);
  const [value, setValue] = useState<string>(current ?? 'UNKNOWN');
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      >
        <option value="TRACKED">TRACKED</option>
        <option value="PENDING">PENDING</option>
        <option value="UNKNOWN">UNKNOWN</option>
        <option value="OVERRIDE">OVERRIDE</option>
      </select>
      <button
        type="button"
        disabled={state.busy}
        onClick={() => save('margin_status', value)}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
      >
        Save
      </button>
      <Status state={state} />
    </div>
  );
}

export function VerifyCostButton({ skuId }: { skuId: string }) {
  const { state, save } = useSaver(skuId);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={state.busy}
        onClick={() => save('cost_verified_at', '__now__')}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Mark cost verified (now)
      </button>
      <Status state={state} />
    </div>
  );
}

export function CostSourceEditor({
  skuId,
  current,
}: {
  skuId: string;
  current: string | null;
}) {
  const { state, save } = useSaver(skuId);
  const [value, setValue] = useState<string>(current ?? '');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await save('cost_source', value || null);
      }}
    >
      <input
        type="text"
        value={value}
        placeholder="vendor name / source description"
        onChange={(e) => setValue(e.target.value)}
        className="w-72 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
        maxLength={240}
      />
      <button
        type="submit"
        disabled={state.busy}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
      >
        Save
      </button>
      <Status state={state} />
    </form>
  );
}

export function ClearPriceAlertButton({ skuId }: { skuId: string }) {
  const { state, save } = useSaver(skuId);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={state.busy}
        onClick={() => save('has_open_price_alert', false)}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Clear price alert
      </button>
      <Status state={state} />
    </div>
  );
}

export function DateEditor({
  skuId,
  field,
  current,
  label,
}: {
  skuId: string;
  field: 'arrival_date' | 'deal_expiry';
  current: string | null;
  label: string;
}) {
  const { state, save } = useSaver(skuId);
  const [value, setValue] = useState<string>(current ? current.slice(0, 10) : '');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await save(field, value || null);
      }}
    >
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <button
        type="submit"
        disabled={state.busy}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
      >
        Save {label}
      </button>
      <Status state={state} />
    </form>
  );
}

export function ImagesEditor({
  skuId,
  current,
}: {
  skuId: string;
  current: string[];
}) {
  const { state, save } = useSaver(skuId);
  const [urls, setUrls] = useState<string[]>(current.length > 0 ? current : ['']);

  function updateAt(i: number, v: string) {
    setUrls((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  }
  function addRow() {
    if (urls.length >= 12) return;
    setUrls((prev) => [...prev, '']);
  }
  function removeAt(i: number) {
    setUrls((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-2">
      {urls.map((u, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={u}
            onChange={(e) => updateAt(i, e.target.value)}
            placeholder="/images/shop/..."
            className="flex-1 text-sm border border-slate-300 rounded-md px-2 py-1 font-mono focus:border-emerald-500 focus:outline-none"
            maxLength={600}
          />
          <button
            type="button"
            onClick={() => removeAt(i)}
            className="text-xs text-slate-500 hover:text-red-600 px-2"
          >
            Remove
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={urls.length >= 12}
          className="text-xs text-slate-700 border border-slate-300 hover:border-emerald-400 px-2 py-1 rounded-md disabled:opacity-50"
        >
          + Add another
        </button>
        <button
          type="button"
          disabled={state.busy}
          onClick={() =>
            save(
              'images',
              urls.map((u) => u.trim()).filter((u) => u.length > 0),
            )
          }
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
        >
          Save images
        </button>
        <Status state={state} />
      </div>
    </div>
  );
}

export function ContentsNoteEditor({
  skuId,
  current,
}: {
  skuId: string;
  current: string | null;
}) {
  const { state, save } = useSaver(skuId);
  const [value, setValue] = useState<string>(current ?? '');
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="e.g. 10 stems per bunch, 12 bunches per box, FullStar variety 35cm"
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={state.busy}
          onClick={() => save('contents_note', value || null)}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
        >
          Save contents
        </button>
        <Status state={state} />
      </div>
    </div>
  );
}

export function VendorEditor({
  skuId,
  current,
}: {
  skuId: string;
  current: string | null;
}) {
  const { state, save } = useSaver(skuId);
  const [value, setValue] = useState<string>(current ?? '');
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await save('vendor', value || null);
      }}
    >
      <input
        type="text"
        value={value}
        placeholder="vendor name"
        onChange={(e) => setValue(e.target.value)}
        className="w-64 text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
        maxLength={240}
      />
      <button
        type="submit"
        disabled={state.busy}
        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-md disabled:opacity-50"
      >
        Save vendor
      </button>
      <Status state={state} />
    </form>
  );
}

export function LiveToggleButton({
  skuId,
  current,
}: {
  skuId: string;
  current: boolean | null;
}) {
  // 2026-05-19 — per Rose contract v1.0 PB-1: this button NO LONGER writes to
  // floropolis_inventory.live (Komet-driven, JOB_LOCKED). It now proposes a
  // visibility_override (sibling table with mandatory reason + 30d expiry).
  // The live=Komet badge stays as read-only state. The override is a separate badge.
  const target = current ? 'hide' : 'show';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const router = useRouter();

  const propose = async () => {
    const reason = window.prompt(
      `Reason for ${target === 'show' ? 'force-publishing' : 'admin-hiding'} this SKU? (min 5 chars, will be in audit log)`,
      '',
    );
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) setErr('Reason must be at least 5 characters');
      return;
    }
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'visibility_override.create',
          target_table: 'visibility_overrides',
          target_id: String(skuId),
          payload: { sku_id: skuId, decision: target, reason: reason.trim() },
          source_rationale: reason.trim(),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (!res.ok) {
        setErr(json.error ?? `HTTP ${res.status}`);
      } else {
        setOk(true);
        setTimeout(() => router.refresh(), 600);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600">
        Komet live = <span className="font-mono">{String(Boolean(current))}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={propose}
        className="text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300 hover:bg-amber-200 px-3 py-1.5 rounded-md disabled:opacity-50"
        title="Creates a proposal that, once approved, inserts a visibility_override row. Does NOT write to floropolis_inventory.live (Komet-driven per Rose contract)."
      >
        {busy ? 'Proposing…' : `Propose admin ${target === 'show' ? 'force-publish' : 'hide'}`}
      </button>
      {ok && <span className="text-xs text-emerald-700">✓ proposed</span>}
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}

export function AcceptDeviationButton({ skuId }: { skuId: string }) {
  const router = useRouter();
  const [state, setState] = useState<SaverState>({ busy: false, error: null });
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={state.busy}
        onClick={async () => {
          if (!confirm('Mark this SKU as admin-overridden publish (accept formula deviation)?')) {
            return;
          }
          setState({ busy: true, error: null });
          const r = await postAdminAction(
            skuId,
            'force_publish',
            'accepted formula_deviation',
          );
          if (r.ok) {
            setState({ busy: false, error: null });
            router.refresh();
          } else {
            setState({ busy: false, error: r.error ?? 'failed' });
          }
        }}
        className="text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-md disabled:opacity-50"
      >
        Accept deviation (force publish)
      </button>
      <Status state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema TODO stub -- shown for last_harvested_date + vase_life_days
// ---------------------------------------------------------------------------

export function SchemaTodoStub({ column }: { column: string }) {
  return (
    <div className="text-xs text-slate-500 italic">
      Schema TODO: add column <span className="font-mono">{column}</span> to
      v_catalog_admin (read-only view — edits go through admin_proposals). No editor available yet --
      tracked in /admin/catalog/config future migration list.
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin actions panel
// ---------------------------------------------------------------------------

interface AdminActionsProps {
  skuId: string;
  currentReviewerNotes: string | null;
}

export function AdminActions({
  skuId,
  currentReviewerNotes,
}: AdminActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>(currentReviewerNotes ?? '');

  async function run(
    action: 'force_publish' | 'force_hide' | 'forward_to_rose' | 'reset',
  ) {
    const label =
      action === 'force_publish'
        ? 'force publish'
        : action === 'force_hide'
          ? 'force hide'
          : action === 'forward_to_rose'
            ? 'forward to Rose'
            : 'reset to validator decision';
    if (!confirm(`${label} SKU ${skuId}?`)) return;
    setBusy(action);
    setError(null);
    const r = await postAdminAction(skuId, action, notes || undefined);
    if (r.ok) {
      setBusy(null);
      router.refresh();
    } else {
      setBusy(null);
      setError(r.error ?? 'failed');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Reviewer notes (saved with the action)"
        className="w-full text-sm border border-slate-300 rounded-md px-2 py-1 focus:border-emerald-500 focus:outline-none"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('force_publish')}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'force_publish' ? 'Saving...' : 'Force publish'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('force_hide')}
          className="text-xs font-semibold text-red-700 border border-red-200 hover:border-red-400 hover:bg-red-50 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'force_hide' ? 'Saving...' : 'Force hide'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('forward_to_rose')}
          className="text-xs font-semibold text-amber-800 border border-amber-200 hover:border-amber-400 hover:bg-amber-50 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'forward_to_rose' ? 'Saving...' : 'Forward to Rose'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run('reset')}
          className="text-xs font-semibold text-slate-700 border border-slate-300 hover:border-slate-500 hover:bg-slate-50 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy === 'reset' ? 'Saving...' : 'Reset to validator decision'}
        </button>
      </div>
      {error && <span className="text-[11px] text-red-600 font-mono">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AskRoseButton — routes a failing gate to Rose via rose_queue
// ---------------------------------------------------------------------------
// Every gate card gets this button. Clicking expands a textarea so Facu can
// type context before sending. The API records: gate, SKU snapshot, who
// flagged it, what Facu wrote, and when — so Rose has full context in one row.

type FlagState = 'idle' | 'open' | 'sending' | 'sent' | 'duplicate' | 'error';

export function AskRoseButton({
  skuId,
  gateId,
  gateLabel,
}: {
  skuId: string;
  gateId: string;
  gateLabel: string;
}) {
  const [state, setState] = useState<FlagState>('idle');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function submit() {
    setState('sending');
    try {
      const res = await fetch(`/api/admin/catalog/sku/${skuId}/flag-rose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason_code: gateId, context_note: note }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        error?: string;
        detail?: string;
      };
      if (body.status === 'duplicate') {
        setState('duplicate');
      } else if (res.ok && body.status === 'inserted') {
        setState('sent');
      } else {
        setState('error');
        setErrorMsg(body.detail ?? body.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setState('error');
      setErrorMsg(e instanceof Error ? e.message : 'network error');
    }
  }

  if (state === 'sent') {
    return (
      <p className="mt-2 text-[11px] text-emerald-700 font-semibold">
        ✓ Flagged to Rose — gate: {gateId}
      </p>
    );
  }

  if (state === 'duplicate') {
    return (
      <p className="mt-2 text-[11px] text-slate-500">
        Already open in Rose queue for this gate.
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-2">
      {state === 'idle' && (
        <button
          type="button"
          onClick={() => setState('open')}
          className="text-[11px] text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
        >
          Ask Rose →
        </button>
      )}

      {(state === 'open' || state === 'sending' || state === 'error') && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-600 font-medium">
            Flag to Rose:{' '}
            <span className="font-mono text-slate-800">{gateId}</span>
            {' — '}{gateLabel}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Context for Rose — what you found, what decision you need (optional)"
            className="w-full text-[11px] border border-slate-200 rounded-md p-2 focus:border-amber-400 focus:outline-none resize-none leading-relaxed"
            rows={2}
            maxLength={500}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={submit}
              disabled={state === 'sending'}
              className="text-[11px] font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md disabled:opacity-50"
            >
              Send to Rose
            </button>
            <button
              type="button"
              onClick={() => { setState('idle'); setNote(''); setErrorMsg(''); }}
              className="text-[11px] text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            {state === 'error' && (
              <span className="text-[11px] text-red-600 font-mono">{errorMsg}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
