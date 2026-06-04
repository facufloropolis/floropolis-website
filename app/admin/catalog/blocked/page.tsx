// Admin catalog -- BLOCKED view ("what is NOT publishable").
// v1 | 2026-06-04 | Job_PM
//
// Facu's ask: "a view on what is NOT publishable." This server component reads
// catalog_classifications WHERE status='blocked', joins dim_sku for the SKU
// basics (color/size), and LEFT JOINs catalog_repair_state (latest non-verified
// row per sku+gate) to show where each blocker sits in the repair loop.
//
// Grouped by FAILING GATE. Each section carries an owner (per the charter rule):
//   missing_image / missing_contents_description -> Job_PM
//   cost / box / units gates                      -> Rose_BI
// plus a one-line "what fixes it".
//
// Read-only v1: no write actions. A "Route to Rose" API exists
// (/api/admin/rose-queue POST) but it is one-per-SKU, requires a free-text
// reason + a client island, so it is intentionally NOT wired here. Reported.
//
// Data sources (supabase-backup):
//   public.catalog_classifications (status, failing_gates jsonb, vendor, tier, variety)
//   public.dim_sku                 (color_normalized, size_cm, size_grams)
//   public.catalog_repair_state    (state, owner_agent — latest non-verified per sku+gate)
//
// Style: emerald-600 primary, slate scale, ASCII-clean copy — mirrors
// /admin/catalog/approval-queue/page.tsx conventions.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = {
  title: 'Blocked SKUs | Floropolis Admin',
  robots: { index: false, follow: false },
};

// ---------------------------------------------------------------------------
// Gate charter — owner + "what fixes it" per failing gate.
// Owner rule: image/contents copy -> Job_PM; cost/box/units data -> Rose_BI.
// Unknown gates default to Rose_BI (data ownership) and a generic fix line.
// ---------------------------------------------------------------------------

type Owner = 'Job_PM' | 'Rose_BI';

interface GateMeta {
  label: string;
  owner: Owner;
  fix: string;
}

const GATE_META: Record<string, GateMeta> = {
  missing_image: {
    label: 'missing_image',
    owner: 'Job_PM',
    fix: 'Source a product image (chrome sourcing) and attach it to the SKU.',
  },
  missing_contents_description: {
    label: 'missing_contents_description',
    owner: 'Job_PM',
    fix: 'Write the contents / what-is-in-the-bunch copy on the SKU.',
  },
  missing_units_or_bunch: {
    label: 'missing_units_or_bunch',
    owner: 'Rose_BI',
    fix: 'Set pack / stems_per_unit in dim_sku via Rose.',
  },
};

function gateMeta(gate: string): GateMeta {
  return (
    GATE_META[gate] ?? {
      label: gate,
      owner: 'Rose_BI',
      fix: 'Resolve upstream data via Rose.',
    }
  );
}

const OWNER_CLS: Record<Owner, string> = {
  Job_PM: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  Rose_BI: 'bg-blue-50 text-blue-700 border border-blue-200',
};

// Repair-loop state chip. open=grey, routed=blue, landed=green; untracked=slate.
type RepairState = 'open' | 'routed' | 'landed' | 're_scored' | 'verified';
const REPAIR_CHIP: Record<RepairState | 'untracked', { label: string; cls: string }> = {
  open:      { label: 'open',      cls: 'bg-slate-100 text-slate-600 border border-slate-200' },
  routed:    { label: 'routed',    cls: 'bg-blue-50 text-blue-700 border border-blue-200' },
  landed:    { label: 'landed',    cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  re_scored: { label: 're-scored', cls: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  verified:  { label: 'verified',  cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  untracked: { label: 'untracked', cls: 'bg-white text-slate-400 border border-slate-200' },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClassRow {
  sku_id: string;
  vendor: string | null;
  tier: string | null;
  variety: string | null;
  failing_gates: string[] | null;
}

interface DimRow {
  sku_id: string;
  color_normalized: string | null;
  size_cm: number | null;
  size_grams: number | string | null;
}

interface RepairRow {
  sku_id: string;
  gate_id: string;
  state: string;
  owner_agent: string | null;
  opened_at: string | null;
  routed_at: string | null;
  landed_at: string | null;
  rescored_at: string | null;
}

// A blocked-SKU row within a gate section.
interface BlockedSku {
  sku_id: string;
  vendor: string;
  variety: string;
  color: string | null;
  size: string | null;
  tier: string;
  repair_state: RepairState | 'untracked';
  repair_owner: string | null;
}

interface GateSection {
  gate: string;
  meta: GateMeta;
  skus: BlockedSku[];
}

function sizeLabel(cm: number | null, grams: number | string | null): string | null {
  if (cm != null) return `${cm}cm`;
  if (grams != null) {
    const g = typeof grams === 'number' ? grams : parseFloat(grams);
    if (Number.isFinite(g)) return `${g}g`;
  }
  return null;
}

function normRepairState(s: string | null | undefined): RepairState | null {
  if (
    s === 'open' || s === 'routed' || s === 'landed' ||
    s === 're_scored' || s === 'verified'
  ) {
    return s;
  }
  return null;
}

export default async function AdminCatalogBlockedPage() {
  // Auth gate ------------------------------------------------------------
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) redirect('/');

  const adminClient = getBackupServiceClient();
  const emailLc = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    const { data: profile } = await adminClient
      .from('client_profiles')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!profile || profile.status !== 'admin') {
      redirect('/');
    }
  }

  const backup = getBackupServiceClient();

  // Fetch blocked classifications ----------------------------------------
  const { data: classRaw, error: classErr } = await backup
    .from('catalog_classifications')
    .select('sku_id, vendor, tier, variety, failing_gates')
    .eq('status', 'blocked')
    .limit(5000);
  if (classErr) console.error('[admin/catalog/blocked] classifications:', classErr);
  const classRows = (classRaw ?? []) as unknown as ClassRow[];

  const blockedIds = classRows
    .map((r) => r.sku_id)
    .filter((id): id is string => typeof id === 'string');

  // Fetch dim_sku basics (chunked) --------------------------------------
  const dimById = new Map<string, DimRow>();
  for (let i = 0; i < blockedIds.length; i += 500) {
    const chunk = blockedIds.slice(i, i + 500);
    const { data, error } = await backup
      .from('dim_sku')
      .select('sku_id, color_normalized, size_cm, size_grams')
      .in('sku_id', chunk);
    if (error) {
      console.error('[admin/catalog/blocked] dim_sku:', error);
      continue;
    }
    for (const d of (data ?? []) as unknown as DimRow[]) dimById.set(d.sku_id, d);
  }

  // Fetch repair state (latest NON-verified row per sku+gate) ------------
  // Pull all non-verified rows for the blocked SKUs, then reduce to the most
  // recent per (sku_id, gate_id) by the freshest timestamp.
  const repairByKey = new Map<string, RepairRow>();
  for (let i = 0; i < blockedIds.length; i += 500) {
    const chunk = blockedIds.slice(i, i + 500);
    const { data, error } = await backup
      .from('catalog_repair_state')
      .select('sku_id, gate_id, state, owner_agent, opened_at, routed_at, landed_at, rescored_at')
      .in('sku_id', chunk)
      .neq('state', 'verified');
    if (error) {
      console.error('[admin/catalog/blocked] repair_state:', error);
      continue;
    }
    for (const r of (data ?? []) as unknown as RepairRow[]) {
      const key = `${r.sku_id}|${r.gate_id}`;
      const tsOf = (x: RepairRow): number => {
        const t = x.rescored_at ?? x.landed_at ?? x.routed_at ?? x.opened_at;
        return t ? new Date(t).getTime() : 0;
      };
      const prev = repairByKey.get(key);
      if (!prev || tsOf(r) >= tsOf(prev)) repairByKey.set(key, r);
    }
  }

  // Build gate sections --------------------------------------------------
  const sectionMap = new Map<string, BlockedSku[]>();
  for (const c of classRows) {
    const gates = Array.isArray(c.failing_gates) ? c.failing_gates : [];
    const dim = dimById.get(c.sku_id) ?? null;
    for (const g of gates) {
      if (typeof g !== 'string') continue;
      const repair = repairByKey.get(`${c.sku_id}|${g}`) ?? null;
      const repairState = repair ? normRepairState(repair.state) ?? 'untracked' : 'untracked';
      const sku: BlockedSku = {
        sku_id: c.sku_id,
        vendor: c.vendor ?? 'Unknown',
        variety: c.variety ?? '--',
        color: dim?.color_normalized ?? null,
        size: dim ? sizeLabel(dim.size_cm, dim.size_grams) : null,
        tier: c.tier ?? '--',
        repair_state: repairState,
        repair_owner: repair?.owner_agent ?? null,
      };
      const arr = sectionMap.get(g) ?? [];
      arr.push(sku);
      sectionMap.set(g, arr);
    }
  }

  // Order sections by SKU count desc.
  const sections: GateSection[] = Array.from(sectionMap.entries())
    .map(([gate, skus]) => ({
      gate,
      meta: gateMeta(gate),
      skus: skus.sort((a, b) => a.vendor.localeCompare(b.vendor) || a.variety.localeCompare(b.variety)),
    }))
    .sort((a, b) => b.skus.length - a.skus.length);

  // Top summary metrics --------------------------------------------------
  const totalBlocked = blockedIds.length;
  // By-owner split: count distinct blocked SKUs whose failing gates are owned by
  // each owner (a SKU can appear under both owners if it fails both kinds).
  const ownerSkuSets: Record<Owner, Set<string>> = {
    Job_PM: new Set<string>(),
    Rose_BI: new Set<string>(),
  };
  for (const c of classRows) {
    const gates = Array.isArray(c.failing_gates) ? c.failing_gates : [];
    for (const g of gates) {
      if (typeof g !== 'string') continue;
      ownerSkuSets[gateMeta(g).owner].add(c.sku_id);
    }
  }
  // Repair-loop in-flight: blocked SKUs with at least one tracked (non-untracked) repair row.
  const inFlightSkus = new Set<string>();
  for (const [key, r] of repairByKey.entries()) {
    const skuId = key.split('|')[0];
    if (normRepairState(r.state)) inFlightSkus.add(skuId);
  }

  return (
    <main className="max-w-7xl mx-auto px-4 py-10">
      {/* Breadcrumb + back link */}
      <nav className="text-xs text-slate-500 mb-2" aria-label="Breadcrumb">
        <Link href="/admin/catalog" className="hover:text-emerald-700">Catalog</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700 font-medium">Blocked</span>
      </nav>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">What is not publishable</h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl">
            Every SKU with a blocking gate failing, grouped by the gate that
            blocks it. Owner per the charter: image and contents copy are Job_PM;
            cost / box / units data are Rose_BI. Read-only view. Source:
            catalog_classifications + dim_sku + catalog_repair_state on
            supabase-backup.
          </p>
        </div>
        <Link
          href="/admin/catalog"
          className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-700"
        >
          ← Back to catalog
        </Link>
      </div>

      {/* Top summary bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-red-700/70">Total blocked</div>
          <div className="text-2xl font-bold mt-0.5 text-red-900">{totalBlocked.toLocaleString()}</div>
          <div className="text-[11px] mt-0.5 text-red-700/70">SKUs that cannot publish</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">By owner</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${OWNER_CLS.Job_PM}`}>
              Job_PM {ownerSkuSets.Job_PM.size}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${OWNER_CLS.Rose_BI}`}>
              Rose_BI {ownerSkuSets.Rose_BI.size}
            </span>
          </div>
          <div className="text-[11px] mt-1.5 text-slate-400">Distinct blocked SKUs per gate owner</div>
        </div>
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="text-[11px] uppercase tracking-wide text-blue-700/70">Repair loop in flight</div>
          <div className="text-2xl font-bold mt-0.5 text-blue-900">{inFlightSkus.size.toLocaleString()}</div>
          <div className="text-[11px] mt-0.5 text-blue-700/70">Blocked SKUs with a tracked repair row</div>
        </div>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-6 text-sm text-emerald-700 font-medium">
          Nothing blocked — every SKU clears its blocking gates.
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.gate} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              {/* Section header: gate + count + owner + what fixes it */}
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-slate-800">{s.meta.label}</span>
                    <span className="text-sm text-slate-500">— {s.skus.length.toLocaleString()} SKUs</span>
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${OWNER_CLS[s.meta.owner]}`}>
                    {s.meta.owner}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">What fixes it: {s.meta.fix}</p>
              </div>

              {/* Rows */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white border-b border-slate-100">
                    <tr className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-2">Vendor</th>
                      <th className="px-4 py-2">Variety</th>
                      <th className="px-4 py-2">Color</th>
                      <th className="px-4 py-2">Size</th>
                      <th className="px-4 py-2">Tier</th>
                      <th className="px-4 py-2">Repair state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.skus.map((sku) => {
                      const chip = REPAIR_CHIP[sku.repair_state];
                      return (
                        <tr key={`${sku.sku_id}-${s.gate}`} className="border-b border-slate-50 last:border-b-0 hover:bg-slate-50">
                          <td className="px-4 py-2 text-slate-700">{sku.vendor}</td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/admin/catalog/${sku.sku_id}`}
                              className="text-slate-900 hover:text-emerald-700 hover:underline"
                            >
                              {sku.variety}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-slate-600">{sku.color ?? '--'}</td>
                          <td className="px-4 py-2 text-slate-600">{sku.size ?? '--'}</td>
                          <td className="px-4 py-2 text-slate-600">{sku.tier}</td>
                          <td className="px-4 py-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${chip.cls}`}>
                              {chip.label}
                            </span>
                            {sku.repair_owner && sku.repair_state !== 'untracked' && (
                              <span className="ml-1.5 text-[10px] text-slate-400">{sku.repair_owner}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 mt-8">
        Read-only v1. Routing a blocked SKU to Rose is available per-SKU on the
        SKU detail page via /api/admin/rose-queue; a bulk action is not wired
        here. Sources: supabase-backup catalog_classifications (status=blocked),
        dim_sku (color/size), catalog_repair_state (latest non-verified per
        sku+gate).
      </p>
    </main>
  );
}
