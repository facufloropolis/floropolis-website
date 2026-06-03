-- Catalog Repair State: structured gap-closure loop
-- v1 | 2026-06-03 | Job_PM (CPO) — drafted; Job_PM executes
--
-- WHY: The system review flagged that the catalog loop never closes — "Job can
-- flag, Rose can fix, but the loop doesn't close." The charter
-- (shared/state/job_operating_model_catalog_admin_charter_2026-06-03.md, §
-- "Supporting Vitals" + "First Proof Domain") mandates the repair loop be DATA,
-- not prose: every gap flows
--     open -> routed -> landed -> re_scored -> verified
-- with per-transition evidence, an explicit owner, and a measurable closure rate.
--
-- OWNERSHIP RULE (charter "Team Roles"): Job owns chrome/content fixes
-- (images, contents description); Rose owns data/cost/box-dims fixes and writes
-- BACK to HER tables — Job never edits supply truth directly. owner_agent
-- encodes who must land the fix; routed_via points at the inbox/proposal that
-- carries the routing.
--
-- GROUNDING (read-only SELECTs against BACKUP ibckhcjvyxzrhvdiazbx, 2026-06-03):
--   - dim_sku PK              = sku_id uuid                 (FK target confirmed)
--   - catalog_quality_weights PK = gate_id text            (FK target confirmed)
--   - authoritative gap source = public.v_sku_publishability
--       (one row per SKU, boolean fail_*/pending_*/gap_* flags, 880 rows)
--   - gate_id 'missing_box_dims' exists, tier='blocking', weight=5
--   - LIVE blocking-gap counts at draft time (see SEED notes below):
--       missing_box_dims=0  price_zero=0  missing_cost_source=0
--       missing_vendor=0    missing_unit=0
--       missing_image=880   missing_contents_description=880
--       missing_units_or_bunch (gap_missing_units)=32
--
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. catalog_repair_state — one row per (sku, gate) repair in flight
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_repair_state (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHAT is broken
  sku_id        uuid NOT NULL REFERENCES public.dim_sku(sku_id) ON DELETE CASCADE,
  gate_id       text NOT NULL REFERENCES public.catalog_quality_weights(gate_id) ON DELETE RESTRICT,

  -- WHERE in the loop
  state         text NOT NULL DEFAULT 'open'
                  CHECK (state IN ('open','routed','landed','re_scored','verified')),

  -- WHO must land the fix (charter ownership rule)
  owner_agent   text NOT NULL DEFAULT 'Job_PM'
                  CHECK (owner_agent IN ('Job_PM','Rose_BI','Nahua_AI','Codex')),

  -- HOW it was routed (inbox message id / admin_proposals id / handshake ref)
  routed_via    text,

  -- per-transition evidence: query-output refs, file:line, commit hashes, ts.
  -- shape (free-form, additive per transition), e.g.:
  --   { "open":     {"source":"v_sku_publishability.fail_missing_box_dims",
  --                  "at":"2026-06-03T..."},
  --     "routed":   {"inbox_id":"...", "at":"..."},
  --     "landed":   {"rose_table":"dim_sku", "commit":"<hash>", "at":"..."},
  --     "re_scored":{"new_score":"...", "at":"..."},
  --     "verified": {"verifier":"Pita", "pass":true, "at":"..."} }
  evidence      jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- per-transition timestamps (denormalized from the log for cheap reporting)
  opened_at     timestamptz NOT NULL DEFAULT now(),
  routed_at     timestamptz,
  landed_at     timestamptz,
  rescored_at   timestamptz,
  verified_at   timestamptz,

  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One OPEN repair per (sku, gate): a gap that is not yet verified is unique.
-- Verified rows are historical and may accumulate (re-open allowed after a
-- gap regresses). Partial unique index is the correct Postgres idiom here.
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_repair_state_sku_gate_open
  ON public.catalog_repair_state (sku_id, gate_id)
  WHERE state <> 'verified';

CREATE INDEX IF NOT EXISTS idx_catalog_repair_state_state
  ON public.catalog_repair_state (state);

CREATE INDEX IF NOT EXISTS idx_catalog_repair_state_owner
  ON public.catalog_repair_state (owner_agent, state);

COMMENT ON TABLE public.catalog_repair_state IS
  'Structured catalog gap-closure loop: open->routed->landed->re_scored->verified. '
  'One open repair per (sku_id, gate_id). owner_agent encodes the charter ownership '
  'rule (Job=chrome/content, Rose=data/cost/box-dims via write-back to her tables). '
  'Vital: repair-loop closure rate (see v_repair_loop_closure_rate).';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. catalog_repair_state_log — append-only transition history
--    Chosen over a trigger: an explicit log row written by the executor lets the
--    actor attach the SAME evidence that justifies the transition (Claim
--    Verification Mandate: evidence in the same artifact that asserts the move).
--    A trigger could stamp from/to/at automatically but cannot author evidence,
--    and would hide the writer. Simpler + honest: executor inserts the log row.
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalog_repair_state_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_id   uuid NOT NULL REFERENCES public.catalog_repair_state(id) ON DELETE CASCADE,
  from_state  text,                       -- NULL for the initial 'open' insert
  to_state    text NOT NULL
                CHECK (to_state IN ('open','routed','landed','re_scored','verified')),
  actor       text NOT NULL
                CHECK (actor IN ('Job_PM','Rose_BI','Nahua_AI','Codex','Pita','Facu','system')),
  evidence    jsonb NOT NULL DEFAULT '{}'::jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catalog_repair_state_log_repair
  ON public.catalog_repair_state_log (repair_id, at);

COMMENT ON TABLE public.catalog_repair_state_log IS
  'Append-only transition log for catalog_repair_state. Each row = one state move '
  'with the actor and the evidence that justifies it. Authored by the executor '
  '(not a trigger) so evidence is first-class.';

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — read-all, admin-write (matches box_master / pricing_constants pattern)
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE public.catalog_repair_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_repair_state_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_repair_state_read_all" ON public.catalog_repair_state;
CREATE POLICY "catalog_repair_state_read_all" ON public.catalog_repair_state
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "catalog_repair_state_admin_write" ON public.catalog_repair_state;
CREATE POLICY "catalog_repair_state_admin_write" ON public.catalog_repair_state
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.client_profiles
             WHERE user_id = auth.uid() AND status = 'admin')
  );

DROP POLICY IF EXISTS "catalog_repair_state_log_read_all" ON public.catalog_repair_state_log;
CREATE POLICY "catalog_repair_state_log_read_all" ON public.catalog_repair_state_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "catalog_repair_state_log_admin_write" ON public.catalog_repair_state_log;
CREATE POLICY "catalog_repair_state_log_admin_write" ON public.catalog_repair_state_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.client_profiles
             WHERE user_id = auth.uid() AND status = 'admin')
  );

-- ───────────────────────────────────────────────────────────────────────────
-- 3. v_repair_loop_closure_rate — the vital, per ISO week
--    closure_rate = verified opened-this-week / opened-this-week.
--    Cohort basis (by opened_at week): "of the gaps opened in week W, what
--    fraction reached verified?" This is the honest closure-rate read; a
--    flow-basis (verified_this_week / opened_this_week) would mix cohorts.
-- ───────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_repair_loop_closure_rate AS
SELECT
  date_trunc('week', opened_at)::date                                AS week_start,
  count(*)                                                           AS opened,
  count(*) FILTER (WHERE state = 'verified')                         AS verified,
  count(*) FILTER (WHERE state IN ('routed','landed','re_scored'))   AS in_flight,
  count(*) FILTER (WHERE state = 'open')                             AS still_open,
  round(
    count(*) FILTER (WHERE state = 'verified')::numeric
      / NULLIF(count(*), 0),
    4
  )                                                                  AS closure_rate
FROM public.catalog_repair_state
GROUP BY date_trunc('week', opened_at)
ORDER BY week_start;

COMMENT ON VIEW public.v_repair_loop_closure_rate IS
  'Charter vital: catalog repair-loop closure rate per ISO week (cohort basis by '
  'opened_at). closure_rate = verified / opened for gaps opened that week.';

-- ───────────────────────────────────────────────────────────────────────────
-- SEED — current real blocking gaps from the authoritative live source.
--
-- The brief asked specifically for missing_box_dims SKUs. Verified count at
-- draft time: 0 (SELECT count(*) FROM public.v_sku_publishability
-- WHERE fail_missing_box_dims;  ->  0). box_dims is NOT a live blocker today,
-- so seeding it alone would insert ZERO rows — surfaced as an open question.
--
-- SEED CORRECTION (Job_PM, 2026-06-03, pre-execution review): the draft used
-- v_sku_publishability.pending_image_gate / pending_contents_description_gate
-- as gap sources. The surface-truth verifier proved those flags mean "not yet
-- evaluated" (true for ALL 880 rows), NOT "missing" — live truth recomputed
-- from dim_sku LEFT JOIN product_chrome is 332 missing images / 342 missing
-- descriptions. Seeding on pending flags would insert ~1,760 FALSE gaps.
-- The image/contents arms below are therefore grounded directly on
-- dim_sku + product_chrome (same predicates as scripts/verify_admin_surface_truth.mjs).
--   missing_box_dims / price_zero / cost_source / vendor / unit -> 0 each (kept for idempotent reruns)
--   missing_units_or_bunch        ->  32  (owner Rose_BI)   [gap_missing_units]
--   missing_image                 -> ~332 (owner Job_PM)    [grounded: no chrome images]
--   missing_contents_description  -> ~342 (owner Job_PM)    [grounded: no chrome description]
-- Expected seed total: ~706 open repairs. Re-verify counts at apply time.
-- ───────────────────────────────────────────────────────────────────────────

WITH gaps AS (
  SELECT sku_id, 'missing_box_dims'::text             AS gate_id, 'Rose_BI'::text AS owner_agent
    FROM public.v_sku_publishability WHERE fail_missing_box_dims
  UNION ALL
  SELECT sku_id, 'price_zero',            'Rose_BI'
    FROM public.v_sku_publishability WHERE fail_price_zero
  UNION ALL
  SELECT sku_id, 'missing_cost_source',   'Rose_BI'
    FROM public.v_sku_publishability WHERE fail_missing_cost_source
  UNION ALL
  SELECT sku_id, 'missing_vendor_name',   'Rose_BI'
    FROM public.v_sku_publishability WHERE fail_missing_vendor
  UNION ALL
  SELECT sku_id, 'missing_unit',          'Rose_BI'
    FROM public.v_sku_publishability WHERE fail_missing_unit
  UNION ALL
  SELECT sku_id, 'missing_units_or_bunch','Rose_BI'
    FROM public.v_sku_publishability WHERE gap_missing_units
  UNION ALL
  -- grounded predicate (verifier-aligned): active SKU with no chrome images
  SELECT d.sku_id, 'missing_image',         'Job_PM'
    FROM public.dim_sku d
   WHERE COALESCE(d.quarantined, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.product_chrome pc
        WHERE pc.sku_id = d.sku_id
          AND jsonb_array_length(COALESCE(pc.images, '[]'::jsonb)) > 0)
  UNION ALL
  -- grounded predicate (verifier-aligned): active SKU with no chrome description
  SELECT d.sku_id, 'missing_contents_description', 'Job_PM'
    FROM public.dim_sku d
   WHERE COALESCE(d.quarantined, false) = false
     AND NOT EXISTS (
       SELECT 1 FROM public.product_chrome pc
        WHERE pc.sku_id = d.sku_id
          AND COALESCE(btrim(pc.description), '') <> '')
),
ins AS (
  INSERT INTO public.catalog_repair_state
    (sku_id, gate_id, owner_agent, state, evidence)
  SELECT
    g.sku_id, g.gate_id, g.owner_agent, 'open',
    jsonb_build_object('open', jsonb_build_object(
      'source', 'public.v_sku_publishability',
      'seeded_at', now(),
      'seed_migration', '20260603_catalog_repair_state.sql'))
  FROM gaps g
  -- skip rows whose sku_id is not in dim_sku (FK safety; 0 orphans at draft)
  WHERE EXISTS (SELECT 1 FROM public.dim_sku d WHERE d.sku_id = g.sku_id)
  -- idempotent re-run: don't duplicate an existing non-verified repair
  ON CONFLICT DO NOTHING
  RETURNING id, sku_id, gate_id, owner_agent
)
INSERT INTO public.catalog_repair_state_log (repair_id, from_state, to_state, actor, evidence)
SELECT id, NULL, 'open', 'system',
       jsonb_build_object('seed_migration', '20260603_catalog_repair_state.sql')
FROM ins;
