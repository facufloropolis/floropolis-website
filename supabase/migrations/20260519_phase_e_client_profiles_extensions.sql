-- Phase E: extend client_profiles for roles, B2B status, suspension, last_login.
-- Also create client_phone_notes for manual phone-call logging.
-- 2026-05-19 | Job_PM Phase E [V8 SHADOW]
--
-- Applied via MCP (mcp__supabase-backup__apply_migration) on 2026-05-19.
-- Kept here for repo traceability + future rebuilds.

-- 1. client_profiles columns -------------------------------------------------
ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS ein text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text,
  ADD COLUMN IF NOT EXISTS sales_owner_id uuid;

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'florist';

UPDATE public.client_profiles
   SET role = 'admin'
 WHERE status = 'admin' AND (role IS NULL OR role = 'florist');

ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_role_check;
ALTER TABLE public.client_profiles
  ADD CONSTRAINT client_profiles_role_check CHECK (role IN ('florist','sales','admin'));

ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_sales_owner_id_fkey;
ALTER TABLE public.client_profiles
  ADD CONSTRAINT client_profiles_sales_owner_id_fkey
  FOREIGN KEY (sales_owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_profiles_role
  ON public.client_profiles(role);
CREATE INDEX IF NOT EXISTS idx_client_profiles_sales_owner_id
  ON public.client_profiles(sales_owner_id);
CREATE INDEX IF NOT EXISTS idx_client_profiles_last_login_at
  ON public.client_profiles(last_login_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_profiles_ein
  ON public.client_profiles(ein) WHERE ein IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_profiles_status
  ON public.client_profiles(status);

COMMENT ON COLUMN public.client_profiles.ein IS
  'Employer Identification Number. Presence + length>=9 => B2B; absent => B2C. Phase E.';
COMMENT ON COLUMN public.client_profiles.role IS
  'Permission role: florist (default), sales, or admin. Promotion to admin enforces "no florist as admin" guard (UC-R-234). Phase E.';
COMMENT ON COLUMN public.client_profiles.last_login_at IS
  'Most recent successful login timestamp.';
COMMENT ON COLUMN public.client_profiles.suspended_at IS
  'Set when status transitions to suspended via UC-R-216 proposal. NULL on unsuspend.';
COMMENT ON COLUMN public.client_profiles.suspended_reason IS
  'Free-text rationale captured in the suspend proposal payload.';

-- 2. client_phone_notes ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_phone_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  note text NOT NULL,
  contacted_at timestamptz NOT NULL DEFAULT now(),
  contacted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_phone_notes_client_id
  ON public.client_phone_notes(client_id, contacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_phone_notes_order_id
  ON public.client_phone_notes(order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE public.client_phone_notes IS
  'Manual phone-call log. UC-R-224 (BRD v0.3). Surfaced in Communications tab.';

ALTER TABLE public.client_phone_notes ENABLE ROW LEVEL SECURITY;
-- service role bypasses RLS; no other roles can see these rows.
