import 'server-only';

import { getProdReadClient } from '@/lib/supabase/prod-server';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

export type DispatchPrepProvenanceTier = 'measured' | 'sourced' | 'ai';

export interface DispatchPrepFieldProvenance {
  tier: DispatchPrepProvenanceTier | null;
  source: string | null;
  note: string;
}

export interface DispatchPrepAddress {
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  provenance: {
    street: DispatchPrepFieldProvenance;
    city: DispatchPrepFieldProvenance;
    state: DispatchPrepFieldProvenance;
    zip: DispatchPrepFieldProvenance;
  };
}

export interface DispatchPrepContents {
  raw: string | null;
  items: string[];
  provenance: DispatchPrepFieldProvenance;
}

export interface DispatchPrepEnrichedSample {
  leadMasterId: number | null;
  businessName: string | null;
  address: DispatchPrepAddress;
  contents: DispatchPrepContents;
  needsGoogle: boolean;
}

interface LoopRaw {
  lead_master_id: number | string | null;
  business_name: string | null;
  status: string | null;
  facu_decision: string | null;
  proposed_composition: unknown;
  updated_at: string | null;
}

interface CohortRaw {
  zoho_id: string | null;
  account_name: string | null;
  description: string | null;
  phone: string | null;
}

interface LeadMasterRaw {
  id: number | string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  email?: string | null;
}

type AddressField = 'street' | 'city' | 'state' | 'zip';

const ADDRESS_FIELDS: AddressField[] = ['street', 'city', 'state', 'zip'];

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const str = String(v).trim();
  if (!str || str.toLowerCase() === 'missing') return null;
  return str;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function emptyProv(note: string): DispatchPrepFieldProvenance {
  return { tier: null, source: null, note };
}

function prov(
  tier: DispatchPrepProvenanceTier,
  source: string,
  note: string,
): DispatchPrepFieldProvenance {
  return { tier, source, note };
}

function emptyAddress(): DispatchPrepAddress {
  return {
    street: null,
    city: null,
    state: null,
    zip: null,
    provenance: {
      street: emptyProv('not found in proposed_composition, v_flora_cohort, or phone match'),
      city: emptyProv('not found in proposed_composition, v_flora_cohort, or phone match'),
      state: emptyProv('not found in proposed_composition, v_flora_cohort, or phone match'),
      zip: emptyProv('not found in proposed_composition or v_flora_cohort'),
    },
  };
}

function setAddressField(
  address: DispatchPrepAddress,
  field: AddressField,
  value: unknown,
  provenance: DispatchPrepFieldProvenance,
): void {
  const clean = s(value);
  if (!clean || address[field]) return;
  address[field] = clean;
  address.provenance[field] = provenance;
}

function parseShipAddress(v: unknown): Partial<Record<AddressField, string | null>> {
  const rec = asRecord(v);
  if (!rec) return {};
  return {
    street: s(rec.street) ?? s(rec.address) ?? s(rec.address1),
    city: s(rec.city),
    state: s(rec.state),
    zip: s(rec.zip) ?? s(rec.zipcode) ?? s(rec.postal_code),
  };
}

function parseConfirmedAddress(
  description: string | null | undefined,
): Partial<Record<AddressField, string | null>> | null {
  if (!description) return null;
  const match = description.match(/CONFIRMED ADDRESS:\s*([\s\S]*?)(?:\n{2,}|Box:|$)/i);
  const raw = match?.[1]?.trim();
  if (!raw) return null;
  const firstLine = raw.split(/\r?\n/)[0]?.trim() ?? '';
  const parts = firstLine
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) return { city: parts[0], state: parts[1] };
  if (parts.length === 3) return { street: parts[0], city: parts[1], state: parts[2] };
  return {
    street: parts.slice(0, parts.length - 3).join(', '),
    city: parts[parts.length - 3],
    state: parts[parts.length - 2],
    zip: parts[parts.length - 1],
  };
}

function parseBoxContents(description: string | null): DispatchPrepContents {
  if (!description) {
    return {
      raw: null,
      items: [],
      provenance: emptyProv('box notes not found in v_flora_cohort.description'),
    };
  }

  const match = description.match(/Box:\s*([\s\S]*?)(?:\n{2,}|CONFIRMED ADDRESS:|$)/i);
  const raw = s(match?.[1]);
  if (!raw) {
    return {
      raw: null,
      items: [],
      provenance: emptyProv('Box: note not parseable from v_flora_cohort.description'),
    };
  }

  const cleaned = raw.split(/\r?\n/)[0]?.trim() ?? raw;
  const items = cleaned
    .split(/,|;|\band\b|\/|\+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return {
    raw: cleaned,
    items,
    provenance: prov(
      'sourced',
      'PROD public.v_flora_cohort.description',
      'parsed Box: note',
    ),
  };
}

function phoneVariants(phone: string | null): string[] {
  const raw = s(phone);
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const variants = new Set<string>([raw]);
  if (digits) {
    variants.add(digits);
    if (digits.length === 10) variants.add(`1${digits}`);
    if (digits.length === 11 && digits.startsWith('1')) variants.add(digits.slice(1));
  }
  return Array.from(variants);
}

function phoneKey(phone: string | null): string | null {
  const raw = s(phone);
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw.toLowerCase();
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

async function readApprovedLoops(): Promise<LoopRaw[]> {
  try {
    const backup = getBackupServiceClient();
    const { data, error } = await backup
      .from('sample_review_loop')
      .select(
        'lead_master_id, business_name, status, facu_decision, proposed_composition, updated_at',
      )
      .or('status.eq.aligned,facu_decision.eq.yes')
      .order('updated_at', { ascending: false });
    if (error || !Array.isArray(data)) return [];
    return data as unknown as LoopRaw[];
  } catch {
    return [];
  }
}

async function readCohortByZoho(zohoIds: string[]): Promise<Map<string, CohortRaw>> {
  const out = new Map<string, CohortRaw>();
  if (zohoIds.length === 0) return out;
  const prod = getProdReadClient();
  if (!prod) return out;
  try {
    const { data, error } = await prod
      .from('v_flora_cohort')
      .select('zoho_id, account_name, description, phone')
      .in('zoho_id', zohoIds);
    if (error || !Array.isArray(data)) return out;
    for (const r of data as unknown as CohortRaw[]) {
      const zoho = s(r.zoho_id);
      if (zoho && !out.has(zoho)) out.set(zoho, r);
    }
  } catch {
    return out;
  }
  return out;
}

async function readLeadMasterByPhone(phones: string[]): Promise<Map<string, LeadMasterRaw>> {
  const out = new Map<string, LeadMasterRaw>();
  if (phones.length === 0) return out;
  const prod = getProdReadClient();
  if (!prod) return out;

  const allVariants = Array.from(new Set(phones.flatMap(phoneVariants)));
  if (allVariants.length === 0) return out;

  const run = async (select: string): Promise<LeadMasterRaw[]> => {
    const { data, error } = await prod
      .from('lead_master')
      .select(select)
      .in('phone', allVariants);
    if (error || !Array.isArray(data)) return [];
    return data as unknown as LeadMasterRaw[];
  };

  try {
    let rows = await run('id, phone, city, state, email');
    if (rows.length === 0) rows = await run('id, phone, city, state');
    for (const r of rows) {
      const key = phoneKey(r.phone);
      if (key && !out.has(key)) out.set(key, r);
    }
  } catch {
    return out;
  }
  return out;
}

function applyAddressSource(
  address: DispatchPrepAddress,
  parsed: Partial<Record<AddressField, string | null>>,
  provenance: DispatchPrepFieldProvenance,
): void {
  for (const field of ADDRESS_FIELDS) {
    setAddressField(address, field, parsed[field], provenance);
  }
}

export async function enrichSamplePrep(): Promise<DispatchPrepEnrichedSample[]> {
  try {
    const loops = await readApprovedLoops();
    if (loops.length === 0) return [];

    const loopInputs = loops.map((loop) => {
      const comp = asRecord(loop.proposed_composition);
      const zohoId = s(comp?.zoho_id);
      return { loop, comp, zohoId };
    });

    const zohoIds = Array.from(
      new Set(loopInputs.map((x) => x.zohoId).filter((z): z is string => Boolean(z))),
    );
    const cohortByZoho = await readCohortByZoho(zohoIds);

    const phonesNeedingFallback = loopInputs
      .filter(({ comp, zohoId }) => {
        const proposed = parseShipAddress(comp?.ship_address);
        const cohort = zohoId ? cohortByZoho.get(zohoId) : undefined;
        const parsed = parseConfirmedAddress(cohort?.description);
        return !s(proposed.street) && !s(parsed?.street);
      })
      .map(({ zohoId }) => {
        const cohort = zohoId ? cohortByZoho.get(zohoId) : undefined;
        return s(cohort?.phone);
      })
      .filter((p): p is string => Boolean(p));

    const leadMasterByPhone = await readLeadMasterByPhone(phonesNeedingFallback);

    return loopInputs.map(({ loop, comp, zohoId }) => {
      const address = emptyAddress();

      applyAddressSource(
        address,
        parseShipAddress(comp?.ship_address),
        prov('measured', 'BACKUP sample_review_loop.proposed_composition.ship_address', 'edited ship_address'),
      );

      const cohort = zohoId ? cohortByZoho.get(zohoId) : undefined;
      const confirmed = parseConfirmedAddress(cohort?.description);
      if (confirmed) {
        applyAddressSource(
          address,
          confirmed,
          prov('sourced', 'PROD public.v_flora_cohort.description', 'parsed CONFIRMED ADDRESS'),
        );
      }

      if (!address.street) {
        const key = phoneKey(cohort?.phone ?? null);
        const lead = key ? leadMasterByPhone.get(key) : undefined;
        if (lead) {
          const note = s(lead.email)
            ? `phone match; email ${s(lead.email)} also present`
            : 'phone match';
          applyAddressSource(
            address,
            { city: s(lead.city), state: s(lead.state) },
            prov('sourced', 'PROD public.lead_master phone match', note),
          );
        }
      }

      const contents = parseBoxContents(cohort?.description ?? null);
      const needsGoogle = !address.street;

      return {
        leadMasterId: toNum(loop.lead_master_id),
        businessName: s(loop.business_name) ?? s(cohort?.account_name),
        address,
        contents,
        needsGoogle,
      };
    });
  } catch {
    return [];
  }
}
