-- DOWN: catalog repair-state loop
-- v1 | 2026-06-03 | Job_PM — reverses 20260603_catalog_repair_state.sql
-- Drops the view, the log table (FK child first), then the parent table.
-- Project: supabase-backup (ibckhcjvyxzrhvdiazbx)

DROP VIEW IF EXISTS public.v_repair_loop_closure_rate;

DROP TABLE IF EXISTS public.catalog_repair_state_log;

DROP TABLE IF EXISTS public.catalog_repair_state;
