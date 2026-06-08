-- Phase B: rebuild v_catalog_admin over the full non-quarantined dim_sku universe.
-- v1 | 2026-06-08 | Codex build packet for Job/Nahua review
-- Target: supabase BACKUP (ibckhcjvyxzrhvdiazbx) ONLY.
--
-- WHY
-- The existing v_catalog_admin was derived from catalog_published, so the admin
-- surface only saw the published subset. That created the anti-pattern
-- "published = universe": blocked but valid dim_sku SKUs were invisible.
--
-- CONTRACT
-- - One row per public.dim_sku row where quarantined=false.
-- - publish_status is a column: published / blocked / quarantined.
-- - publish_status is NEVER a WHERE filter in this view.
-- - Flodecol gypsophila rows that are grams-keyed but still sell as stem are
--   marked unpriced until capacity_matrix exists (capacity_unit_mismatch).
-- - No orders/deals/cohort/order_status tables touched.

CREATE OR REPLACE VIEW public.v_catalog_admin AS
WITH pricing AS (
  SELECT
    max(value_numeric) FILTER (WHERE id = 'gpm_target') AS gpm_target,
    max(value_numeric) FILTER (WHERE id = 'fedex_rate_per_kg') AS fedex_rate_per_kg,
    max(value_numeric) FILTER (WHERE id = 'fuel_surcharge_mult') AS fuel_surcharge_mult
  FROM public.pricing_constants
  WHERE market = 'Ecuador'
),
cost AS (
  SELECT DISTINCT ON (cc.sku_id)
    cc.sku_id,
    cc.farm_cost,
    cc.cost_confidence,
    cc.source_id,
    cc.updated_at AS cost_verified_at
  FROM public.canonical_cost cc
  WHERE cc.facu_approved = true
  ORDER BY cc.sku_id, cc.facu_approved_at DESC NULLS LAST, cc.updated_at DESC NULLS LAST, cc.cost_id DESC
),
box AS (
  SELECT DISTINCT ON (upper(b.vendor_canonical_name), upper(coalesce(b.legacy_box_type, b.box_family)))
    upper(b.vendor_canonical_name) AS vendor_key,
    upper(coalesce(b.legacy_box_type, b.box_family)) AS box_key,
    b.fedex_chargeable_kg,
    b.stems_per_box
  FROM public.box_master_mirror b
  WHERE b.active = true
  ORDER BY
    upper(b.vendor_canonical_name),
    upper(coalesce(b.legacy_box_type, b.box_family)),
    b.facu_approved DESC NULLS LAST,
    b.updated_at DESC NULLS LAST,
    b.box_id DESC
),
box_fallback AS (
  SELECT DISTINCT ON (upper(coalesce(b.legacy_box_type, b.box_family)))
    upper(coalesce(b.legacy_box_type, b.box_family)) AS box_key,
    b.fedex_chargeable_kg,
    b.stems_per_box
  FROM public.box_master_mirror b
  WHERE b.active = true
  ORDER BY
    upper(coalesce(b.legacy_box_type, b.box_family)),
    b.facu_approved DESC NULLS LAST,
    b.updated_at DESC NULLS LAST,
    b.box_id DESC
),
base AS (
  SELECT
    d.sku_id,
    coalesce(pc.display_name, initcap(concat_ws(' ',
      d.variety_normalized,
      nullif(d.color_normalized, 'na'),
      coalesce(d.size_cm::text || ' cm', d.size_grams::text || 'g')
    ))) AS name,
    d.variety_normalized AS variety,
    d.category,
    d.color_normalized AS color,
    d.vendor_canonical_name AS vendor,
    d.tier,
    d.box_type,
    d.selling_unit AS unit,
    d.size_cm::text AS length,
    c.farm_cost,
    pc.images,
    pc.description AS contents_note,
    pc.slug,
    d.origin_country,
    d.pack,
    d.size_grams,
    aw.availability_min_days_ahead,
    aw.availability_max_days_ahead,
    aw.valid_delivery_days_of_week,
    c.cost_confidence AS cost_source,
    c.cost_verified_at,
    cls.status AS classification_status,
    CASE
      WHEN coalesce(d.quarantined, false) THEN 'quarantined'
      WHEN pub.sku_id IS NOT NULL THEN 'published'
      ELSE 'blocked'
    END AS publish_status,
    CASE
      WHEN d.vendor_canonical_name = 'Flodecol'
       AND d.category = 'Gypsophila'
       AND d.size_grams IS NOT NULL
       AND lower(coalesce(d.selling_unit, '')) = 'stem'
      THEN true ELSE false
    END AS capacity_unit_mismatch,
    coalesce(b.fedex_chargeable_kg, bf.fedex_chargeable_kg) AS fedex_chargeable_kg,
    coalesce(
      nullif(d.pack, 0),
      nullif(d.stems_per_unit, 0),
      nullif(coalesce(b.stems_per_box, bf.stems_per_box), 0)
    ) AS units_per_box,
    p.gpm_target,
    p.fedex_rate_per_kg,
    p.fuel_surcharge_mult
  FROM public.dim_sku d
  LEFT JOIN cost c ON c.sku_id = d.sku_id
  LEFT JOIN public.product_chrome pc ON pc.sku_id = d.sku_id
  LEFT JOIN public.catalog_classifications cls ON cls.sku_id = d.sku_id
  LEFT JOIN public.catalog_published pub ON pub.sku_id = d.sku_id
  LEFT JOIN public.catalog_availability_windows aw
    ON aw.tier = d.tier
   AND aw.vendor_origin_country = d.origin_country
   AND aw.facu_approved = true
   AND aw.effective_to IS NULL
  LEFT JOIN box b
    ON b.vendor_key = upper(d.vendor_canonical_name)
   AND b.box_key = upper(d.box_type)
  LEFT JOIN box_fallback bf
    ON bf.box_key = upper(d.box_type)
  CROSS JOIN pricing p
  WHERE coalesce(d.quarantined, false) = false
),
priced AS (
  SELECT
    base.*,
    CASE
      WHEN capacity_unit_mismatch THEN NULL
      WHEN farm_cost IS NULL OR farm_cost <= 0 THEN NULL
      WHEN fedex_chargeable_kg IS NULL OR fedex_rate_per_kg IS NULL OR fuel_surcharge_mult IS NULL THEN NULL
      WHEN units_per_box IS NULL OR units_per_box <= 0 THEN NULL
      ELSE round(((ceil(fedex_chargeable_kg) * fedex_rate_per_kg * fuel_surcharge_mult) / units_per_box)::numeric, 4)
    END AS delivery_cost,
    CASE
      WHEN capacity_unit_mismatch THEN NULL
      WHEN farm_cost IS NULL OR farm_cost <= 0 THEN NULL
      WHEN gpm_target IS NULL OR gpm_target >= 1 THEN NULL
      WHEN fedex_chargeable_kg IS NULL OR fedex_rate_per_kg IS NULL OR fuel_surcharge_mult IS NULL THEN NULL
      WHEN units_per_box IS NULL OR units_per_box <= 0 THEN NULL
      ELSE round(((farm_cost / (1 - gpm_target)) + ((ceil(fedex_chargeable_kg) * fedex_rate_per_kg * fuel_surcharge_mult) / units_per_box))::numeric, 4)
    END AS price
  FROM base
)
SELECT
  sku_id,
  name,
  variety,
  category,
  color,
  vendor,
  tier,
  box_type,
  unit,
  length,
  farm_cost,
  images,
  contents_note,
  slug,
  origin_country,
  pack,
  size_grams,
  availability_min_days_ahead,
  availability_max_days_ahead,
  valid_delivery_days_of_week,
  cost_source,
  CASE
    WHEN capacity_unit_mismatch THEN 'unpriced_capacity_unit_mismatch'
    WHEN price IS NULL THEN 'unpriced'
    WHEN publish_status = 'published' THEN 'published'
    ELSE coalesce(classification_status, publish_status)
  END AS computable_status,
  (cost_source IS NULL) AS fail_missing_cost_source,
  (fedex_chargeable_kg IS NULL) AS fail_missing_box_dims,
  (images IS NULL OR jsonb_array_length(images) = 0) AS pending_image_gate,
  (contents_note IS NULL OR btrim(contents_note) = '') AS pending_contents_description_gate,
  price,
  NULL::integer AS stock,
  units_per_box AS total_stems,
  units_per_box,
  CASE WHEN publish_status = 'published' THEN true ELSE false END AS live,
  CASE WHEN publish_status = 'published' THEN true ELSE false END AS active,
  CASE
    WHEN capacity_unit_mismatch THEN 'unpriced'
    WHEN price IS NULL THEN 'unpriced'
    WHEN (price - farm_cost - coalesce(delivery_cost, 0)) < ((farm_cost + coalesce(delivery_cost, 0)) / 0.95 - farm_cost - coalesce(delivery_cost, 0)) THEN 'below_floor'
    ELSE 'ok'
  END AS margin_status,
  false AS has_open_price_alert,
  NULL::date AS arrival_date,
  cost_verified_at,
  delivery_cost,
  CASE
    WHEN price IS NULL OR price <= 0 THEN NULL
    ELSE round(((price - farm_cost - coalesce(delivery_cost, 0)) / price)::numeric, 4)
  END AS gpm_actual,
  CASE
    WHEN price IS NULL THEN NULL
    ELSE round((price - farm_cost - coalesce(delivery_cost, 0))::numeric, 4)
  END AS margin,
  CASE
    WHEN farm_cost IS NULL OR capacity_unit_mismatch THEN NULL
    ELSE round(((farm_cost + coalesce(delivery_cost, 0)) / 0.95)::numeric, 4)
  END AS price_floor,
  publish_status,
  capacity_unit_mismatch
FROM priced;

COMMENT ON VIEW public.v_catalog_admin IS
  'Admin catalog universe: one row per non-quarantined dim_sku. publish_status is a column, not a filter. Flodecol gypsophila stem-vs-grams rows are unpriced until capacity_matrix exists.';
