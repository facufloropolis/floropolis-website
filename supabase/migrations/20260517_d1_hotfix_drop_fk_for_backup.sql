-- =============================================================================
-- D1 Hotfix: Drop auth.users FKs from backup-side tables
-- v1 | 2026-05-17 | Job_PM W4-S11 [V8 SHADOW]
--
-- Why: Production user authentication lives in the production Supabase project
-- (rxiyhihxxxxxx.supabase.co). The checkout pipeline writes orders + addresses
-- to supabase-backup (ibckhcjvyxzrhvdiazbx). The auth.users row therefore does
-- NOT exist in backup, so the FK constraint blocks every INSERT.
--
-- Decision (W4-S11): Option A from the task spec — DROP the FKs on:
--   - orders.user_id          -> auth.users(id)
--   - addresses.user_id       -> auth.users(id)
--
-- Trade-off:
--   PRO: Simple, reversible, single migration. No need for stub user upsert
--        plumbing (which would also create a stale-data cleanup problem).
--   CON: Loses ON DELETE RESTRICT/CASCADE behavior. user_id becomes "trust the
--        app layer to write valid UUIDs". The app DOES validate via
--        supabase.auth.getUser() in /api/checkout/session before insert, so the
--        only way a bad UUID lands is if someone with service-role key writes
--        directly to backup — same blast radius as today.
--
-- Reversal plan (when checkout moves to production project):
--   ALTER TABLE orders
--     ADD CONSTRAINT orders_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
--   ALTER TABLE addresses
--     ADD CONSTRAINT addresses_user_id_fkey
--     FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
--
-- Idempotent.
-- =============================================================================

ALTER TABLE orders     DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
ALTER TABLE addresses  DROP CONSTRAINT IF EXISTS addresses_user_id_fkey;

-- Document the looser invariant.
COMMENT ON COLUMN orders.user_id    IS 'UUID of the authenticated user from PROD auth.users. FK dropped 2026-05-17 (W4-S11 hotfix): user lives in prod project, orders write to backup. App layer enforces validity via supabase.auth.getUser() prior to insert.';
COMMENT ON COLUMN addresses.user_id IS 'UUID of the authenticated user from PROD auth.users. FK dropped 2026-05-17 (W4-S11 hotfix): see orders.user_id comment.';
