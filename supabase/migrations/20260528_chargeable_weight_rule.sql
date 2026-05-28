-- Extend pricing_constants for categorical constants and seed chargeable_weight_rule.
-- v1 | 2026-05-28 | Codex

ALTER TABLE public.pricing_constants
  ADD COLUMN IF NOT EXISTS value_text text,
  ADD COLUMN IF NOT EXISTS allowed_values jsonb;

INSERT INTO public.pricing_constants (
  id,
  value_text,
  description,
  unit,
  allowed_values
)
VALUES (
  'chargeable_weight_rule',
  'dim_only',
  'Rule for computing FedEx chargeable kg per box. Current Ecuador mode: dim_only. Verified truth requires a real FedEx label before using verified_label.',
  'enum',
  '["dim_only","actual_only","max_actual_dim","verified_label"]'::jsonb
)
ON CONFLICT (id) DO NOTHING;
