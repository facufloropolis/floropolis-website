// Sample labels builder — reads BACKUP approved-pending boxes + PROD v_flora_cohort
// addresses and returns { csv, filename, rowCount, rows }.
// v1 | 2026-06-10 | Job_PM (CPO)
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
// CSV columns (FedEx-style, matching dispatch/labelFile.ts layout):
//   reference, recipient_name, street, city, state, zip, country, phone,
//   box_type, contents, notes
//
// NULL-safe: never throws. Honest empty (header only) when no approved boxes.

import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdReadClient } from '@/lib/supabase/prod-server';

// ---------------------------------------------------------------------------
// Column layout
// ---------------------------------------------------------------------------
export const SAMPLE_LABEL_COLUMNS = [
  'reference',        // proposed_composition.zoho_id  (fallback: business_name)
  'recipient_name',   // business_name
  'street',           // from PROD v_flora_cohort description "CONFIRMED ADDRESS:"
  'city',
  'state',
  'zip',
  'country',          // always 'US'
  'phone',            // blank — not available
  'box_type',         // proposed_composition.box_type or 'SAMPLE'
  'contents',         // proposed_composition.contents or blank
  'notes',            // 'ADDRESS MISSING' if not parseable; else blank
] as const;

export type SampleLabelColumn = (typeof SAMPLE_LABEL_COLUMNS)[number];

export interface SampleLabelRow {
  reference: string;
  recipient_name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  box_type: string;
  contents: string;
  notes: string;
  // Extra fields for UI display (not written to CSV)
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
// Helpers
// ---------------------------------------------------------------------------
const MISSING = '';

function csvEscape(v: unknown): string {
  if (v == null) return MISSING;
  let s = String(v);
  if (s === '') return MISSING;
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function headerCsv(): string {
  return SAMPLE_LABEL_COLUMNS.join(',');
}

function emptyResult(date: string, error: string | null): SampleLabelsResult {
  return {
    csv: headerCsv() + '\n',
    filename: `floropolis-sample-labels-${date}.csv`,
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
    // Minimal fallback: "city, state" or similar
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

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export async function buildSampleLabels(date: string): Promise<SampleLabelsResult> {
  try {
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
      .or("status.eq.aligned,facu_decision.eq.yes")
      .order('updated_at', { ascending: false });

    if (loopErr) {
      return emptyResult(date, 'loop_fetch_failed: ' + loopErr.message);
    }

    const loopRows = (loopRaw ?? []) as Array<Record<string, unknown>>;
    if (loopRows.length === 0) {
      return emptyResult(date, null);
    }

    // 2) Collect zoho_ids for PROD lookup -------------------------------------
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
        // PROD read is best-effort; if it fails we still emit the rows with ADDRESS MISSING
      }
    }

    // 4) Assemble rows --------------------------------------------------------
    const rows: SampleLabelRow[] = [];
    const csvLines: string[] = [headerCsv()];

    for (const loop of loopRows) {
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
      const boxType =
        comp && typeof comp.box_type === 'string' && comp.box_type.trim()
          ? comp.box_type.trim()
          : 'SAMPLE';
      const contents =
        comp && typeof comp.contents === 'string' && comp.contents.trim()
          ? comp.contents.trim()
          : '';

      // Address from PROD cohort
      let street = '';
      let city = '';
      let state = '';
      let zip = '';
      let notes = '';

      if (zohoId && cohortByZohoId[zohoId]) {
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
          notes = 'ADDRESS MISSING';
        }
      } else {
        notes = zohoId ? 'ADDRESS MISSING' : 'NO ZOHO ID';
      }

      const reference = zohoId ?? businessName;

      const labelRow: SampleLabelRow = {
        reference,
        recipient_name: businessName,
        street,
        city,
        state,
        zip,
        country: 'US',
        phone: '',
        box_type: boxType,
        contents,
        notes,
        updated_at: updatedAt,
        lead_master_id: leadMasterId,
        zoho_id: zohoId,
        flora_score: floraScore,
      };

      rows.push(labelRow);
      csvLines.push(
        SAMPLE_LABEL_COLUMNS.map((col) => csvEscape(labelRow[col])).join(','),
      );
    }

    const csv = csvLines.join('\n') + '\n';
    const filename = `floropolis-sample-labels-${date}.csv`;

    return { csv, filename, rowCount: rows.length, rows, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const fallbackDate = date || new Date().toISOString().slice(0, 10);
    return emptyResult(fallbackDate, msg);
  }
}
