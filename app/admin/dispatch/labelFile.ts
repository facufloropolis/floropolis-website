// D2 — FedEx label-input file builder for one dispatch date.
// v1 | 2026-06-09 | Job_PM dispatch-enrich
//
// Assembles ONE CSV row per box for the dispatch date with the FedEx label
// columns the rep needs to generate labels:
//   ship_name / address / city / state / zip / phone / country  (sample_box_status)
//   box dims (length/width/height cm) + chargeable weight (box_master, matched
//     on box_type -> box_family) run through lib/deal/fedex-estimate.ts
//   reference (tracking_number; falls back to business_name)
//
// HARD BAR: REAL data only. PROD is read-only. Any column missing in PROD is
// emitted as "--" (never fabricated). A null PROD client / query error returns
// an honest empty file (header + a single "no rows" comment line), never throws.
//
// Sources (PROD swhglnjyuorkycpgkmec, getProdReadClient — READ ONLY):
//   dispatch_tracking  -> boxes for the date (spine; tracking_number + ship_date)
//   sample_box_status  -> per-box ship_* address fields + box_type + business_name
//   box_master         -> fedex_length_cm/width_cm/height_cm, fedex_chargeable_kg,
//                         stems_per_box, matched by box_family == box_type
//
// NOTE on the live data: as of this build sample_box_status.ship_* are NULL for
// the current dispatch corpus, so address columns render "--" honestly. The box
// dims + weight + reference ARE real. The file is correct the moment Rose
// backfills ship_* — no code change needed.

import { getProdReadClient } from '@/lib/supabase/prod-server';
import { estimateBoxCost, RATE_PER_KG } from '@/lib/deal/fedex-estimate';

// Output column order (header row of the CSV).
export const LABEL_FILE_COLUMNS = [
  'reference',          // tracking_number (or business_name fallback)
  'ship_name',          // sample_box_status.ship_name
  'ship_address',       // sample_box_status.ship_address
  'ship_city',          // sample_box_status.ship_city
  'ship_state',         // sample_box_status.ship_state
  'ship_zip',           // sample_box_status.ship_zip
  'ship_phone',         // sample_box_status.ship_phone
  'ship_country',       // sample_box_status.ship_country
  'box_type',           // sample_box_status.box_type
  'box_length_cm',      // box_master.fedex_length_cm (matched on box_family)
  'box_width_cm',       // box_master.fedex_width_cm
  'box_height_cm',      // box_master.fedex_height_cm
  'chargeable_kg',      // max(real, dim) chargeable kg via fedex-estimate
  'est_freight_usd',    // chargeableKg * RATE_PER_KG (estimate; broker confirms)
  'recipient',          // business_name
] as const;

export interface LabelFileResult {
  configured: boolean;     // false = PROD client not configured
  error: string | null;
  date: string;
  rowCount: number;
  csv: string;             // ready-to-download CSV (always has the header row)
  filename: string;
}

const MISSING = '--';

function csvEscape(v: unknown): string {
  if (v == null || v === '') return MISSING;
  let s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Map a sample_box_status.box_type to a box_master.box_family. The sample box
// is recorded as box_type='SAMPLE' but lives in box_master under family 'SB'.
// Anything else is passed through unchanged (already a family code: EB/QB/HB...).
function boxTypeToFamily(boxType: string | null): string | null {
  if (!boxType) return null;
  const t = boxType.trim().toUpperCase();
  if (t === 'SAMPLE' || t === 'SAMPLE BOX') return 'SB';
  return t;
}

// Preferred box_master variant per family for dispatch (verified 2026-06-09
// against PROD box_master). Several families have MULTIPLE active variants
// (e.g. EB has EB-M / EB-MF / two 'standard' rows; QB has QB-M / QB-MF / ...),
// so picking blindly is non-deterministic. SB — the only family the sample
// dispatch actually uses today — has a SINGLE active row 'SB-M' and NO
// 'standard' variant, so we must not key on 'standard'. We name the preferred
// variant per family explicitly here; if a family is not listed we fall back
// to 'standard' then to the first active row (see pickVariant). To change the
// dispatch variant for a family, edit this map (config), not the selection
// logic below.
const PREFERRED_VARIANT_BY_FAMILY: Record<string, string> = {
  SB: 'SB-M',
};

// Decide whether candidate `r` should replace the currently-chosen `existing`
// row for a family. Preference order, highest first:
//   1) the explicitly-preferred variant for the family (PREFERRED_VARIANT_BY_FAMILY)
//   2) the 'standard' variant (legacy default)
//   3) the first active row encountered (deterministic-enough fallback)
// Returns true to keep/replace with `r`, false to keep `existing`.
function preferVariant(
  fam: string,
  existing: Record<string, unknown> | undefined,
  candidate: Record<string, unknown>,
): boolean {
  if (!existing) return true;
  const preferred = PREFERRED_VARIANT_BY_FAMILY[fam];
  const code = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const candCode = code(candidate.variant_code);
  const existCode = code(existing.variant_code);
  // Rank: 2 = explicitly preferred, 1 = 'standard', 0 = anything else.
  const rank = (c: string): number => {
    if (preferred && c === preferred.toLowerCase()) return 2;
    if (c === 'standard') return 1;
    return 0;
  };
  return rank(candCode) > rank(existCode);
}

function headerCsv(): string {
  return LABEL_FILE_COLUMNS.join(',');
}

function emptyResult(date: string, configured: boolean, error: string | null): LabelFileResult {
  const csv =
    headerCsv() +
    '\n# no boxes for ' + date + (error ? ` (error: ${error})` : '') + '\n';
  return {
    configured,
    error,
    date,
    rowCount: 0,
    csv,
    filename: `floropolis_labels_${date}.csv`,
  };
}

// Build the label file for one dispatch date. NULL-safe + honest-empty.
export async function buildLabelFile(date: string): Promise<LabelFileResult> {
  const client = getProdReadClient();
  if (!client) return emptyResult(date, false, null);

  try {
    // 1) boxes for the date (spine) ----------------------------------------
    const { data: trkRaw, error: trkErr } = await client
      .from('dispatch_tracking')
      .select('tracking_number, ship_date')
      .eq('ship_date', date);
    if (trkErr) return emptyResult(date, true, trkErr.message);
    const trackingNumbers = ((trkRaw ?? []) as Array<Record<string, unknown>>)
      .map((t) => (typeof t.tracking_number === 'string' ? t.tracking_number : null))
      .filter((v): v is string => !!v);
    if (trackingNumbers.length === 0) return emptyResult(date, true, null);

    // 2) per-box ship_* + box_type from sample_box_status ------------------
    const { data: sbRaw } = await client
      .from('sample_box_status')
      .select(
        'tracking_number, business_name, box_type, ship_name, ship_address, ship_city, ship_state, ship_zip, ship_phone, ship_country',
      )
      .in('tracking_number', trackingNumbers);
    const sbByTn: Record<string, Record<string, unknown>> = {};
    for (const r of (sbRaw ?? []) as Array<Record<string, unknown>>) {
      const tn = typeof r.tracking_number === 'string' ? r.tracking_number : null;
      if (tn) sbByTn[tn] = r;
    }

    // 3) box_master dims, indexed by box_family (mapped from box_type) ------
    const families = Array.from(
      new Set(
        Object.values(sbByTn)
          .map((r) => boxTypeToFamily(typeof r.box_type === 'string' ? r.box_type : null))
          .filter((v): v is string => !!v),
      ),
    );
    const dimsByFamily: Record<string, Record<string, unknown>> = {};
    if (families.length > 0) {
      const { data: bmRaw } = await client
        .from('box_master')
        .select('box_family, variant_code, fedex_length_cm, fedex_width_cm, fedex_height_cm, fedex_chargeable_kg, stems_per_box, active')
        .in('box_family', families)
        .eq('active', true);
      // Pick one row per family: explicit preferred variant > 'standard' >
      // first active (see preferVariant). Keyed on real variant flags, not a
      // bare 'standard' assumption (SB has only 'SB-M', no 'standard').
      for (const r of (bmRaw ?? []) as Array<Record<string, unknown>>) {
        const fam = typeof r.box_family === 'string' ? r.box_family : null;
        if (!fam) continue;
        if (preferVariant(fam, dimsByFamily[fam], r)) dimsByFamily[fam] = r;
      }
    }

    // 4) assemble one row per box ------------------------------------------
    const lines: string[] = [headerCsv()];
    let rowCount = 0;
    for (const tn of trackingNumbers) {
      const sb = sbByTn[tn] ?? {};
      const boxType = typeof sb.box_type === 'string' ? sb.box_type : null;
      const family = boxTypeToFamily(boxType);
      const dims = family ? dimsByFamily[family] : undefined;

      const lengthCm = dims ? num(dims.fedex_length_cm) : null;
      const widthCm = dims ? num(dims.fedex_width_cm) : null;
      const heightCm = dims ? num(dims.fedex_height_cm) : null;
      const realKg = dims ? num(dims.fedex_chargeable_kg) : null;
      const capacity = dims ? num(dims.stems_per_box) ?? 0 : 0;

      let chargeableKg: number | null = null;
      let estFreight: number | null = null;
      if (lengthCm != null && widthCm != null && heightCm != null) {
        const est = estimateBoxCost({
          lengthCm,
          widthCm,
          heightCm,
          realKg: realKg ?? 0,
          capacity,
        });
        chargeableKg = Math.round(est.chargeableKg * 100) / 100;
        estFreight = Math.round(est.chargeableKg * RATE_PER_KG * 100) / 100;
      } else if (realKg != null) {
        // No dims but a known chargeable weight: still emit the real weight + est.
        chargeableKg = realKg;
        estFreight = Math.round(realKg * RATE_PER_KG * 100) / 100;
      }

      const row: Record<(typeof LABEL_FILE_COLUMNS)[number], unknown> = {
        reference: tn || sb.business_name,
        ship_name: sb.ship_name,
        ship_address: sb.ship_address,
        ship_city: sb.ship_city,
        ship_state: sb.ship_state,
        ship_zip: sb.ship_zip,
        ship_phone: sb.ship_phone,
        ship_country: sb.ship_country,
        box_type: boxType,
        box_length_cm: lengthCm,
        box_width_cm: widthCm,
        box_height_cm: heightCm,
        chargeable_kg: chargeableKg,
        est_freight_usd: estFreight,
        recipient: sb.business_name,
      };
      lines.push(LABEL_FILE_COLUMNS.map((c) => csvEscape(row[c])).join(','));
      rowCount += 1;
    }

    return {
      configured: true,
      error: null,
      date,
      rowCount,
      csv: lines.join('\n') + '\n',
      filename: `floropolis_labels_${date}.csv`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return emptyResult(date, true, msg);
  }
}
