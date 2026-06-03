#!/usr/bin/env node
/**
 * refresh_classifications.mjs
 * ----------------------------------------------------------------------------
 * RECURRING refresh of catalog_classifications (NOT a drop/recreate).
 *
 * catalog_classifications was RE-DERIVED + re-keyed to dim_sku.sku_id (uuid) by
 * supabase/migrations/20260603_recompute_classifications_current_spec.sql using
 * the current 13-gate vocab. That one-shot recompute goes STALE as chrome,
 * costs, box dims and dim_sku fields change. This job re-evaluates the per-SKU
 * gate booleans from silver on a schedule (daily, replacing the retired
 * inventory_data_validator — Facu-approved 2026-06-03) and UPSERTS ONLY the rows
 * whose status or failing_gates actually changed.
 *
 * GATE PREDICATES — identical to the migration's STEP 3 (same silver sources):
 *   BLOCKING (6):
 *     price_zero          : NOT (any facu_approved canonical_cost.farm_cost > 0)
 *     missing_cost_source : NOT (any facu_approved canonical_cost.source_id NOT NULL)
 *     missing_vendor_name : dim_sku.vendor_canonical_name NULL/blank
 *     missing_unit        : dim_sku.selling_unit NULL/blank
 *     missing_box_dims    : no box_master_mirror row matching (vendor_canonical_name
 *                           AND (legacy_box_type=box_type OR box_family=box_type), ci)
 *     missing_image       : no product_chrome row w/ images jsonb length >= 1
 *   PUBLISHABLE_GAP (2, recorded, do NOT block):
 *     missing_contents_description : no product_chrome.description non-empty
 *     missing_units_or_bunch       : dim_sku.pack IS NULL AND stems_per_unit IS NULL
 *   PERFECT_GAP (5, weight=0): NOT evaluated (no data signal) — never written.
 *
 *   status = 'blocked' if ANY blocking gate fails, else 'publishable'.
 *   'perfect' is set downstream by the score-based promoter — never written here.
 *
 * SCOPE = active SKUs = dim_sku WHERE quarantined=false. One row per sku_id.
 *
 * PRESERVATION (hard rules):
 *   - On UPDATE, only ever writes: status, failing_gates, blocking_gate_count,
 *     vendor, tier, variety, last_validated_at (always), last_changed_at (only
 *     when status OR failing_gates changed).
 *   - NEVER touches reviewer_action / reviewer_at / reviewer_user_id /
 *     reviewer_notes / quality_family_id / availability_window_override_id.
 *   - New active SKUs (no existing row): INSERT.
 *   - Rows whose SKU is no longer active (quarantined / gone from dim_sku):
 *     DELETE (logged). FK is ON DELETE CASCADE from dim_sku, but a SKU that is
 *     merely quarantined (not deleted) keeps a stale classification row, so we
 *     delete those explicitly here. (Decision: DELETE, see header report.)
 *
 * --dry-run (DEFAULT when DRY_RUN env is set, or --dry-run flag): computes and
 * prints would-change counts + the summary table, writes NOTHING.
 *
 * Env contract: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY (CI), or
 * NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY, or
 * .env.local — same as scripts/generate-products.mjs.
 *
 * Usage:
 *   node scripts/jobs/refresh_classifications.mjs --dry-run
 *   node scripts/jobs/refresh_classifications.mjs            # LIVE
 * ----------------------------------------------------------------------------
 */

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Env loading — mirrors scripts/generate-products.mjs.
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        env[m[1].trim()] = v;
      }
    }
  }
  return { ...env, ...process.env }; // process.env wins (CI)
}
const ENV = loadEnv();

const BACKUP_URL = ENV.BACKUP_SUPABASE_URL || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  ENV.BACKUP_SUPABASE_SERVICE_KEY || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;

if (!BACKUP_URL || !BACKUP_KEY) {
  console.error("\n!! MISSING BACKUP_SUPABASE_* env — cannot refresh classifications.");
  console.error("   Need: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY");
  console.error("     or: NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY\n");
  process.exit(2);
}

// DRY-RUN default when DRY_RUN env set OR --dry-run flag present.
const DRY_RUN =
  process.argv.includes("--dry-run") ||
  (ENV.DRY_RUN != null && String(ENV.DRY_RUN).toLowerCase() !== "false" && ENV.DRY_RUN !== "0");

const sb = createClient(BACKUP_URL, BACKUP_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Paginated SELECT through supabase-js (range), so large tables come back whole.
// ---------------------------------------------------------------------------
async function selectAll(table, columns, applyFilters = (q) => q) {
  const out = [];
  const page = 1000;
  let from = 0;
  while (true) {
    let q = sb.from(table).select(columns).range(from, from + page - 1);
    q = applyFilters(q);
    const { data, error } = await q;
    if (error) throw new Error(`select ${table}: ${error.message}`);
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

function isBlank(s) {
  return s == null || String(s).trim() === "";
}

// ---------------------------------------------------------------------------
// Recompute one classification row per active SKU from silver.
// Returns Map<sku_id, { status, failing_gates(sorted), blocking_gate_count,
//                       vendor, tier, variety }>.
// ---------------------------------------------------------------------------
async function computeDesired() {
  // canonical_cost (facu_approved) aggregated per SKU.
  const cost = await selectAll(
    "canonical_cost",
    "sku_id,farm_cost,source_id,facu_approved",
    (q) => q.eq("facu_approved", true),
  );
  const costBySku = new Map(); // sku_id -> { has_price, has_cost_source }
  for (const r of cost) {
    const cur = costBySku.get(r.sku_id) || { has_price: false, has_cost_source: false };
    if (r.farm_cost != null && Number(r.farm_cost) > 0) cur.has_price = true;
    if (r.source_id != null) cur.has_cost_source = true;
    costBySku.set(r.sku_id, cur);
  }

  // box_master_mirror (active) — index by vendor+type and by type, ci.
  const boxes = await selectAll(
    "box_master_mirror",
    "vendor_canonical_name,legacy_box_type,box_family",
    (q) => q.eq("active", true),
  );
  // Set of "vendor|boxtype" keys that exist (lowercased), matching migration
  // predicate: vendor_canonical_name = d.vendor AND (legacy_box_type=box_type
  // OR box_family=box_type), case-insensitive.
  const boxKeys = new Set();
  for (const b of boxes) {
    const v = String(b.vendor_canonical_name || "").toLowerCase().trim();
    for (const t of [b.legacy_box_type, b.box_family]) {
      if (t == null) continue;
      const bt = String(t).toLowerCase().trim();
      if (bt) boxKeys.add(`${v}|${bt}`);
    }
  }
  const hasBox = (vendor, boxType) => {
    if (isBlank(boxType)) return false; // no box_type → cannot match → fail gate
    const v = String(vendor || "").toLowerCase().trim();
    return boxKeys.has(`${v}|${String(boxType).toLowerCase().trim()}`);
  };

  // product_chrome — image presence + description presence per SKU.
  const chrome = await selectAll("product_chrome", "sku_id,images,description");
  const chromeBySku = new Map(); // sku_id -> { has_image, has_desc }
  for (const c of chrome) {
    const cur = chromeBySku.get(c.sku_id) || { has_image: false, has_desc: false };
    if (Array.isArray(c.images) && c.images.length > 0) cur.has_image = true;
    if (typeof c.description === "string" && c.description.trim() !== "") cur.has_desc = true;
    chromeBySku.set(c.sku_id, cur);
  }

  // active SKUs
  const skus = await selectAll(
    "dim_sku",
    "sku_id,vendor_canonical_name,tier,variety_normalized,selling_unit,box_type,pack,stems_per_unit,quarantined",
    (q) => q.eq("quarantined", false),
  );

  const desired = new Map();
  for (const d of skus) {
    const c = costBySku.get(d.sku_id) || { has_price: false, has_cost_source: false };
    const ch = chromeBySku.get(d.sku_id) || { has_image: false, has_desc: false };

    const fail_price_zero = !c.has_price;
    const fail_missing_cost_source = !c.has_cost_source;
    const fail_missing_vendor_name = isBlank(d.vendor_canonical_name);
    const fail_missing_unit = isBlank(d.selling_unit);
    const fail_missing_box_dims = !hasBox(d.vendor_canonical_name, d.box_type);
    const fail_missing_image = !ch.has_image;
    const fail_missing_contents_description = !ch.has_desc;
    const fail_missing_units_or_bunch = d.pack == null && d.stems_per_unit == null;

    const failing = [];
    if (fail_price_zero) failing.push("price_zero");
    if (fail_missing_cost_source) failing.push("missing_cost_source");
    if (fail_missing_vendor_name) failing.push("missing_vendor_name");
    if (fail_missing_unit) failing.push("missing_unit");
    if (fail_missing_box_dims) failing.push("missing_box_dims");
    if (fail_missing_image) failing.push("missing_image");
    if (fail_missing_contents_description) failing.push("missing_contents_description");
    if (fail_missing_units_or_bunch) failing.push("missing_units_or_bunch");

    const blocking_gate_count =
      (fail_price_zero ? 1 : 0) +
      (fail_missing_cost_source ? 1 : 0) +
      (fail_missing_vendor_name ? 1 : 0) +
      (fail_missing_unit ? 1 : 0) +
      (fail_missing_box_dims ? 1 : 0) +
      (fail_missing_image ? 1 : 0);

    desired.set(d.sku_id, {
      status: blocking_gate_count > 0 ? "blocked" : "publishable",
      failing_gates: failing.sort(), // sorted for stable equality compare
      blocking_gate_count,
      vendor: d.vendor_canonical_name ?? null,
      tier: d.tier ?? null,
      variety: d.variety_normalized ?? null,
    });
  }
  return desired;
}

// status/failing_gates equality (the change signal that drives last_changed_at).
function classChanged(existing, want) {
  if (existing.status !== want.status) return true;
  const a = Array.isArray(existing.failing_gates) ? [...existing.failing_gates].sort() : [];
  const b = want.failing_gates;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
  return false;
}

async function main() {
  console.log("=== REFRESH catalog_classifications (current 13-gate spec) ===");
  console.log(`mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}   project: BACKUP`);

  const desired = await computeDesired();

  // Existing rows. Pull only the columns we read/compare. NEVER selects reviewer_*
  // or quality_family_id/availability_window_override_id — we never touch them.
  const existingRows = await selectAll(
    "catalog_classifications",
    "sku_id,status,failing_gates,blocking_gate_count,vendor,tier,variety",
  );
  const existing = new Map(existingRows.map((r) => [r.sku_id, r]));

  const toInsert = [];
  const toUpdate = []; // { row, changed: bool }
  let unchanged = 0;

  for (const [sku_id, want] of desired) {
    const cur = existing.get(sku_id);
    if (!cur) {
      toInsert.push({ sku_id, ...want });
      continue;
    }
    const changed = classChanged(cur, want);
    const metaChanged =
      cur.blocking_gate_count !== want.blocking_gate_count ||
      cur.vendor !== want.vendor ||
      cur.tier !== want.tier ||
      cur.variety !== want.variety;
    if (changed || metaChanged) {
      toUpdate.push({ sku_id, want, changed });
    } else {
      unchanged++;
    }
  }

  // SKUs with an existing row that are no longer active → DELETE.
  const toDelete = [];
  for (const sku_id of existing.keys()) {
    if (!desired.has(sku_id)) toDelete.push(sku_id);
  }

  // -------------------------------------------------------------------------
  // Apply (LIVE only). UPDATE writes a tight column set; INSERT lets DB defaults
  // fill reviewer_*/created_at; last_changed_at only advances on a real change.
  // -------------------------------------------------------------------------
  let insertedN = 0, updatedN = 0, deletedN = 0;
  const nowIso = new Date().toISOString();

  if (!DRY_RUN) {
    // INSERTs (batch)
    if (toInsert.length) {
      const payload = toInsert.map((r) => ({
        sku_id: r.sku_id,
        status: r.status,
        failing_gates: r.failing_gates,
        blocking_gate_count: r.blocking_gate_count,
        vendor: r.vendor,
        tier: r.tier,
        variety: r.variety,
        last_validated_at: nowIso,
        last_changed_at: nowIso,
      }));
      // chunk to stay well under payload limits
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await sb
          .from("catalog_classifications")
          .insert(payload.slice(i, i + 500));
        if (error) throw new Error(`insert: ${error.message}`);
      }
      insertedN = toInsert.length;
    }

    // UPDATEs (per-row: only the safe columns; preserves reviewer_*/family/window)
    for (const u of toUpdate) {
      const patch = {
        status: u.want.status,
        failing_gates: u.want.failing_gates,
        blocking_gate_count: u.want.blocking_gate_count,
        vendor: u.want.vendor,
        tier: u.want.tier,
        variety: u.want.variety,
        last_validated_at: nowIso, // always
      };
      if (u.changed) patch.last_changed_at = nowIso; // only on real change
      const { error } = await sb
        .from("catalog_classifications")
        .update(patch)
        .eq("sku_id", u.sku_id);
      if (error) throw new Error(`update ${u.sku_id}: ${error.message}`);
      updatedN++;
    }

    // DELETEs (newly-inactive SKUs)
    if (toDelete.length) {
      for (let i = 0; i < toDelete.length; i += 500) {
        const { error } = await sb
          .from("catalog_classifications")
          .delete()
          .in("sku_id", toDelete.slice(i, i + 500));
        if (error) throw new Error(`delete: ${error.message}`);
      }
      deletedN = toDelete.length;
    }
  } else {
    insertedN = toInsert.length;
    updatedN = toUpdate.length;
    deletedN = toDelete.length;
  }

  // -------------------------------------------------------------------------
  // Summary table.
  // -------------------------------------------------------------------------
  const statusChanges = toUpdate.filter((u) => u.changed).length;
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n--- REFRESH SUMMARY ---");
  console.log(`${pad("ACTION", 28)} COUNT`);
  console.log("-".repeat(40));
  console.log(`${pad("inserted (new active SKU)", 28)} ${insertedN}`);
  console.log(`${pad("updated (any field)", 28)} ${updatedN}`);
  console.log(`${pad("  of which status/gates moved", 28)} ${statusChanges}`);
  console.log(`${pad("deleted (now inactive)", 28)} ${deletedN}`);
  console.log(`${pad("unchanged", 28)} ${unchanged}`);
  console.log("-".repeat(40));
  console.log(`${pad("active SKUs evaluated", 28)} ${desired.size}`);
  console.log(`${pad("existing rows before", 28)} ${existing.size}`);
  console.log("-".repeat(40));
  if (toDelete.length) {
    console.log(`deleted sku_ids (now inactive): ${toDelete.length}`);
    for (const id of toDelete.slice(0, 20)) console.log(`  - ${id}`);
    if (toDelete.length > 20) console.log(`  ... and ${toDelete.length - 20} more`);
  }
  console.log(`\nmode: ${DRY_RUN ? "DRY-RUN — nothing written" : "LIVE — changes applied"}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("refresh_classifications FAILED:", err);
  process.exit(1);
});
