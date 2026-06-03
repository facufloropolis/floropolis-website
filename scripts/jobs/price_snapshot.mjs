#!/usr/bin/env node
/**
 * price_snapshot.mjs
 * ----------------------------------------------------------------------------
 * DAILY snapshot of the COMPUTED sell price per published SKU, for price
 * observability (Facu: "I want to KNOW when prices shift and why").
 *
 * Floropolis sell prices are not stored — they compute live from silver inputs
 * (farm_cost, gpm_target, box chargeable kg, stems per box, fedex rate, fuel
 * surcharge) and shift silently when any input moves. This job records the
 * computed price + the exact input vector each day into price_history, and
 * diffs the new snapshot against the previous one to flag SKUs whose price
 * moved >2% and WHICH input caused it.
 *
 * PRICE FORMULA — replicated EXACTLY from scripts/generate-products.mjs
 * (loadPricing / resolveBox / computeSellPrice). Constants come from
 * pricing_constants (DB); box weight + stems from box_master_mirror. Nothing
 * is hardcoded:
 *     priceExDelivery  = farm_cost / (1 - gpm_target)
 *     deliveryPerBox   = ceil(box.kg) * fedex_rate_per_kg * fuel_surcharge_mult
 *     stemsPerBox      = catalog_published.pack (if >0) else box.stems
 *     deliveryPerStem  = deliveryPerBox / stemsPerBox
 *     sell             = round((priceExDelivery + deliveryPerStem) * 1e4) / 1e4
 * SKUs that cannot be priced (no box weight / no stems-per-box / cost<=0) are
 * skipped from the snapshot and listed (they would show $0 on the storefront).
 *
 * inputs jsonb shape (one per snapshot row):
 *   { farm_cost, gpm, box_type, box_weight_kg, stems_per_box,
 *     fedex_rate_per_kg, fuel_surcharge_mult, delivery_per_stem,
 *     price_ex_delivery, market }
 *
 * DIFF: if price_history exists and has a previous run, compares each SKU's new
 * inputs vector + price against its most-recent prior snapshot; lists SKUs with
 * |pct change| > 2%, attributing the move to the changed input key(s).
 *
 * --dry-run (DEFAULT when DRY_RUN env set, or --dry-run flag): prints the
 * would-write snapshot summary + diff; writes NOTHING.
 *
 * Env contract: identical to scripts/generate-products.mjs (BACKUP_*).
 *
 * Usage:
 *   node scripts/jobs/price_snapshot.mjs --dry-run
 *   node scripts/jobs/price_snapshot.mjs            # LIVE (writes price_history)
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
  return { ...env, ...process.env };
}
const ENV = loadEnv();

const BACKUP_URL = ENV.BACKUP_SUPABASE_URL || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  ENV.BACKUP_SUPABASE_SERVICE_KEY || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
const PRICING_MARKET = ENV.PRICING_MARKET || "Ecuador";

if (!BACKUP_URL || !BACKUP_KEY) {
  console.error("\n!! MISSING BACKUP_SUPABASE_* env — cannot snapshot prices.");
  console.error("   Need: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY");
  console.error("     or: NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY\n");
  process.exit(2);
}

const DRY_RUN =
  process.argv.includes("--dry-run") ||
  (ENV.DRY_RUN != null && String(ENV.DRY_RUN).toLowerCase() !== "false" && ENV.DRY_RUN !== "0");

const sb = createClient(BACKUP_URL, BACKUP_KEY, { auth: { persistSession: false } });

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

// ---------------------------------------------------------------------------
// Pricing inputs — REPLICATES generate-products.mjs loadPricing() exactly.
// ---------------------------------------------------------------------------
async function loadPricing() {
  const pcRows = await selectAll(
    "pricing_constants",
    "id,market,value_numeric",
    (q) =>
      q
        .eq("market", PRICING_MARKET)
        .in("id", ["gpm_target", "fedex_rate_per_kg", "fuel_surcharge_mult"]),
  );
  const c = {};
  for (const r of pcRows) {
    const n = Number(r.value_numeric);
    if (Number.isFinite(n)) c[r.id] = n;
  }
  for (const key of ["gpm_target", "fedex_rate_per_kg", "fuel_surcharge_mult"]) {
    if (!(key in c)) {
      throw new Error(
        `pricing_constants missing '${key}' for market=${PRICING_MARKET}; refusing to snapshot prices.`,
      );
    }
  }

  const bmRows = await selectAll(
    "box_master_mirror",
    "vendor_canonical_name,legacy_box_type,box_family,fedex_chargeable_kg,stems_per_box",
    (q) => q.eq("active", true),
  );
  const boxByVendorType = new Map();
  const boxByType = new Map();
  for (const r of bmRows) {
    const vendor = String(r.vendor_canonical_name || "").toUpperCase().trim();
    const kg = Number(r.fedex_chargeable_kg);
    const stems = Number(r.stems_per_box);
    if (!Number.isFinite(kg)) continue;
    const types = new Set();
    if (r.legacy_box_type) types.add(String(r.legacy_box_type).toUpperCase().trim());
    if (r.box_family) types.add(String(r.box_family).toUpperCase().trim());
    for (const bt of types) {
      if (!bt) continue;
      if (vendor) boxByVendorType.set(`${vendor}|${bt}`, { kg, stems });
      const prev = boxByType.get(bt);
      if (!prev || kg < prev.kg) {
        boxByType.set(bt, { kg, stems: Number.isFinite(stems) ? stems : prev?.stems });
      }
    }
  }
  return { constants: c, boxByVendorType, boxByType };
}

function resolveBox(pricing, vendor, boxType) {
  if (!boxType) return null;
  const v = String(vendor || "").toUpperCase().trim();
  const bt = String(boxType).toUpperCase().trim();
  return pricing.boxByVendorType.get(`${v}|${bt}`) || pricing.boxByType.get(bt) || null;
}

// Returns { price, inputs } or { price: null, reason } when unpriceable.
// Mirrors generate-products.mjs computeSellPrice exactly, but also returns the
// full input vector for observability.
function computeSnapshot(pricing, row) {
  const cost = Number(row.farm_cost);
  if (!Number.isFinite(cost) || cost <= 0) return { price: null, reason: "cost<=0" };
  const gpm = pricing.constants.gpm_target;
  const priceExDelivery = cost / (1 - gpm);

  const box = resolveBox(pricing, row.vendor, row.box_type);
  const pack = Number(row.pack);
  const stemsPerBox =
    Number.isFinite(pack) && pack > 0
      ? pack
      : box && Number.isFinite(box.stems) && box.stems > 0
        ? box.stems
        : null;

  if (!box || stemsPerBox == null) {
    return { price: null, reason: !box ? "no box weight" : "no stems-per-box" };
  }

  const deliveryPerBox =
    Math.ceil(box.kg) *
    pricing.constants.fedex_rate_per_kg *
    pricing.constants.fuel_surcharge_mult;
  const deliveryPerStem = deliveryPerBox / stemsPerBox;
  const price = Math.round((priceExDelivery + deliveryPerStem) * 10000) / 10000;

  const inputs = {
    farm_cost: cost,
    gpm,
    box_type: String(row.box_type || "").toUpperCase(),
    box_weight_kg: box.kg,
    stems_per_box: stemsPerBox,
    fedex_rate_per_kg: pricing.constants.fedex_rate_per_kg,
    fuel_surcharge_mult: pricing.constants.fuel_surcharge_mult,
    delivery_per_stem: Math.round(deliveryPerStem * 10000) / 10000,
    price_ex_delivery: Math.round(priceExDelivery * 10000) / 10000,
    market: PRICING_MARKET,
  };
  return { price, inputs };
}

// ---------------------------------------------------------------------------
// Previous snapshot per SKU — for the diff. Reads price_history if it exists.
// Returns Map<sku_id, { computed_price, inputs }> for the most-recent run, or
// null if the table is absent / empty.
// ---------------------------------------------------------------------------
async function loadPreviousSnapshot() {
  // Probe existence/most-recent timestamp.
  const probe = await sb
    .from("price_history")
    .select("captured_at")
    .order("captured_at", { ascending: false })
    .limit(1);
  if (probe.error) {
    // Table not migrated yet. Postgres raises 42P01 (undefined_table); PostgREST
    // surfaces it as PGRST205 "Could not find the table ... in the schema cache".
    const e = probe.error;
    if (
      e.code === "42P01" ||
      e.code === "PGRST205" ||
      /does not exist/i.test(e.message || "") ||
      /could not find the table/i.test(e.message || "")
    ) {
      return { exists: false, prev: null };
    }
    throw new Error(`price_history probe: ${e.message}`);
  }
  if (!probe.data || probe.data.length === 0) return { exists: true, prev: null };

  const rows = await selectAll("price_history", "sku_id,computed_price,inputs,captured_at");
  // most-recent row per sku
  const bySku = new Map();
  for (const r of rows) {
    const cur = bySku.get(r.sku_id);
    if (!cur || new Date(r.captured_at) > new Date(cur.captured_at)) bySku.set(r.sku_id, r);
  }
  return { exists: true, prev: bySku };
}

function diffInputs(oldInputs, newInputs) {
  const keys = new Set([...Object.keys(oldInputs || {}), ...Object.keys(newInputs || {})]);
  const changed = {};
  for (const k of keys) {
    const a = oldInputs ? oldInputs[k] : undefined;
    const b = newInputs ? newInputs[k] : undefined;
    // compare as JSON to catch numeric + string diffs uniformly
    if (JSON.stringify(a) !== JSON.stringify(b)) changed[k] = { old: a, new: b };
  }
  return changed;
}

async function main() {
  console.log("=== PRICE SNAPSHOT (published SKUs, canonical formula) ===");
  console.log(`mode: ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE"}   market: ${PRICING_MARKET}   project: BACKUP`);

  const pricing = await loadPricing();
  console.log(
    `  pricing_constants: gpm=${pricing.constants.gpm_target} ` +
      `fedex=${pricing.constants.fedex_rate_per_kg} fuel=${pricing.constants.fuel_surcharge_mult}`,
  );
  console.log(`  box types loaded: ${pricing.boxByType.size}`);

  // Published SKUs — same source + columns as generate-products.mjs.
  const rows = await selectAll(
    "catalog_published",
    "sku_id,vendor,box_type,farm_cost,pack,display_name,tier",
  );
  console.log(`  catalog_published rows: ${rows.length}`);

  const snapshot = []; // { sku_id, computed_price, inputs }
  const unpriced = [];
  for (const r of rows) {
    const { price, inputs, reason } = computeSnapshot(pricing, r);
    if (price == null) {
      unpriced.push({ sku_id: r.sku_id, name: r.display_name, vendor: r.vendor, box: r.box_type, reason });
      continue;
    }
    snapshot.push({ sku_id: r.sku_id, computed_price: price, inputs });
  }

  // ----- DIFF vs previous snapshot -----
  const { exists: tableExists, prev } = await loadPreviousSnapshot();
  const shifts = []; // { sku_id, old, new, pct, changed_inputs }
  if (prev) {
    for (const s of snapshot) {
      const p = prev.get(s.sku_id);
      if (!p) continue; // new SKU — no prior price to compare
      const oldPrice = Number(p.computed_price);
      if (!Number.isFinite(oldPrice) || oldPrice === 0) continue;
      const pct = ((s.computed_price - oldPrice) / oldPrice) * 100;
      if (Math.abs(pct) > 2) {
        shifts.push({
          sku_id: s.sku_id,
          old: oldPrice,
          new: s.computed_price,
          pct: Math.round(pct * 10000) / 10000,
          changed_inputs: diffInputs(p.inputs, s.inputs),
        });
      }
    }
    shifts.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  }

  // ----- WRITE (LIVE only) -----
  let written = 0;
  if (!DRY_RUN) {
    const payload = snapshot.map((s) => ({
      sku_id: s.sku_id,
      computed_price: s.computed_price,
      inputs: s.inputs,
    }));
    for (let i = 0; i < payload.length; i += 500) {
      const { error } = await sb.from("price_history").insert(payload.slice(i, i + 500));
      if (error) throw new Error(`insert price_history: ${error.message}`);
    }
    written = payload.length;
  }

  // ----- SUMMARY -----
  const prices = snapshot.map((s) => s.computed_price).sort((a, b) => a - b);
  const min = prices[0] ?? null;
  const max = prices[prices.length - 1] ?? null;
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n--- SNAPSHOT SUMMARY ---");
  console.log(`${pad("priced SKUs", 26)} ${snapshot.length}`);
  console.log(`${pad("unpriced (skipped)", 26)} ${unpriced.length}`);
  console.log(`${pad("price min / median / max", 26)} ${min} / ${median} / ${max}`);
  console.log(`${pad(DRY_RUN ? "would write rows" : "rows written", 26)} ${DRY_RUN ? snapshot.length : written}`);

  if (unpriced.length) {
    console.log(`\nunpriced SKUs (would be $0 on storefront):`);
    for (const u of unpriced.slice(0, 20)) {
      console.log(`  - [${u.reason}] "${u.name}" (sku ${u.sku_id}, vendor ${u.vendor}, box ${u.box})`);
    }
    if (unpriced.length > 20) console.log(`  ... and ${unpriced.length - 20} more`);
  }

  console.log("\n--- PRICE DIFF vs previous snapshot ---");
  if (!tableExists) {
    console.log("  price_history table does not exist yet (apply 20260603_price_history.sql first).");
    console.log("  → first LIVE run will be the baseline; diffs begin on the next run.");
  } else if (!prev) {
    console.log("  no previous snapshot rows — this run is the baseline. Diffs begin next run.");
  } else if (shifts.length === 0) {
    console.log("  no SKU moved more than 2% since the previous snapshot.");
  } else {
    console.log(`  ${shifts.length} SKU(s) moved >2%:`);
    console.log(`  ${pad("SKU", 38)} ${pad("OLD", 10)} ${pad("NEW", 10)} ${pad("PCT", 9)} CHANGED INPUTS`);
    for (const s of shifts.slice(0, 50)) {
      const causes = Object.entries(s.changed_inputs)
        .map(([k, v]) => `${k}:${JSON.stringify(v.old)}→${JSON.stringify(v.new)}`)
        .join(", ");
      console.log(`  ${pad(s.sku_id, 38)} ${pad(s.old, 10)} ${pad(s.new, 10)} ${pad(s.pct + "%", 9)} ${causes || "(price changed, inputs identical — check formula/constants)"}`);
    }
    if (shifts.length > 50) console.log(`  ... and ${shifts.length - 50} more`);
  }

  console.log(`\nmode: ${DRY_RUN ? "DRY-RUN — nothing written" : "LIVE — snapshot written to price_history"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("price_snapshot FAILED:", err);
  process.exit(1);
});
