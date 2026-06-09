// Deal Builder read layer: client search/intel (PROD, read-only), catalog varieties + box types (BACKUP).
// v1 | 2026-06-09 | Job_PM (CPO)
//
// Reads are READ-ONLY. price_floor is Rose's authority — never recompute, only read it.
// NULL-safe: never throw on a read; degrade to [] / null / "--".

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';
import type { ClientLite, ClientIntel, CatalogVariety, BoxType } from './types';

const DASH = '--';

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function str(v: unknown): string | null {
  if (typeof v === 'string') {
    const t = v.trim();
    return t === '' ? null : t;
  }
  if (typeof v === 'number') return String(v);
  return null;
}

function strOrDash(v: unknown): string {
  return str(v) ?? DASH;
}

function arrToStr(v: unknown): string | null {
  if (Array.isArray(v)) {
    const parts = v.map((x) => str(x)).filter((x): x is string => x !== null);
    return parts.length ? parts.join(', ') : null;
  }
  return str(v);
}

/**
 * searchClients — PROD v_sample_review joined to v_sample_engagement (+ florist_ecosystem
 * for interest_score) by lead_master_id. Filters by q over name/city.
 * source='sample_box' for sample-origin rows. Returns [] if PROD client unavailable.
 */
export async function searchClients(q: string): Promise<ClientLite[]> {
  try {
    const prod = getProdReadClient();
    if (!prod) return [];

    const term = (q ?? '').trim();

    let query = prod
      .from('v_sample_review')
      .select(
        'lead_master_id, business_name, city, state, lead_status, sb_qualification, fe_touchpoints_total, fe_call_count',
      )
      .limit(50);

    if (term) {
      query = query.or(`business_name.ilike.%${term}%,city.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];

    const ids = data
      .map((r) => num((r as Record<string, unknown>).lead_master_id))
      .filter((x): x is number => x !== null);

    // Engagement (talk seconds + touchpoints) keyed by lead_master_id.
    const engByLead = new Map<number, { talk: number | null; touch: number | null }>();
    if (ids.length) {
      const { data: eng } = await prod
        .from('v_sample_engagement')
        .select('lead_master_id, calls_duration_total_s, touchpoints_total')
        .in('lead_master_id', ids);
      if (Array.isArray(eng)) {
        for (const e of eng as Record<string, unknown>[]) {
          const id = num(e.lead_master_id);
          if (id !== null) {
            engByLead.set(id, {
              talk: num(e.calls_duration_total_s),
              touch: num(e.touchpoints_total),
            });
          }
        }
      }
    }

    // Interest score from florist_ecosystem (lead_id == lead_master_id).
    const interestByLead = new Map<number, number | null>();
    if (ids.length) {
      const { data: fe } = await prod
        .from('florist_ecosystem')
        .select('lead_id, interest_score')
        .in('lead_id', ids);
      if (Array.isArray(fe)) {
        for (const f of fe as Record<string, unknown>[]) {
          const id = num(f.lead_id);
          if (id !== null) interestByLead.set(id, num(f.interest_score));
        }
      }
    }

    return (data as Record<string, unknown>[]).map((r) => {
      const leadId = num(r.lead_master_id);
      const eng = leadId !== null ? engByLead.get(leadId) : undefined;
      const touchpoints = eng?.touch ?? num(r.fe_touchpoints_total) ?? num(r.fe_call_count);
      return {
        id: leadId !== null ? String(leadId) : `sr_${str(r.business_name) ?? 'unknown'}`,
        leadMasterId: leadId,
        name: str(r.business_name) ?? DASH,
        city: str(r.city),
        state: str(r.state),
        source: 'sample_box',
        status: str(r.lead_status),
        heat: str(r.sb_qualification),
        interestScore: leadId !== null ? interestByLead.get(leadId) ?? null : null,
        interactions: touchpoints,
        talkSeconds: eng?.talk ?? null,
      } satisfies ClientLite;
    });
  } catch {
    return [];
  }
}

/**
 * getClientIntel — full intel for one lead from v_sample_review (+ engagement, outcome,
 * florist_ecosystem, sample_box_status ship_*). NULL-safe; returns null only if no review row.
 */
export async function getClientIntel(leadMasterId: number): Promise<ClientIntel | null> {
  try {
    const prod = getProdReadClient();
    if (!prod) return null;

    const { data: review, error } = await prod
      .from('v_sample_review')
      .select(
        [
          'lead_master_id',
          'business_name',
          'city',
          'state',
          'lead_status',
          'sb_qualification',
          'fe_touchpoints_total',
          'fe_call_count',
          'sb_current_supplier',
          'sb_prices_they_pay',
          'sb_business_type',
          'sb_pitch_resonated',
          'sb_objections_raw',
          'sb_objection',
          'sb_key_quote',
          'last_call_outcome',
          'email',
          'phone',
          'address',
          'ship_address',
          'ship_zip',
          'region',
          'days_in_funnel',
        ].join(', '),
      )
      .eq('lead_master_id', leadMasterId)
      .limit(1)
      .maybeSingle();

    if (error || !review) return null;
    const r = review as unknown as Record<string, unknown>;

    // Engagement.
    const { data: engRow } = await prod
      .from('v_sample_engagement')
      .select('calls_duration_total_s, touchpoints_total')
      .eq('lead_master_id', leadMasterId)
      .limit(1)
      .maybeSingle();
    const eng = (engRow as Record<string, unknown> | null) ?? null;

    // Outcome (converted + revenue).
    const { data: outRow } = await prod
      .from('v_sample_outcome')
      .select('converted, total_revenue')
      .eq('lead_master_id', leadMasterId)
      .limit(1)
      .maybeSingle();
    const out = (outRow as Record<string, unknown> | null) ?? null;

    // Florist ecosystem (interest score + website-ish data jsonb).
    const { data: feRow } = await prod
      .from('florist_ecosystem')
      .select('interest_score, data, current_supplier, prices_they_pay')
      .eq('lead_id', leadMasterId)
      .limit(1)
      .maybeSingle();
    const fe = (feRow as Record<string, unknown> | null) ?? null;

    // Sample box status ship_* (preferred shipping/contact address).
    const { data: sbsRow } = await prod
      .from('sample_box_status')
      .select('ship_address, ship_city, ship_state, ship_zip, ship_phone')
      .eq('lead_master_id', leadMasterId)
      .limit(1)
      .maybeSingle();
    const sbs = (sbsRow as Record<string, unknown> | null) ?? null;

    let website: string | null = null;
    if (fe && fe.data && typeof fe.data === 'object' && !Array.isArray(fe.data)) {
      const d = fe.data as Record<string, unknown>;
      website = str(d.website) ?? str(d.url) ?? str(d.domain);
    }

    const address =
      str(sbs?.ship_address) ?? str(r.ship_address) ?? str(r.address);
    const zip = str(sbs?.ship_zip) ?? str(r.ship_zip);
    const phone = str(r.phone) ?? str(sbs?.ship_phone);
    const objections = str(r.sb_objections_raw) ?? str(r.sb_objection);
    const touchpoints =
      num(eng?.touchpoints_total) ?? num(r.fe_touchpoints_total) ?? num(r.fe_call_count);

    return {
      id: String(leadMasterId),
      leadMasterId,
      name: str(r.business_name) ?? DASH,
      city: str(sbs?.ship_city) ?? str(r.city),
      state: str(sbs?.ship_state) ?? str(r.state),
      source: 'sample_box',
      status: str(r.lead_status),
      heat: str(r.sb_qualification),
      interestScore: num(fe?.interest_score),
      interactions: touchpoints,
      talkSeconds: num(eng?.calls_duration_total_s),
      address: address ?? DASH,
      zip: zip ?? DASH,
      email: strOrDash(r.email),
      phone: phone ?? DASH,
      currentSupplier:
        str(r.sb_current_supplier) ?? str(fe?.current_supplier) ?? DASH,
      pricesTheyPay:
        arrToStr(r.sb_prices_they_pay) ?? arrToStr(fe?.prices_they_pay) ?? DASH,
      businessType: strOrDash(r.sb_business_type),
      likes: strOrDash(r.sb_pitch_resonated),
      objections: objections ?? DASH,
      keyQuote: strOrDash(r.sb_key_quote),
      lastCallOutcome: strOrDash(r.last_call_outcome),
      converted: typeof out?.converted === 'boolean' ? (out.converted as boolean) : null,
      revenueL365: num(out?.total_revenue),
      website: website ?? str(r.region) ?? DASH,
      daysInFunnel: num(r.days_in_funnel),
    } satisfies ClientIntel;
  } catch {
    return null;
  }
}

/**
 * searchCatalogVarieties — BACKUP v_catalog_admin. price_floor is read verbatim (Rose's authority).
 * Filters by q over variety. Returns [] on any error.
 */
export async function searchCatalogVarieties(q: string): Promise<CatalogVariety[]> {
  try {
    const backup = getBackupServiceClient();
    const term = (q ?? '').trim();

    let query = backup
      .from('v_catalog_admin')
      .select('variety, tier, length, farm_cost, price_floor, gpm_actual, box_type, units_per_box, cost_source')
      .limit(100);

    if (term) {
      query = query.ilike('variety', `%${term}%`);
    }

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];

    return (data as Record<string, unknown>[])
      .filter((r) => str(r.variety) !== null)
      .map((r) => ({
        variety: str(r.variety) as string,
        tier: str(r.tier),
        grade: str(r.length),
        farmCost: num(r.farm_cost),
        priceFloor: num(r.price_floor),
        gpmActual: num(r.gpm_actual),
        boxType: str(r.box_type),
        stemsPerBox: num(r.units_per_box),
        costSource: str(r.cost_source),
      }) satisfies CatalogVariety);
  } catch {
    return [];
  }
}

/**
 * getBoxTypes — BACKUP active box rows from box_master_mirror (the live box_master source).
 * Returns [] on any error.
 */
export async function getBoxTypes(): Promise<BoxType[]> {
  try {
    const backup = getBackupServiceClient();

    const { data, error } = await backup
      .from('box_master_mirror')
      .select('legacy_box_type, box_family, variant_code, stems_per_box, fedex_chargeable_kg, vendor_canonical_name, active')
      .eq('active', true)
      .limit(500);

    if (error || !Array.isArray(data)) return [];

    return (data as Record<string, unknown>[])
      .map((r) => {
        const label =
          str(r.legacy_box_type) ??
          str(r.variant_code) ??
          str(r.box_family) ??
          DASH;
        return {
          boxType: label,
          stemsPerBox: num(r.stems_per_box),
          chargeableKg: num(r.fedex_chargeable_kg),
          vendor: str(r.vendor_canonical_name),
        } satisfies BoxType;
      })
      .filter((b) => b.boxType !== DASH);
  } catch {
    return [];
  }
}
