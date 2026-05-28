-- Slice 7A — BACKUP box_master parity surface
-- Canonical truth remains PROD public.box_master.
-- BACKUP receives a read-model mirror plus a legacy compatibility alias
-- (`legacy_box_type`) so existing vendor+box_type consumers can move without
-- an outage before full composite-key cutover.

CREATE TABLE IF NOT EXISTS public.box_master_mirror (
  box_id bigint PRIMARY KEY,
  vendor_canonical_name text NOT NULL,
  box_family text NOT NULL,
  variant_code text NOT NULL,
  fedex_length_cm numeric,
  fedex_width_cm numeric,
  fedex_height_cm numeric,
  fedex_source_artifact text,
  fedex_source_date date,
  fedex_label_confirmation_count integer,
  komet_length_in numeric,
  komet_width_in numeric,
  komet_height_in numeric,
  komet_source text,
  komet_source_date date,
  stems_per_box integer,
  stems_per_box_source_artifact text,
  stems_per_box_source_date date,
  effective_from date,
  effective_to date,
  active boolean NOT NULL DEFAULT true,
  facu_approved boolean NOT NULL DEFAULT true,
  facu_approved_at timestamptz,
  facu_approval_note text,
  inserted_by text,
  updated_at timestamptz,
  fedex_volume_cm3 numeric,
  fedex_dim_weight_kg numeric,
  fedex_chargeable_kg numeric,
  komet_dim_weight_kg numeric,
  komet_dim_weight_delta_kg numeric,
  source_artifact text,
  legacy_box_type text NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_box_master_mirror_vendor_family_variant
  ON public.box_master_mirror (vendor_canonical_name, box_family, variant_code);

CREATE INDEX IF NOT EXISTS idx_box_master_mirror_vendor_legacy_box_type
  ON public.box_master_mirror (vendor_canonical_name, legacy_box_type);

COMMENT ON TABLE public.box_master_mirror IS
  'BACKUP mirror of PROD public.box_master. legacy_box_type exists only as a 7A compatibility bridge for vendor+box_type consumers.';

-- Live application during the slice should:
-- 1. rename old public.box_master -> public.box_master_legacy_2026-05-28
-- 2. copy all 13 canonical PROD rows into public.box_master_mirror
-- 3. derive legacy_box_type with the mapping below
-- 4. set source_artifact=''pre-divergence-review canonical, 2026-05-28''
--
-- legacy_box_type mapping:
--   family=QB,   variant=standard  -> QB
--   family=QB,   variant=QBV       -> QBV
--   family=QB,   variant=QB-M      -> QB-M
--   family=QB,   variant=QB-MF     -> QB-MF
--   family=QB,   variant=QB-OLI    -> QB-OLI
--   family=HB,   variant=standard  -> HB
--   family=EB,   variant=standard  -> EB
--   family=EB,   variant=EB-M      -> EB-M
--   family=EB,   variant=EB-MF     -> EB-MF
--   family=SB,   variant=SB-M      -> SB-M
--   family=1/8,  variant=standard  -> 1/8-MF
