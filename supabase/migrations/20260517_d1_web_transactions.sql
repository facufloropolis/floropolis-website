-- =============================================================================
-- D1 Web Transactions Migration
-- v1 | 2026-05-17 | Job_PM [V8 SHADOW]
-- Project: web_transactions.md (STRATEGIC PRIORITY #1)
-- Target: supabase-backup (ibckhcjvyxzrhvdiazbx) - NOT production
--
-- Creates 6 tables for direct-to-Stripe checkout, replacing email-quote flow:
--   addresses         - reusable customer billing/shipping addresses
--   orders            - one row per customer purchase + lifecycle
--   order_lines       - line items (SKU x quantity x locked price)
--   payments          - append-only Stripe preauth/charge/refund events
--   invoices          - finalized order PDFs + sequential invoice numbers
--   refund_approvals  - quorum vote log (JJ <=$200, Facu >$200, both >$500)
--
-- Job_PM decisions on open questions (2026-05-17):
--   1. Tax at order level only (no per-line tax for D1)
--   2. Promo codes punted to D2
--   3. Money fields use numeric(12,2); app converts to cents for Stripe
--   4. sku_vendor_snapshot added to order_lines for margin reports
--   5. order_lines.sku_id NOT a foreign key (mirror truncates daily)
--   6. Admin role = client_profiles.status='admin'
--   7. Invoice bucket = 'invoices' (private; signed URLs on demand)
--   8. order_number auto-generated as FD-YYYY-NNNNN from order_number_seq
--
-- Idempotent: safe to re-run. Uses IF NOT EXISTS everywhere.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Sequences
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 1001 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS order_number_seq   START WITH 10001 INCREMENT BY 1;

-- Reusable updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Admin detection (Facu + JJ). Reads client_profiles.status = 'admin'.
-- TODO when admin_platform.md ships: switch to a dedicated role enum.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_profiles
    WHERE user_id = auth.uid()
      AND status = 'admin'
  );
$$;

-- Order number generator: FD-2026-10001 etc.
CREATE OR REPLACE FUNCTION next_order_number()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT 'FD-' || to_char(now(), 'YYYY') || '-' || nextval('order_number_seq')::text;
$$;

-- =============================================================================
-- addresses
-- =============================================================================
CREATE TABLE IF NOT EXISTS addresses (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('billing','shipping','both')),
  is_default     boolean NOT NULL DEFAULT false,
  recipient_name text NOT NULL,
  business_name  text,
  phone          text,
  line1          text NOT NULL,
  line2          text,
  city           text NOT NULL,
  state          text NOT NULL,
  postal_code    text NOT NULL,
  country        text NOT NULL DEFAULT 'US' CHECK (length(country) = 2),
  stripe_raw     jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_default
  ON addresses(user_id, kind) WHERE is_default = true;

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON addresses;
CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON addresses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "addresses_owner_select" ON addresses;
CREATE POLICY "addresses_owner_select" ON addresses
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "addresses_owner_insert" ON addresses;
CREATE POLICY "addresses_owner_insert" ON addresses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "addresses_owner_update" ON addresses;
CREATE POLICY "addresses_owner_update" ON addresses
  FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "addresses_owner_delete" ON addresses;
CREATE POLICY "addresses_owner_delete" ON addresses
  FOR DELETE USING (auth.uid() = user_id);

-- =============================================================================
-- orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id                       bigserial PRIMARY KEY,
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_number             text NOT NULL UNIQUE DEFAULT next_order_number(),
  status                   text NOT NULL DEFAULT 'cart' CHECK (status IN (
    'cart','pending_payment','card_saved','preauth_held',
    'paid','fulfilled','cancelled','refunded','failed'
  )),
  payment_mode             text NOT NULL CHECK (payment_mode IN ('mode_a','mode_b','mode_c')),
  lead_time_days           integer NOT NULL CHECK (lead_time_days >= 0),
  requested_delivery_date  date NOT NULL,
  scheduled_preauth_at     timestamptz,
  scheduled_charge_at      timestamptz,
  currency                 text NOT NULL DEFAULT 'USD',
  subtotal                 numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  shipping_total           numeric(12,2) NOT NULL DEFAULT 0 CHECK (shipping_total >= 0),
  tax_total                numeric(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  discount_total           numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  grand_total              numeric(12,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  billing_address_id       bigint REFERENCES addresses(id) ON DELETE SET NULL,
  shipping_address_id      bigint REFERENCES addresses(id) ON DELETE SET NULL,
  shipping_address_snapshot jsonb,
  billing_address_snapshot  jsonb,
  stripe_customer_id       text,
  stripe_payment_method_id text,
  stripe_setup_intent_id   text,
  customer_note            text,
  internal_note            text,
  source                   text NOT NULL DEFAULT 'web' CHECK (source IN ('web','quote_fallback','admin_manual')),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz,
  submitted_at             timestamptz,
  paid_at                  timestamptz,
  fulfilled_at             timestamptz,
  cancelled_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id   ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status    ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_charge ON orders(scheduled_charge_at)
  WHERE scheduled_charge_at IS NOT NULL AND status IN ('card_saved','preauth_held');
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_preauth ON orders(scheduled_preauth_at)
  WHERE scheduled_preauth_at IS NOT NULL AND status = 'card_saved';
CREATE INDEX IF NOT EXISTS idx_orders_stripe_customer ON orders(stripe_customer_id);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_owner_select" ON orders;
CREATE POLICY "orders_owner_select" ON orders
  FOR SELECT USING (auth.uid() = user_id OR is_admin());
DROP POLICY IF EXISTS "orders_owner_insert" ON orders;
CREATE POLICY "orders_owner_insert" ON orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "orders_owner_update_cart" ON orders;
CREATE POLICY "orders_owner_update_cart" ON orders
  FOR UPDATE USING (
    (auth.uid() = user_id AND status IN ('cart','pending_payment'))
    OR is_admin()
  );

-- =============================================================================
-- order_lines
-- DECISION: sku_id is plain bigint (NO foreign key) because the mirror table is
-- truncated + reloaded daily. Snapshot columns hold the authoritative product
-- data at time of order.
-- =============================================================================
CREATE TABLE IF NOT EXISTS order_lines (
  id                    bigserial PRIMARY KEY,
  order_id              bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id                bigint NOT NULL,  -- intentionally no FK; mirror truncates daily
  sku_name_snapshot     text NOT NULL,
  sku_variety_snapshot  text,
  sku_length_snapshot   text,
  sku_unit_snapshot     text,
  sku_vendor_snapshot   text,             -- for margin reports (Facu's call)
  quantity              integer NOT NULL CHECK (quantity > 0),
  unit_price_locked     numeric(12,2) NOT NULL CHECK (unit_price_locked >= 0),
  line_total_locked     numeric(12,2) NOT NULL CHECK (line_total_locked >= 0),
  currency              text NOT NULL DEFAULT 'USD',
  catalog_price_at_lock numeric(12,2),
  is_on_deal_at_lock    boolean DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz
);

CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_order_lines_sku_id   ON order_lines(sku_id);

DROP TRIGGER IF EXISTS trg_order_lines_updated_at ON order_lines;
CREATE TRIGGER trg_order_lines_updated_at BEFORE UPDATE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE order_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_lines_owner_select" ON order_lines;
CREATE POLICY "order_lines_owner_select" ON order_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_lines.order_id
            AND (o.user_id = auth.uid() OR is_admin()))
  );
DROP POLICY IF EXISTS "order_lines_owner_write" ON order_lines;
CREATE POLICY "order_lines_owner_write" ON order_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_lines.order_id
            AND ((o.user_id = auth.uid() AND o.status IN ('cart','pending_payment'))
                 OR is_admin()))
  );

-- =============================================================================
-- payments  (APPEND-ONLY ledger)
-- =============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id                       bigserial PRIMARY KEY,
  order_id                 bigint NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  parent_payment_id        bigint REFERENCES payments(id),
  kind                     text NOT NULL CHECK (kind IN (
    'preauth','full_charge','refund','capture','void'
  )),
  status                   text NOT NULL CHECK (status IN (
    'pending','requires_action','succeeded','failed','cancelled','disputed'
  )),
  amount                   numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency                 text NOT NULL DEFAULT 'USD',
  stripe_payment_intent_id text,
  stripe_charge_id         text,
  stripe_refund_id         text,
  stripe_setup_intent_id   text,
  stripe_payment_method_id text,
  idempotency_key          text UNIQUE NOT NULL,
  refund_reason            text,
  refund_approval_id       bigint,
  error_code               text,
  error_message            text,
  next_action              jsonb,
  stripe_event_raw         jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz,
  processed_at             timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id      ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status        ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_kind          ON payments(kind);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi     ON payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_charge ON payments(stripe_charge_id);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_owner_select" ON payments;
CREATE POLICY "payments_owner_select" ON payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = payments.order_id
            AND (o.user_id = auth.uid() OR is_admin()))
  );
DROP POLICY IF EXISTS "payments_admin_write" ON payments;
CREATE POLICY "payments_admin_write" ON payments
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =============================================================================
-- refund_approvals
-- Quorum vote log. JJ <=$200, Facu >$200, both required >$500.
-- =============================================================================
CREATE TABLE IF NOT EXISTS refund_approvals (
  id                  bigserial PRIMARY KEY,
  order_id            bigint NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id          bigint REFERENCES payments(id),
  proposed_amount     numeric(12,2) NOT NULL CHECK (proposed_amount > 0),
  currency            text NOT NULL DEFAULT 'USD',
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','approved','rejected','executed','expired'
  )),
  proposed_by         uuid NOT NULL REFERENCES auth.users(id),
  reason              text NOT NULL,
  jj_approved         boolean,
  jj_approved_at      timestamptz,
  jj_user_id          uuid REFERENCES auth.users(id),
  facu_approved       boolean,
  facu_approved_at    timestamptz,
  facu_user_id        uuid REFERENCES auth.users(id),
  quorum_met          boolean NOT NULL DEFAULT false,
  executed_payment_id bigint REFERENCES payments(id),
  executed_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz,
  expires_at          timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_refund_approval_id_fkey;
ALTER TABLE payments
  ADD CONSTRAINT payments_refund_approval_id_fkey
  FOREIGN KEY (refund_approval_id) REFERENCES refund_approvals(id);

CREATE INDEX IF NOT EXISTS idx_refund_approvals_order_id ON refund_approvals(order_id);
CREATE INDEX IF NOT EXISTS idx_refund_approvals_status   ON refund_approvals(status);

DROP TRIGGER IF EXISTS trg_refund_approvals_updated_at ON refund_approvals;
CREATE TRIGGER trg_refund_approvals_updated_at BEFORE UPDATE ON refund_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE refund_approvals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "refund_approvals_admin_all" ON refund_approvals;
CREATE POLICY "refund_approvals_admin_all" ON refund_approvals
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Quorum computation trigger (server-enforced; mirrors app-layer rule)
CREATE OR REPLACE FUNCTION compute_refund_quorum()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.proposed_amount <= 200 THEN
    NEW.quorum_met := COALESCE(NEW.jj_approved,false) OR COALESCE(NEW.facu_approved,false);
  ELSIF NEW.proposed_amount <= 500 THEN
    NEW.quorum_met := COALESCE(NEW.facu_approved,false);
  ELSE
    NEW.quorum_met := COALESCE(NEW.jj_approved,false) AND COALESCE(NEW.facu_approved,false);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_approvals_quorum ON refund_approvals;
CREATE TRIGGER trg_refund_approvals_quorum BEFORE INSERT OR UPDATE ON refund_approvals
  FOR EACH ROW EXECUTE FUNCTION compute_refund_quorum();

-- =============================================================================
-- invoices
-- =============================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id                bigserial PRIMARY KEY,
  order_id          bigint NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
  invoice_number    text NOT NULL UNIQUE DEFAULT ('INV-' || nextval('invoice_number_seq')::text),
  issued_at         timestamptz NOT NULL DEFAULT now(),
  pdf_storage_path  text,
  pdf_url           text,
  pdf_sha256        text,
  currency          text NOT NULL DEFAULT 'USD',
  subtotal          numeric(12,2) NOT NULL,
  shipping_total    numeric(12,2) NOT NULL DEFAULT 0,
  tax_total         numeric(12,2) NOT NULL DEFAULT 0,
  discount_total    numeric(12,2) NOT NULL DEFAULT 0,
  grand_total       numeric(12,2) NOT NULL,
  seller_legal_name text NOT NULL DEFAULT 'Floral Direct LLC',
  seller_ein        text NOT NULL DEFAULT '39-4713788',
  seller_address    text NOT NULL DEFAULT '200 S Wilton Pl, Los Angeles CA 90004',
  buyer_snapshot    jsonb NOT NULL,
  tax_jurisdiction  text,
  tax_rate          numeric(6,4),
  voided            boolean NOT NULL DEFAULT false,
  voided_at         timestamptz,
  voided_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id  ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issued_at ON invoices(issued_at);

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_owner_select" ON invoices;
CREATE POLICY "invoices_owner_select" ON invoices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = invoices.order_id
            AND (o.user_id = auth.uid() OR is_admin()))
  );
DROP POLICY IF EXISTS "invoices_admin_write" ON invoices;
CREATE POLICY "invoices_admin_write" ON invoices
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =============================================================================
-- Table comments
-- =============================================================================
COMMENT ON TABLE addresses        IS 'D1: Reusable customer billing/shipping addresses. Snapshot into orders.*_snapshot at submit.';
COMMENT ON TABLE orders           IS 'D1: One row per customer purchase. payment_mode encodes lead-time tier (mode_a/b/c).';
COMMENT ON TABLE order_lines      IS 'D1: Line items. unit_price_locked is snapshot at submit; sku_id has NO foreign key (mirror truncates daily).';
COMMENT ON TABLE payments         IS 'D1: APPEND-ONLY Stripe ledger. Refunds reference parent_payment_id.';
COMMENT ON TABLE refund_approvals IS 'D1: Quorum vote log. JJ<=$200, Facu>$200, both>$500. quorum_met gates refund execution.';
COMMENT ON TABLE invoices         IS 'D1: Sequential accounting invoices. Immutable totals snapshot.';
