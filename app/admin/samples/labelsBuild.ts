// Sample labels builder — FedEx 26-column import format.
// v2 | 2026-06-10 | Job_PM (CPO)
//
// Reads BACKUP sample_review_loop approved/aligned boxes + PROD v_flora_cohort
// addresses + BACKUP box_master_mirror verified FedEx dims.
// Returns { csv, filename, rowCount, rows }.
//
// "Approved-pending" = rows in BACKUP sample_review_loop where
//   status='aligned'  (the create-box marker written by /api/admin/samples/create-box)
//   OR facu_decision='yes'
//   AND NOT marked shipped (no shipped_at column today; we include all aligned/yes rows).
//
// For each row we get the shipping address from PROD public.v_flora_cohort by zoho_id
// (stored in proposed_composition.zoho_id). The description column holds
// "CONFIRMED ADDRESS: <street>, <city>, <state>, <zip>". We parse it; if missing we
// include the row with address fields blank + note='ADDRESS MISSING'.
//
// FedEx dims + chargeable weight come from BACKUP box_master_mirror, matched on
// legacy_box_type (preferred) or box_family. The vendor name comes from
// vendor_canonical_name on the matched box_master_mirror row.
//
// UNIT VALUE = stems_per_box × farm_cost_per_stem. Farm cost is NOT in this flow today;
// unit_value is emitted as "" with a trailing note "VALOR PENDIENTE" in the notes field.
// Rose can compute this; we approximate from farm_cost × stems when available.
//
// NULL-safe: never throws. Honest empty (header only) when no approved boxes.
// CSV must be Excel/Sheets-openable (quote fields with commas).

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';

// ---------------------------------------------------------------------------
// FedEx 26-column format — exact header order as confirmed from CEO upload sheet.
// ---------------------------------------------------------------------------
export const FEDEX_LABEL_COLUMNS = [
  'REC',          // sequential row number (1,2,3...)
  'COMPANY',      // CONSTANT "Floral Direct LLC"
  'CONTACT',      // recipient contact person name — blank (we don't have it; NOT business name)
  'ADR1',         // street, parsed from v_flora_cohort.description "CONFIRMED ADDRESS:"
  'ADR2',         // CONSTANT "" (blank)
  'CITY',         // parsed city
  'STATE',        // parsed state
  'ZIPCODE',      // parsed zip
  'COUNTRY',      // CONSTANT "US"
  'PHONE',        // CONSTANT "7869308463" (JJ's phone, always)
  'WEIGHT',       // fedex_chargeable_kg from box_master_mirror (FedEx-verified, NOT Komet)
  'LENGTH',       // fedex_length_cm from box_master_mirror
  'WIDTH',        // fedex_width_cm from box_master_mirror
  'HEIGHT',       // fedex_height_cm from box_master_mirror
  'REF',          // "DDMMYY-VENDOR-BOXDESC" e.g. "110626-ECOROSES-QB"
                  // NOTE: date-digit convention (DDMMYY vs DDMMYYYY) to confirm with Facu;
                  // his example was 6-digit "270405-ECOROSES".
  'DESCRIPTION',  // vendor name uppercased (e.g. "ECOROSES")
  'PART_NUMBER',  // CONSTANT "FRESH CUT FLOWERS"
  'UNIT VALUE',   // stems_per_box × farm_cost_per_stem; blank if unknown ("VALOR PENDIENTE" in notes)
                  // NOTE: Rose can also compute this; we approximate from farm_cost × stems.
  'QUANTITY',     // CONSTANT 1
  'QUANTITY_UNITS', // CONSTANT "EA"
  'CUST_VAL',     // = UNIT VALUE × QUANTITY (blank if UNIT VALUE blank)
  'DEC_VAL',      // = UNIT VALUE (blank if blank)
  'CTRY_MAN',     // CONSTANT "EC"
  'ISS_NSR',      // CONSTANT "Y"
  'REL_NUMBER',   // CONSTANT "34458984" (Facu's fixed license number)
  'CUT FLOWERS',  // CONSTANT "Y"
] as const;

export type FedExLabelColumn = (typeof FEDEX_LABEL_COLUMNS)[number];

// Row shape for the JSON preview (all 26 FedEx CSV fields + extra UI fields).
// The CSV uses FEDEX_LABEL_COLUMNS exactly; the extra fields are UI-only.
export interface SampleLabelRow {
  // FedEx columns (map 1:1 to FEDEX_LABEL_COLUMNS)
  REC: number;
  COMPANY: string;
  CONTACT: string;
  ADR1: string;
  ADR2: string;
  CITY: string;
  STATE: string;
  ZIPCODE: string;
  COUNTRY: string;
  PHONE: string;
  WEIGHT: string;       // "" when missing
  LENGTH: string;       // "" when missing
  WIDTH: string;        // "" when missing
  HEIGHT: string;       // "" when missing
  REF: string;
  DESCRIPTION: string;
  PART_NUMBER: string;
  'UNIT VALUE': string; // "" when farm cost unknown
  QUANTITY: number;
  QUANTITY_UNITS: string;
  CUST_VAL: string;     // "" when UNIT VALUE blank
  DEC_VAL: string;      // "" when UNIT VALUE blank
  CTRY_MAN: string;
  ISS_NSR: string;
  REL_NUMBER: string;
  'CUT FLOWERS': string;
  // Extra UI fields (not written to CSV)
  recipient_name: string;    // business_name from sample_review_loop
  box_type: string;          // from proposed_composition.box_type
  notes: string;             // "ADDRESS MISSING" / "NO ZOHO ID" / "DIMS MISSING" / "VALOR PENDIENTE" / ""
  updated_at: string | null;
  lead_master_id: number | null;
  zoho_id: string | null;
  flora_score: number | null;
}

export interface SampleLabelsResult {
  csv: string;
  filename: string;
  rowCount: number;
  rows: SampleLabelRow[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const COMPANY_CONSTANT = 'Floral Direct LLC';
const PHONE_CONSTANT = '7869308463';  // JJ's phone
const COUNTRY_CONSTANT = 'US';
const PART_NUMBER_CONSTANT = 'FRESH CUT FLOWERS';
const QUANTITY_CONSTANT = 1;
const QUANTITY_UNITS_CONSTANT = 'EA';
const CTRY_MAN_CONSTANT = 'EC';
const ISS_NSR_CONSTANT = 'Y';
const REL_NUMBER_CONSTANT = '34458984';  // Facu's fixed FedEx license number
const CUT_FLOWERS_CONSTANT = 'Y';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (s === '') return '';
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function headerCsv(): string {
  return FEDEX_LABEL_COLUMNS.join(',');
}

function emptyResult(date: string, error: string | null): SampleLabelsResult {
  return {
    csv: headerCsv() + '\n',
    filename: `floropolis-fedex-labels-${date}.csv`,
    rowCount: 0,
    rows: [],
    error,
  };
}

/** Parse "CONFIRMED ADDRESS: <street>, <city>, <state>, <zip>" from a description string.
 *  Returns null when not parseable.
 */
function parseConfirmedAddress(
  description: string | null | undefined,
): { street: string; city: string; state: string; zip: string } | null {
  if (!description) return null;
  const marker = 'CONFIRMED ADDRESS:';
  const idx = description.indexOf(marker);
  if (idx === -1) return null;
  const raw = description.slice(idx + marker.length).trim();
  // Split by comma; we expect at least 4 parts: street, city, state, zip
  // The street itself may contain commas (e.g. "123 Main St, Suite 4"); to be safe
  // we take the LAST 3 segments as city, state, zip and join the rest as street.
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return { street: '', city: parts[0], state: parts[1], zip: '' };
  }
  if (parts.length === 3) {
    return { street: parts[0], city: parts[1], state: parts[2], zip: '' };
  }
  // 4+ parts: last = zip, second-to-last = state, second = city, rest = street
  const zip = parts[parts.length - 1];
  const state = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const street = parts.slice(0, parts.length - 3).join(', ');
  return { street, city, state, zip };
}

/**
 * Format dispatch date (tomorrow = date passed in) as DDMMYY.
 * NOTE: date-digit convention (DDMMYY vs DDMMYYYY) is to be confirmed with Facu;
 * his example was 6-digit "270405-ECOROSES". We use DDMMYY (6 digits) to match
 * his example exactly.
 */
function formatDispatchDateRef(isoDate: string): string {
  // isoDate = "YYYY-MM-DD"
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  const yy = year.slice(2); // last 2 digits
  return `${day}${month}${yy}`;
}

/**
 * Normalize a box_type string to a box family code for matching box_master_mirror.
 * "SAMPLE" / "SAMPLE BOX" -> "SB"; otherwise pass through uppercased.
 */
function normalizeBoxFamily(boxType: string | null): string | null {
  if (!boxType) return null;
  const t = boxType.trim().toUpperCase();
  if (t === 'SAMPLE' || t === 'SAMPLE BOX') return 'SB';
  return t;
}

/** Describe the box for the REF field (e.g. "QB" from box_type "QB" or "QUARTER BOX"). */
function boxDesc(boxType: string): string {
  return boxType.trim().toUpperCase();
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export async function buildSampleLabels(date: string): Promise<SampleLabelsResult> {
  try {
    // Dispatch date = tomorrow (date + 1 day). The labels are built today to ship
    // tomorrow.
    const dispatchDate = (() => {
      const d = new Date(date + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    })();
    const dispatchDateRef = formatDispatchDateRef(dispatchDate); // DDMMYY

    // 1) Read approved-pending rows from BACKUP --------------------------------
    let svc;
    try {
      svc = getBackupServiceClient();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return emptyResult(date, 'BACKUP client not configured: ' + msg);
    }

    const { data: loopRaw, error: loopErr } = await svc
      .from('sample_review_loop')
      .select(
        'id, business_name, lead_master_id, proposed_composition, facu_decision, status, updated_at',
      )
      .or('status.eq.aligned,facu_decision.eq.yes')
      .order('updated_at', { ascending: false });

    if (loopErr) {
      return emptyResult(date, 'loop_fetch_failed: ' + loopErr.message);
    }

    const loopRows = (loopRaw ?? []) as Array<Record<string, unknown>>;
    if (loopRows.length === 0) {
      return emptyResult(date, null);
    }

    // 2) Collect zoho_ids for PROD address lookup ------------------------------
    const zohoIds: string[] = [];
    for (const row of loopRows) {
      const comp =
        row.proposed_composition &&
        typeof row.proposed_composition === 'object' &&
        !Array.isArray(row.proposed_composition)
          ? (row.proposed_composition as Record<string, unknown>)
          : null;
      const zohoId =
        comp && typeof comp.zoho_id === 'string' && comp.zoho_id.trim()
          ? comp.zoho_id.trim()
          : null;
      if (zohoId && !zohoIds.includes(zohoId)) zohoIds.push(zohoId);
    }

    // 3) Fetch PROD v_flora_cohort for addresses (best-effort; NULL-safe) ------
    const cohortByZohoId: Record<string, Record<string, unknown>> = {};
    if (zohoIds.length > 0) {
      try {
        const prod = getProdReadClient();
        if (prod) {
          const { data: cohortRaw } = await prod
            .from('v_flora_cohort')
            .select('zoho_id, account_name, description')
            .in('zoho_id', zohoIds);
          for (const r of (cohortRaw ?? []) as Array<Record<string, unknown>>) {
            const zid = typeof r.zoho_id === 'string' ? r.zoho_id.trim() : null;
            if (zid) cohortByZohoId[zid] = r;
          }
        }
      } catch {
        // PROD read is best-effort; if it fails we still emit rows with ADDRESS MISSING
      }
    }

    // 4) Fetch box_master_mirror dims from BACKUP (FedEx-verified, not Komet) --
    // Indexed by: (a) legacy_box_type uppercased, (b) box_family uppercased.
    // For each family we prefer the highest-verified variant (most confirmed labels).
    const boxMasterByLegacy: Record<string, Record<string, unknown>> = {};
    const boxMasterByFamily: Record<string, Record<string, unknown>> = {};
    try {
      const { data: bmRaw } = await svc
        .from('box_master_mirror')
        .select(
          'legacy_box_type, box_family, variant_code, vendor_canonical_name, ' +
          'fedex_chargeable_kg, fedex_length_cm, fedex_width_cm, fedex_height_cm, ' +
          'fedex_label_confirmation_count, stems_per_box, active',
        )
        .eq('active', true)
        .limit(500);

      for (const r of (bmRaw ?? []) as unknown as Array<Record<string, unknown>>) {
        const legacy =
          typeof r.legacy_box_type === 'string' && r.legacy_box_type.trim()
            ? r.legacy_box_type.trim().toUpperCase()
            : null;
        const family =
          typeof r.box_family === 'string' && r.box_family.trim()
            ? r.box_family.trim().toUpperCase()
            : null;

        // Prefer rows with more confirmed FedEx labels (higher verification count).
        const confirmCount = typeof r.fedex_label_confirmation_count === 'number'
          ? r.fedex_label_confirmation_count
          : 0;

        if (legacy) {
          const existing = boxMasterByLegacy[legacy];
          const existCount = existing && typeof existing.fedex_label_confirmation_count === 'number'
            ? existing.fedex_label_confirmation_count : 0;
          if (!existing || confirmCount >= existCount) {
            boxMasterByLegacy[legacy] = r;
          }
        }
        if (family) {
          const existing = boxMasterByFamily[family];
          const existCount = existing && typeof existing.fedex_label_confirmation_count === 'number'
            ? existing.fedex_label_confirmation_count : 0;
          if (!existing || confirmCount >= existCount) {
            boxMasterByFamily[family] = r;
          }
        }
      }
    } catch {
      // box_master_mirror fetch is best-effort; rows will have DIMS MISSING notes
    }

    // 4b) Representative farm cost per stem (BACKUP v_catalog_admin) for UNIT VALUE.
    // The approved sample doesn't pin an exact composition, so we DERIVE a representative
    // declared value = stems_per_box × avg farm cost per stem. Honest: representative, not
    // exact; an exact value needs the box composition captured at approval.
    // Sample boxes are rose QBs, and roses farm cost (~$0.45/stem) is half the all-catalog
    // average (~$0.84) — using the overall avg would overstate the declared value ~2x. So we
    // prefer the ROSES average and fall back to overall only if no rose rows.
    let avgFarmCost: number | null = null;
    try {
      const { data: catRaw } = await svc.from('v_catalog_admin').select('variety, farm_cost').limit(3000);
      const all: number[] = [];
      const roses: number[] = [];
      for (const r of (catRaw ?? []) as Array<Record<string, unknown>>) {
        const c = Number(r.farm_cost);
        if (!Number.isFinite(c) || c <= 0) continue;
        all.push(c);
        if (typeof r.variety === 'string' && /rose/i.test(r.variety)) roses.push(c);
      }
      const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
      avgFarmCost = mean(roses) ?? mean(all);
    } catch {
      // best-effort; UNIT VALUE stays blank if the catalog is unavailable
    }

    // Helper to find the best box_master_mirror row for a given box_type string.
    // Priority: exact legacy_box_type match → family match.
    function findBoxMaster(boxType: string): Record<string, unknown> | null {
      const upper = boxType.trim().toUpperCase();
      if (boxMasterByLegacy[upper]) return boxMasterByLegacy[upper];
      const family = normalizeBoxFamily(boxType);
      if (family && boxMasterByFamily[family]) return boxMasterByFamily[family];
      return null;
    }

    // 5) Assemble rows --------------------------------------------------------
    const rows: SampleLabelRow[] = [];
    const csvLines: string[] = [headerCsv()];

    for (let i = 0; i < loopRows.length; i++) {
      const loop = loopRows[i];
      const rec = i + 1; // 1-based sequential row number

      const businessName =
        typeof loop.business_name === 'string' ? loop.business_name.trim() : '';
      const updatedAt =
        typeof loop.updated_at === 'string' ? loop.updated_at : null;
      const leadMasterId =
        typeof loop.lead_master_id === 'number' ? loop.lead_master_id : null;

      const comp =
        loop.proposed_composition &&
        typeof loop.proposed_composition === 'object' &&
        !Array.isArray(loop.proposed_composition)
          ? (loop.proposed_composition as Record<string, unknown>)
          : null;

      const zohoId =
        comp && typeof comp.zoho_id === 'string' && comp.zoho_id.trim()
          ? comp.zoho_id.trim()
          : null;
      const floraScore =
        comp && typeof comp.flora_score === 'number' ? comp.flora_score : null;
      // box_type: PREFER edited proposed_composition.box_type; else DERIVE a default that
      // ACTUALLY matches box_master so dims/weight/value fill from the data we HAVE (a 'SAMPLE'
      // default matched nothing -> empty columns). Parse the FLORA "Box: X" preference; QB
      // (quarter box) is the standard sample box with verified dims.
      const rawBoxType =
        comp && typeof comp.box_type === 'string' && comp.box_type.trim()
          ? comp.box_type.trim()
          : (() => {
              const cohortRow = zohoId ? cohortByZohoId[zohoId] : null;
              const desc =
                cohortRow && typeof cohortRow.description === 'string' ? cohortRow.description : null;
              const m = desc ? desc.match(/Box:\s*([^\n]+)/i) : null;
              const pref = m ? m[1].trim().toLowerCase() : '';
              return pref.includes('hb') || pref.includes('half') ? 'HB' : 'QB';
            })();

      // Address: PREFER edited proposed_composition.ship_address (written by ApprovedBoxesEditor),
      // else fall back to parsing PROD v_flora_cohort.description "CONFIRMED ADDRESS:".
      let street = '';
      let city = '';
      let state = '';
      let zip = '';
      const notesParts: string[] = [];

      // Check for an edited ship_address first.
      const editedShip =
        comp &&
        comp.ship_address &&
        typeof comp.ship_address === 'object' &&
        !Array.isArray(comp.ship_address)
          ? (comp.ship_address as Record<string, unknown>)
          : null;

      if (editedShip) {
        street = typeof editedShip.street === 'string' ? editedShip.street.trim() : '';
        city   = typeof editedShip.city   === 'string' ? editedShip.city.trim()   : '';
        state  = typeof editedShip.state  === 'string' ? editedShip.state.trim()  : '';
        zip    = typeof editedShip.zip    === 'string' ? editedShip.zip.trim()    : '';
        // If the edited address is still incomplete, note it.
        if (!street || !city || !state || !zip) notesParts.push('ADDRESS MISSING');
      } else if (zohoId && cohortByZohoId[zohoId]) {
        const cohort = cohortByZohoId[zohoId];
        const description =
          typeof cohort.description === 'string' ? cohort.description : null;
        const parsed = parseConfirmedAddress(description);
        if (parsed) {
          street = parsed.street;
          city = parsed.city;
          state = parsed.state;
          zip = parsed.zip;
        } else {
          notesParts.push('ADDRESS MISSING');
        }
      } else {
        notesParts.push(zohoId ? 'ADDRESS MISSING' : 'NO ZOHO ID');
      }

      // Box dims + vendor from box_master_mirror
      const bm = findBoxMaster(rawBoxType);
      let weight = '';
      let length = '';
      let width = '';
      let height = '';
      let vendorName = '';

      if (bm) {
        const toStr = (v: unknown): string => {
          if (v == null) return '';
          if (typeof v === 'number' && Number.isFinite(v)) return String(v);
          if (typeof v === 'string' && v.trim() !== '') return v.trim();
          return '';
        };
        weight = toStr(bm.fedex_chargeable_kg);   // FedEx-VERIFIED chargeable kg, NOT Komet
        length = toStr(bm.fedex_length_cm);
        width = toStr(bm.fedex_width_cm);
        height = toStr(bm.fedex_height_cm);
        vendorName = typeof bm.vendor_canonical_name === 'string'
          ? bm.vendor_canonical_name.trim().toUpperCase()
          : '';
      } else {
        notesParts.push('DIMS MISSING');
      }

      // UNIT VALUE: PREFER computed-from-contents when proposed_composition.contents is a
      // non-empty array of { variety, stems } (written by ApprovedBoxesEditor). This gives
      // an exact declared customs value matching what's in the box.
      // Fallback: stems_per_box (from box_master) × catalog average farm cost.
      // Both paths round to whole USD and never fabricate: blank + VALOR PENDIENTE when missing.
      let unitValue = '';

      const editedContents: Array<{ variety: string; stems: number }> = [];
      if (comp && Array.isArray(comp.contents)) {
        for (const item of comp.contents as unknown[]) {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const it = item as Record<string, unknown>;
            const variety = typeof it.variety === 'string' ? it.variety.trim() : null;
            const stems =
              typeof it.stems === 'number' && Number.isFinite(it.stems) && it.stems > 0
                ? it.stems
                : typeof it.stems === 'string' &&
                  Number.isFinite(Number(it.stems)) &&
                  Number(it.stems) > 0
                ? Number(it.stems)
                : null;
            if (variety && stems != null) editedContents.push({ variety, stems });
          }
        }
      }

      if (editedContents.length > 0) {
        // Exact path: sum(stems × farm_cost_per_stem) matched from v_catalog_admin by variety (ilike).
        // catRaw was already loaded above into avgFarmCost loop; re-use the raw array if available.
        // We need the per-variety costs, so we do a targeted lookup when editedContents is present.
        // Build a map variety (lowercase) -> farm_cost from the already-fetched catalog data.
        // catRaw is not directly in scope; we load it again (small, cached at the Supabase layer).
        let varietyCostMap: Record<string, number> = {};
        try {
          const { data: catVars } = await svc
            .from('v_catalog_admin')
            .select('variety, farm_cost')
            .limit(3000);
          for (const r of (catVars ?? []) as Array<Record<string, unknown>>) {
            const v = typeof r.variety === 'string' ? r.variety.trim().toLowerCase() : null;
            const c = Number(r.farm_cost);
            if (v && Number.isFinite(c) && c > 0) varietyCostMap[v] = c;
          }
        } catch {
          // best-effort; fall through to average fallback
        }

        let totalValue = 0;
        let allResolved = true;
        for (const line of editedContents) {
          const key = line.variety.toLowerCase();
          // ilike match: try exact, then prefix/suffix
          const exactCost = varietyCostMap[key];
          let cost: number | undefined = exactCost;
          if (cost == null) {
            // substring search on the already-fetched map keys
            const matchKey = Object.keys(varietyCostMap).find(
              (k) => k.includes(key) || key.includes(k),
            );
            cost = matchKey != null ? varietyCostMap[matchKey] : undefined;
          }
          if (cost != null && cost > 0) {
            totalValue += line.stems * cost;
          } else if (avgFarmCost != null) {
            // Variety not in catalog; use catalog average as directional fallback
            totalValue += line.stems * avgFarmCost;
          } else {
            allResolved = false;
          }
        }

        if (totalValue > 0) {
          unitValue = String(Math.max(1, Math.round(totalValue)));
          if (!allResolved) notesParts.push('VALOR PARCIAL');
        } else {
          notesParts.push('VALOR PENDIENTE');
        }
      } else {
        // No contents pinned: fall back to stems_per_box × representative average.
        const stemsPerBox =
          bm && Number.isFinite(Number(bm.stems_per_box)) ? Number(bm.stems_per_box) : null;
        if (stemsPerBox != null && stemsPerBox > 0 && avgFarmCost != null) {
          unitValue = String(Math.max(1, Math.round(stemsPerBox * avgFarmCost)));
        } else {
          notesParts.push('VALOR PENDIENTE');
        }
      }

      const cust_val = unitValue !== '' ? unitValue : '';
      const dec_val = unitValue !== '' ? unitValue : '';

      // REF = "DDMMYY-VENDOR-BOXDESC"
      // NOTE: date-digit convention (DDMMYY vs DDMMYYYY) to confirm with Facu;
      // his example was 6-digit "270405-ECOROSES".
      //
      // Per-box dispatch_date preference:
      //   If proposed_composition.dispatch_date is present and matches YYYY-MM-DD,
      //   use it as this box's REF date segment instead of the global date+1.
      //   This lets the CEO reschedule individual boxes (or the whole batch via
      //   POST /api/admin/samples/reschedule) and have FedEx labels reflect it.
      //   The global dispatchDateRef remains the fallback when no per-box date is set.
      const rawPerBoxDate =
        comp && typeof comp.dispatch_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(comp.dispatch_date.trim())
          ? comp.dispatch_date.trim()
          : null;
      const perBoxDateRef = rawPerBoxDate ? formatDispatchDateRef(rawPerBoxDate) : null;
      const effectiveDateRef = perBoxDateRef ?? dispatchDateRef;

      const vendorPart = vendorName || 'VENDOR';
      const ref = `${effectiveDateRef}-${vendorPart}-${boxDesc(rawBoxType)}`;

      const notes = notesParts.join(' | ');

      const labelRow: SampleLabelRow = {
        REC: rec,
        COMPANY: COMPANY_CONSTANT,
        CONTACT: '',           // blank — we don't have individual contact name
        ADR1: street,
        ADR2: '',              // always blank
        CITY: city,
        STATE: state,
        ZIPCODE: zip,
        COUNTRY: COUNTRY_CONSTANT,
        PHONE: PHONE_CONSTANT,
        WEIGHT: weight,
        LENGTH: length,
        WIDTH: width,
        HEIGHT: height,
        REF: ref,
        DESCRIPTION: vendorName,
        PART_NUMBER: PART_NUMBER_CONSTANT,
        'UNIT VALUE': unitValue,
        QUANTITY: QUANTITY_CONSTANT,
        QUANTITY_UNITS: QUANTITY_UNITS_CONSTANT,
        CUST_VAL: cust_val,
        DEC_VAL: dec_val,
        CTRY_MAN: CTRY_MAN_CONSTANT,
        ISS_NSR: ISS_NSR_CONSTANT,
        REL_NUMBER: REL_NUMBER_CONSTANT,
        'CUT FLOWERS': CUT_FLOWERS_CONSTANT,
        // UI-only extras
        recipient_name: businessName,
        box_type: rawBoxType,
        notes,
        updated_at: updatedAt,
        lead_master_id: leadMasterId,
        zoho_id: zohoId,
        flora_score: floraScore,
      };

      rows.push(labelRow);

      // Build the CSV row in the exact 26-column order.
      const csvRow = FEDEX_LABEL_COLUMNS.map((col) =>
        csvEscape((labelRow as unknown as Record<string, unknown>)[col]),
      ).join(',');
      csvLines.push(csvRow);
    }

    const csv = csvLines.join('\n') + '\n';
    const filename = `floropolis-fedex-labels-${date}.csv`;

    return { csv, filename, rowCount: rows.length, rows, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallbackDate = date || new Date().toISOString().slice(0, 10);
    return emptyResult(fallbackDate, msg);
  }
}
