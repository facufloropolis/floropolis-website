-- Slice 7A — standardize Olimpo into family=QB, variant=QB-OLI
-- Apply in PROD first, then mirror sync carries the normalized row into BACKUP.

UPDATE public.box_master
SET box_family = 'QB',
    variant_code = 'QB-OLI',
    updated_at = now()
WHERE vendor_canonical_name = 'Olimpo'
  AND box_family = 'QB-OLI'
  AND variant_code = 'standard';
