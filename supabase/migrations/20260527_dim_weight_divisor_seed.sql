-- Seed dim_weight_divisor into pricing_constants.
-- v1 | 2026-05-27 | Codex
--
-- Dimensional weight is computed in cm^3 -> kg space:
--   dim_kg = (L_cm * W_cm * H_cm) / dim_weight_divisor
--
-- Facu confirmed 6000 is the current canonical divisor for this contract.

INSERT INTO public.pricing_constants (id, value_numeric, description, unit)
VALUES (
  'dim_weight_divisor',
  6000,
  'FedEx volumetric divisor used for cm^3 -> kg dimensional weight conversion. Current canonical value: 6000.',
  'cm^3/kg'
)
ON CONFLICT (id) DO NOTHING;
