import type { SupabaseClient } from '@supabase/supabase-js';

export interface BoxMasterRow {
  box_id: number;
  vendor_canonical_name: string;
  box_family: string;
  variant_code: string;
  fedex_length_cm: number | null;
  fedex_width_cm: number | null;
  fedex_height_cm: number | null;
  fedex_chargeable_kg: number | null;
  stems_per_box: number | null;
  fedex_source_artifact: string | null;
  fedex_source_date: string | null;
  fedex_label_confirmation_count: number | null;
  komet_length_in: number | null;
  komet_width_in: number | null;
  komet_height_in: number | null;
  komet_source: string | null;
  komet_source_date: string | null;
  stems_per_box_source_artifact: string | null;
  stems_per_box_source_date: string | null;
  facu_approved: boolean | null;
  facu_approved_at: string | null;
  facu_approval_note: string | null;
  source_artifact: string | null;
  legacy_box_type?: string | null;
  inserted_by?: string | null;
  updated_at?: string | null;
  fedex_dim_weight_kg?: number | null;
  fedex_volume_cm3?: number | null;
  komet_dim_weight_kg?: number | null;
  komet_dim_weight_delta_kg?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  active: boolean;
}

export class MissingBoxMasterError extends Error {}

export function boxKey(row: Pick<BoxMasterRow, 'vendor_canonical_name' | 'box_family' | 'variant_code'>): string {
  return [
    row.vendor_canonical_name.trim().toUpperCase(),
    row.box_family.trim().toUpperCase(),
    row.variant_code.trim().toUpperCase(),
  ].join('::');
}

function normalizeBoxType(boxType: string): string {
  return boxType.trim().toUpperCase();
}

export function boxRowMatchesLegacyType(
  row: Pick<BoxMasterRow, 'box_family' | 'variant_code' | 'legacy_box_type'>,
  legacyBoxType: string,
): boolean {
  const legacy = normalizeBoxType(legacyBoxType);
  const family = normalizeBoxType(row.box_family);
  const variant = normalizeBoxType(row.variant_code);
  const storedLegacy = row.legacy_box_type ? normalizeBoxType(row.legacy_box_type) : null;

  if (storedLegacy && storedLegacy === legacy) return true;
  if (variant === legacy) return true;
  if (family === legacy && variant === 'STANDARD') return true;
  if (legacy === 'QB-OLI' && family === 'QB' && variant === 'QB-OLI') return true;
  if (legacy === '1/8-MF' && family === '1/8' && variant === 'STANDARD') return true;
  return false;
}

export function resolveLegacyBoxIdentity(vendorRaw: string, legacyBoxTypeRaw: string): {
  vendor: string;
  boxFamily: string;
  variant: string;
} {
  const vendor = vendorRaw.trim();
  const legacy = normalizeBoxType(legacyBoxTypeRaw);
  if (legacy === 'QBV') return { vendor, boxFamily: 'QB', variant: 'QBV' };
  if (legacy === 'QB-M') return { vendor, boxFamily: 'QB', variant: 'QB-M' };
  if (legacy === 'QB-MF') return { vendor, boxFamily: 'QB', variant: 'QB-MF' };
  if (legacy === 'QB-OLI') return { vendor, boxFamily: 'QB', variant: 'QB-OLI' };
  if (legacy === 'EB-M') return { vendor, boxFamily: 'EB', variant: 'EB-M' };
  if (legacy === 'EB-MF') return { vendor, boxFamily: 'EB', variant: 'EB-MF' };
  if (legacy === 'SB-M') return { vendor, boxFamily: 'SB', variant: 'SB-M' };
  if (legacy === '1/8-MF') return { vendor, boxFamily: '1/8', variant: 'standard' };
  return { vendor, boxFamily: legacy, variant: 'standard' };
}

export function legacyBoxTypeFor(
  row: Pick<BoxMasterRow, 'box_family' | 'variant_code'> & Partial<Pick<BoxMasterRow, 'vendor_canonical_name'>>,
): string {
  const family = normalizeBoxType(row.box_family);
  const variant = normalizeBoxType(row.variant_code);
  if (family === 'QB' && variant === 'STANDARD') return 'QB';
  if (family === 'EB' && variant === 'STANDARD') return 'EB';
  if (family === 'HB' && variant === 'STANDARD') return 'HB';
  if (family === '1/8' && variant === 'STANDARD') return '1/8-MF';
  return variant;
}

export async function getBox(
  client: SupabaseClient,
  args: { vendor: string; family: string; variant: string },
): Promise<BoxMasterRow> {
  const { data, error } = await client
    .from('box_master_mirror')
    .select(
      'box_id,vendor_canonical_name,box_family,variant_code,fedex_length_cm,fedex_width_cm,fedex_height_cm,fedex_chargeable_kg,stems_per_box,fedex_source_artifact,fedex_source_date,fedex_label_confirmation_count,komet_length_in,komet_width_in,komet_height_in,komet_source,komet_source_date,stems_per_box_source_artifact,stems_per_box_source_date,facu_approved,facu_approved_at,facu_approval_note,source_artifact,legacy_box_type,inserted_by,updated_at,fedex_dim_weight_kg,fedex_volume_cm3,komet_dim_weight_kg,komet_dim_weight_delta_kg,effective_from,effective_to,active',
    )
    .eq('vendor_canonical_name', args.vendor)
    .eq('box_family', args.family)
    .eq('variant_code', args.variant)
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new MissingBoxMasterError(
      `box_master_mirror missing row for vendor=${args.vendor}, family=${args.family}, variant=${args.variant}`,
    );
  }
  return data as BoxMasterRow;
}

export async function getBoxByLegacyType(
  client: SupabaseClient,
  args: { vendor: string; boxType: string },
): Promise<BoxMasterRow> {
  const { data, error } = await client
    .from('box_master_mirror')
    .select(
      'box_id,vendor_canonical_name,box_family,variant_code,fedex_length_cm,fedex_width_cm,fedex_height_cm,fedex_chargeable_kg,stems_per_box,fedex_source_artifact,fedex_source_date,fedex_label_confirmation_count,komet_length_in,komet_width_in,komet_height_in,komet_source,komet_source_date,stems_per_box_source_artifact,stems_per_box_source_date,facu_approved,facu_approved_at,facu_approval_note,source_artifact,legacy_box_type,inserted_by,updated_at,fedex_dim_weight_kg,fedex_volume_cm3,komet_dim_weight_kg,komet_dim_weight_delta_kg,effective_from,effective_to,active',
    )
    .eq('vendor_canonical_name', args.vendor)
    .eq('active', true);

  if (error) throw error;
  const row = (data as BoxMasterRow[] | null)?.find((candidate) =>
    boxRowMatchesLegacyType(candidate, args.boxType),
  );
  if (!row) {
    throw new MissingBoxMasterError(
      `box_master_mirror missing legacy row for vendor=${args.vendor}, boxType=${args.boxType}`,
    );
  }
  return row;
}

export async function getBoxField<T>(
  client: SupabaseClient,
  args: { vendor: string; family: string; variant: string; field: keyof BoxMasterRow },
): Promise<T> {
  const row = await getBox(client, {
    vendor: args.vendor,
    family: args.family,
    variant: args.variant,
  });
  return row[args.field] as T;
}
