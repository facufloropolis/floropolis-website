-- DOWN: price_history + price-shift observability
-- v1 | 2026-06-03 | Job_PM — reverses 20260603_price_history.sql
-- Drops the view first, then the table (CASCADE removes its policies + indexes).
-- Project: supabase BACKUP (ibckhcjvyxzrhvdiazbx)

DROP VIEW IF EXISTS public.v_price_shifts;

DROP TABLE IF EXISTS public.price_history;
