# CLAUDE.md — Floropolis Web Rebuild
# v1 | 2026-06-02 | Job_PM
# Read this before every session on this repo.

## What this repo is
The Floropolis admin + customer-facing site. Branch `proposal/inventory-data-validator` (being renamed to `next`) is the active build — 152 commits ahead of `main`. It deploys to a Vercel preview on every push. `main` = legacy production site, untouched.

## Database
**ONE database: BACKUP (Supabase sandbox)**
- Project ID: `ibckhcjvyxzrhvdiazbx`
- All reads and writes go here. Zero exceptions.
- Client: `getBackupServiceClient()` — already in the codebase.
- **NEVER touch PROD** (`swhglnjyuorkycpgkmec`). PROD is the live site. Any write to PROD from this codebase is a critical violation.

## The canonical catalog tables (source of truth)
These are the tables that matter. Everything else is legacy or derived.

| Table | What it is |
|---|---|
| `dim_sku` | The spine — every SKU, PK = `sku_id` (uuid) |
| `canonical_cost` | Cost + provenance per SKU, FK to dim_sku |
| `product_chrome` | Images + descriptions per SKU, FK to dim_sku |
| `catalog_published` | Gold view — 547 truly shippable SKUs, reads ZERO bronze |
| `v_sku_publishability` | Live per-SKU publishability status (865 publishable) |
| `catalog_availability_windows` | Delivery windows per tier+origin (T2/T3, governed) |
| `catalog_quality_weights` | Gate weights (REVOKE-protected, write via apply_quality_proposal only) |

**NEVER write directly to** `dim_sku`, `canonical_cost`, `product_chrome`. All changes to canonical data go through `admin_proposals` → `apply_quality_proposal()` (SECURITY DEFINER function).

## What `floropolis_inventory_mirror` was
A stale snapshot of PROD inventory, last synced 19 days ago. It is being REPLACED by `catalog_published` + `dim_sku`. Do not build new features on it. Every reference to it is legacy to be migrated.

## Column mapping: mirror → canonical
When migrating code off `floropolis_inventory_mirror`:

| Mirror column | Canonical source | Notes |
|---|---|---|
| `id` (bigint) | `dim_sku.sku_id` (uuid) | PK type change — update routes from `/[id]` to `/[sku_id]` |
| `name` | `catalog_published.display_name` | |
| `variety` | `catalog_published.variety` | same |
| `category` | `catalog_published.category` | same |
| `color` | `catalog_published.color` | same |
| `vendor` | `catalog_published.vendor` | same |
| `length` (text) | `catalog_published.size_cm` (int) | was "50cm", now integer 50 |
| `unit` | `catalog_published.selling_unit` | renamed |
| `box_type` | `catalog_published.box_type` | same |
| `tier` | `catalog_published.tier` | same |
| `farm_cost` | `catalog_published.farm_cost` | same |
| `images` | `catalog_published.images` (jsonb) | same |
| `contents_note` | `catalog_published.description` | renamed |
| `slug` | `catalog_published.slug` | same |
| `availability_min/max_days_ahead` | `catalog_published.availability_min/max_days_ahead` | new, better |
| `price` | compute: use pricing formula from `pricing_constants` | not stored, computed |
| `stock, total_stems` | null for now — no live source | fill null, show "—" in UI |
| `units_per_box` | null for now — pending vendor-scoped box_master | fill null |
| `margin_status` | compute from farm_cost + pricing formula | or null |
| `live, active` | `catalog_published` presence = active+publishable | if row exists in catalog_published → show as active |
| `cost_source` | `canonical_cost.cost_confidence` | different concept |
| `has_open_price_alert` | null for now | fill false |

## All-or-nothing write rule
Every config change (quality gates, pricing, availability windows) must go through `admin_proposals` → approval → `apply_quality_proposal()`. This is enforced at the DB level via SECURITY DEFINER. Do not bypass it.

## What you can freely change
- UI components, layouts, filters, sort logic
- Server actions that read from the canonical tables above
- New pages and routes
- Adding columns to SELECT queries from canonical tables

## What you must NOT do
- Write directly to `dim_sku`, `canonical_cost`, `product_chrome`
- Read from or write to PROD (`swhglnjyuorkycpgkmec`)
- Merge to `main` (that is a manual Facu-approved event)
- Change `catalog_quality_weights`, `catalog_availability_windows`, `catalog_quality_thresholds` directly

## Active branch
`proposal/inventory-data-validator` — push here. Vercel auto-deploys to preview.
