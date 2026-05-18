-- Catalog Config Tables: box_master + pricing_constants
-- v1 | 2026-05-18 | Job_PM CAT-S7 [V8 SHADOW]
--
-- Backs the /admin/catalog/config page. Two tables make the global pricing
-- knobs editable in-app instead of buried in Rose's pricing_formula.md:
--   - box_master: validated weight in kg per box_type, feeds FedEx cost per
--     stem in Subagent A's formula
--   - pricing_constants: gpm_target, fedex_rate_per_kg, fuel_surcharge_mult
--
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx)

-- box_master --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.box_master (
  box_type text PRIMARY KEY,
  weight_kg numeric(6,2) NOT NULL CHECK (weight_kg > 0),
  description text,
  validated_by text,
  validated_at timestamptz DEFAULT now(),
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

INSERT INTO public.box_master (box_type, weight_kg, description, validated_by) VALUES
  ('QB', 6.80, 'Quarter Box - standard', 'Rose pricing_formula.md'),
  ('QB-M', 5.30, 'Quarter Box - mini', 'Rose pricing_formula.md'),
  ('QB-OLI', 6.80, 'Quarter Box - olive', 'Rose pricing_formula.md'),
  ('QB-MF', 6.05, 'Quarter Box - Magic Flowers variant', 'Rose pricing_formula.md'),
  ('HB', 11.70, 'Half Box', 'Rose pricing_formula.md'),
  ('EB', 4.25, 'Eighth Box - standard', 'Rose pricing_formula.md'),
  ('EB-M', 3.99, 'Eighth Box - mini', 'Rose pricing_formula.md'),
  ('EB-MF', 4.76, 'Eighth Box - Magic Flowers', 'Rose pricing_formula.md'),
  ('SB-M', 2.94, 'Sixteenth Box - mini', 'Rose pricing_formula.md'),
  ('QBV', 8.75, 'Quarter Box vertical', 'Rose pricing_formula.md'),
  ('FB', 20.90, 'Full Box', 'Rose pricing_formula.md'),
  ('1/8-MF', 4.76, '1/8 from Magic Flowers (sample boxes) - added 2026-05-18', 'Facu directive')
ON CONFLICT (box_type) DO NOTHING;

ALTER TABLE public.box_master ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_master_read_all" ON public.box_master;
CREATE POLICY "box_master_read_all" ON public.box_master
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "box_master_admin_write" ON public.box_master;
CREATE POLICY "box_master_admin_write" ON public.box_master
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.client_profiles
       WHERE user_id = auth.uid()
         AND status = 'admin'
    )
  );

COMMENT ON TABLE public.box_master IS
  'Validated box weights per box_type. Used by inventory_data_validator + '
  'future pricing calculations. Edit via /admin/catalog/config.';

-- pricing_constants -------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pricing_constants (
  id text PRIMARY KEY,
  value_numeric numeric(10,4),
  description text NOT NULL,
  unit text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

INSERT INTO public.pricing_constants (id, value_numeric, description, unit) VALUES
  ('gpm_target', 0.33, 'Target gross profit margin on selling price (1 - cost/price)', 'fraction'),
  ('fedex_rate_per_kg', 6.50, 'FedEx Priority air rate per kilogram', 'USD/kg'),
  ('fuel_surcharge_mult', 1.25, 'Multiplicative fuel surcharge over base FedEx rate', 'multiplier')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.pricing_constants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pricing_constants_read_all" ON public.pricing_constants;
CREATE POLICY "pricing_constants_read_all" ON public.pricing_constants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "pricing_constants_admin_write" ON public.pricing_constants;
CREATE POLICY "pricing_constants_admin_write" ON public.pricing_constants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.client_profiles
       WHERE user_id = auth.uid()
         AND status = 'admin'
    )
  );

COMMENT ON TABLE public.pricing_constants IS
  'Global pricing knobs: GPM target, FedEx rate, fuel surcharge. '
  'Edit via /admin/catalog/config.';
