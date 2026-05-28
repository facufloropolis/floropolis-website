-- Market-scope retrofit for pricing_constants.
-- All canonical pricing constants are now keyed by (id, market).

ALTER TABLE public.pricing_constants
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'Ecuador';

UPDATE public.pricing_constants
SET market = 'Ecuador'
WHERE market IS NULL OR market = '';

ALTER TABLE public.pricing_constants
  ALTER COLUMN market DROP DEFAULT;

ALTER TABLE public.pricing_constants
  DROP CONSTRAINT IF EXISTS pricing_constants_pkey;

ALTER TABLE public.pricing_constants
  ADD PRIMARY KEY (id, market);

COMMENT ON COLUMN public.pricing_constants.market IS
  'Pricing market scope for the constant. v1 retrofit uses Ecuador as the only active market.';
