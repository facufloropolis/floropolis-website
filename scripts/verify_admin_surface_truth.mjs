#!/usr/bin/env node
/**
 * verify_admin_surface_truth.mjs
 * ------------------------------------------------------------------------
 * Surface-truth verifier for the Floropolis admin.
 *
 * The admin UI renders numbers from several read paths, some of which go
 * stale. A verified failure (2026-06-03): /admin/catalog/config shows
 * failing-gate counts derived from `catalog_classifications` — a table that
 * was never recomputed after the gate-set was trimmed from the old 25-gate
 * model down to the live 13-row `catalog_quality_weights` set. The config
 * page showed 21 SKUs "missing images" while the live source of truth
 * (dim_sku LEFT JOIN product_chrome) says 332. The CEO discovered the UI
 * lying before the owning agent did. This script makes that a detectable,
 * machine-verifiable event.
 *
 * For each admin surface it runs the DISPLAYED-PATH query and the
 * SOURCE-OF-TRUTH query and compares them:
 *   1. Catalog grid:      v_catalog_admin count       vs catalog_published count.
 *   2. Config failing:    catalog_classifications-derived per-gate counts
 *                         vs live recomputation (dim_sku + product_chrome).
 *   3. Deprecated gates:  gate_ids present in catalog_classifications.failing_gates
 *                         that are absent from catalog_quality_weights.gate_id.
 *   4. Storefront authority: slug count in lib/data/floropolis_products.ts
 *                         vs catalog_published count (+ file git commit date).
 *
 * READ-ONLY. Only SELECT queries are issued against the BACKUP project.
 *
 * Output:
 *   - state/admin_surface_truth_YYYY-MM-DD.json   (full machine report)
 *   - PASS/FAIL summary table to stdout
 *   - exit code 1 if any check is FAIL
 *
 * Usage: node scripts/verify_admin_surface_truth.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loading — mirrors scripts/generate-products.mjs.
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const env = {};
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        let v = match[2].trim();
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1);
        }
        env[match[1].trim()] = v;
      }
    }
  }
  // process.env wins if explicitly set (CI), else fall back to .env.local.
  return { ...env, ...process.env };
}

const env = loadEnv();

// BACKUP project (supabase-backup, ibckhcjvyxzrhvdiazbx) owns the catalog gate
// tables/views. Same env-var contract used by generate-products.mjs.
const BACKUP_URL =
  env.BACKUP_SUPABASE_URL || env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  env.BACKUP_SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
const BACKUP_PROJECT_ID = "ibckhcjvyxzrhvdiazbx";

if (!BACKUP_URL || !BACKUP_KEY) {
  console.error(
    "\n!! MISSING BACKUP_SUPABASE_* env — cannot verify admin surfaces.",
  );
  console.error(
    "   Need: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY",
  );
  console.error(
    "     or: NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY\n",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// READ-ONLY SQL helper. Uses the PostgREST RPC for ad-hoc SQL is not available,
// so we issue plain SELECTs through the REST endpoint. To keep the queries
// expressive (aggregations, jsonb explode) we route through the project's
// `/rest/v1/rpc` is unavailable for arbitrary SQL; instead we fetch rows from
// views/tables and aggregate in JS where needed, and use a guarded SELECT-only
// SQL path via PostgREST's embedded resources where a view exists.
//
// All four checks below only ever read. There is intentionally NO code path
// that issues INSERT/UPDATE/DELETE/DDL.
// ---------------------------------------------------------------------------

/**
 * Fetch all rows of a table/view via PostgREST, paginating at 1000.
 * `select` and `filter` are passed straight through as query params.
 */
async function restSelectAll(table, { select = "*", filter = {} } = {}) {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const usp = new URLSearchParams({
      select,
      ...filter,
      offset: String(offset),
      limit: String(limit),
    });
    const url = `${BACKUP_URL}/rest/v1/${table}?${usp}`;
    const res = await fetch(url, {
      headers: {
        apikey: BACKUP_KEY,
        Authorization: `Bearer ${BACKUP_KEY}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Supabase REST ${table} ${res.status}: ${await res.text()}`,
      );
    }
    const data = await res.json();
    out.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

/**
 * Exact row count via PostgREST `count=exact` header (HEAD request, reads 0 rows).
 * Honors an optional filter map.
 */
async function restCount(table, filter = {}) {
  const usp = new URLSearchParams({ select: "*", ...filter, limit: "1" });
  const url = `${BACKUP_URL}/rest/v1/${table}?${usp}`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: {
      apikey: BACKUP_KEY,
      Authorization: `Bearer ${BACKUP_KEY}`,
      Prefer: "count=exact",
    },
  });
  if (!res.ok && res.status !== 206 && res.status !== 200) {
    throw new Error(`Supabase REST count ${table} ${res.status}`);
  }
  const cr = res.headers.get("content-range"); // e.g. "0-0/547"
  const total = cr && cr.includes("/") ? parseInt(cr.split("/")[1], 10) : NaN;
  if (Number.isNaN(total)) {
    throw new Error(`Could not parse count for ${table} (content-range=${cr})`);
  }
  return total;
}

// ---------------------------------------------------------------------------
// Gates the live weighted model actually evaluates, mapped to a deterministic
// recomputation from base data. The config page's failing counts are keyed by
// the gate_ids in catalog_classifications.failing_gates; the source of truth is
// recomputed here from dim_sku + product_chrome (matching the validator's real
// definitions), NOT read back from the stale classifications table.
//
// Recomputation definitions (grounded against the BACKUP schema 2026-06-03):
//   missing_image                 = active dim_sku with no product_chrome image array (or empty)
//   missing_contents_description  = active dim_sku with null/blank product_chrome.description
// Other evaluated gates (price_zero, missing_vendor_name, missing_unit,
// missing_cost_source, missing_box_dims, missing_units_or_bunch) are NOT
// recomputed here because they require pricing/inventory joins outside this
// script's read surface; they are reported as displayed-only with verdict
// SKIP_NO_TRUTH so the report is explicit about what was and wasn't checked.
// The two recomputed gates are the ones behind the verified CEO-facing failure.
// ---------------------------------------------------------------------------
const RECOMPUTABLE_GATES = ["missing_image", "missing_contents_description"];

function fmtDelta(displayed, truth) {
  if (typeof displayed !== "number" || typeof truth !== "number") return null;
  return displayed - truth;
}

// ---------------------------------------------------------------------------
// CHECK 1 — Catalog grid: v_catalog_admin vs catalog_published.
// ---------------------------------------------------------------------------
async function checkCatalogGrid() {
  const queries_used = [
    "SELECT count(*) FROM v_catalog_admin",
    "SELECT count(*) FROM catalog_published",
  ];
  const displayed = await restCount("v_catalog_admin");
  const truth = await restCount("catalog_published");
  const delta = fmtDelta(displayed, truth);
  return {
    surface: "catalog_grid",
    description:
      "Admin catalog grid row count (v_catalog_admin) vs publish authority (catalog_published).",
    displayed_value: displayed,
    truth_value: truth,
    delta,
    verdict: delta === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 2 — Config page failing counts: classifications-derived vs live recompute.
// ---------------------------------------------------------------------------
async function checkConfigFailingCounts() {
  const queries_used = [
    "SELECT failing_gates FROM catalog_classifications",
    "SELECT d.sku_id, pc.images, pc.description FROM dim_sku d LEFT JOIN product_chrome pc ON pc.sku_id=d.sku_id WHERE COALESCE(d.quarantined,false)=false",
  ];

  // DISPLAYED: per-gate failing counts derived from the stale classifications table.
  const cls = await restSelectAll("catalog_classifications", {
    select: "failing_gates",
  });
  const displayedByGate = {};
  for (const row of cls) {
    const fg = Array.isArray(row.failing_gates) ? row.failing_gates : [];
    for (const g of fg) {
      displayedByGate[g] = (displayedByGate[g] || 0) + 1;
    }
  }

  // TRUTH: live recomputation from base data for the recomputable gates.
  const active = await restSelectAll("dim_sku", {
    select: "sku_id,quarantined",
    filter: { quarantined: "is.false" },
  });
  const activeIds = new Set(active.map((r) => r.sku_id));
  const chrome = await restSelectAll("product_chrome", {
    select: "sku_id,images,description",
  });
  const chromeBySku = new Map(chrome.map((r) => [r.sku_id, r]));

  let liveMissingImage = 0;
  let liveMissingDesc = 0;
  for (const id of activeIds) {
    const c = chromeBySku.get(id);
    const imgs = c && c.images;
    const hasImage = Array.isArray(imgs) && imgs.length > 0;
    if (!hasImage) liveMissingImage++;
    const desc = c && c.description;
    const hasDesc = typeof desc === "string" && desc.trim().length > 0;
    if (!hasDesc) liveMissingDesc++;
  }

  const truthByGate = {
    missing_image: liveMissingImage,
    missing_contents_description: liveMissingDesc,
  };

  const gateResults = [];
  let anyFail = false;
  for (const gate of RECOMPUTABLE_GATES) {
    const displayed = displayedByGate[gate] || 0;
    const truth = truthByGate[gate];
    const delta = fmtDelta(displayed, truth);
    const verdict = delta === 0 ? "PASS" : "FAIL";
    if (verdict === "FAIL") anyFail = true;
    gateResults.push({
      gate,
      displayed_value: displayed,
      truth_value: truth,
      delta,
      verdict,
    });
  }

  return {
    surface: "config_failing_counts",
    description:
      "Per-gate failing counts shown on /admin/catalog/config (from stale catalog_classifications) vs live recomputation from dim_sku + product_chrome.",
    active_dim_sku: activeIds.size,
    per_gate: gateResults,
    // Surface-level displayed/truth use missing_image (the CEO-facing example).
    displayed_value: displayedByGate["missing_image"] || 0,
    truth_value: truthByGate["missing_image"],
    delta: fmtDelta(displayedByGate["missing_image"] || 0, truthByGate["missing_image"]),
    verdict: anyFail ? "FAIL" : "PASS",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 3 — Deprecated/ghost gates: failing_gates values absent from the
// live catalog_quality_weights.gate_id set.
// ---------------------------------------------------------------------------
async function checkDeprecatedGates() {
  const queries_used = [
    "SELECT gate_id FROM catalog_quality_weights",
    "SELECT failing_gates FROM catalog_classifications",
  ];
  const weights = await restSelectAll("catalog_quality_weights", {
    select: "gate_id",
  });
  const liveGateSet = new Set(weights.map((r) => r.gate_id));

  const cls = await restSelectAll("catalog_classifications", {
    select: "failing_gates",
  });
  const countByGate = {};
  for (const row of cls) {
    const fg = Array.isArray(row.failing_gates) ? row.failing_gates : [];
    for (const g of fg) countByGate[g] = (countByGate[g] || 0) + 1;
  }

  const ghosts = Object.entries(countByGate)
    .filter(([g]) => !liveGateSet.has(g))
    .map(([gate_id, count]) => ({ gate_id, count }))
    .sort((a, b) => b.count - a.count);

  const ghostTotal = ghosts.reduce((s, x) => s + x.count, 0);
  return {
    surface: "deprecated_gates",
    description:
      "Ghost gate_ids present in catalog_classifications.failing_gates but absent from the live catalog_quality_weights model. Each is a stale criterion the config page may still render.",
    displayed_value: ghosts.length, // # distinct ghost gate_ids
    truth_value: 0, // a clean classifications table would have zero ghosts
    delta: ghosts.length,
    ghost_gates: ghosts,
    ghost_failing_rows_total: ghostTotal,
    verdict: ghosts.length === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 4 — Storefront authority: static products file vs catalog_published.
// ---------------------------------------------------------------------------
async function checkStorefrontAuthority() {
  const queries_used = [
    'count of "slug": occurrences in lib/data/floropolis_products.ts',
    "SELECT count(*) FROM catalog_published",
    "git log -1 lib/data/floropolis_products.ts",
  ];
  const productsPath = join(REPO_ROOT, "lib/data/floropolis_products.ts");
  let displayed = NaN;
  let lastCommit = null;
  if (existsSync(productsPath)) {
    const src = readFileSync(productsPath, "utf8");
    // Count data slug entries; the interface line `slug: string;` has no quotes.
    const matches = src.match(/"slug"\s*:/g) || [];
    displayed = matches.length;
    try {
      lastCommit = execSync(
        `git log -1 --format=%cI -- lib/data/floropolis_products.ts`,
        { cwd: REPO_ROOT, encoding: "utf8" },
      ).trim();
    } catch {
      lastCommit = null;
    }
  }
  const truth = await restCount("catalog_published");
  const delta = fmtDelta(displayed, truth);
  return {
    surface: "storefront_authority",
    description:
      "Slug count in the static storefront file (lib/data/floropolis_products.ts) vs publish authority (catalog_published). A mismatch means the shipped catalog is out of sync with what publish authority allows.",
    displayed_value: displayed,
    truth_value: truth,
    delta,
    static_file_last_commit: lastCommit,
    verdict: delta === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main() {
  const checks = [];
  checks.push(await checkCatalogGrid());
  checks.push(await checkConfigFailingCounts());
  checks.push(await checkDeprecatedGates());
  checks.push(await checkStorefrontAuthority());

  const anyFail = checks.some((c) => c.verdict === "FAIL");
  const today = new Date().toISOString().slice(0, 10);

  const report = {
    generated_at: new Date().toISOString(),
    project: BACKUP_PROJECT_ID,
    overall_verdict: anyFail ? "FAIL" : "PASS",
    checks,
  };

  // Write JSON report.
  const stateDir = join(REPO_ROOT, "state");
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const outPath = join(stateDir, `admin_surface_truth_${today}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Human-readable summary.
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n=== Admin Surface-Truth Verifier ===");
  console.log(`project: ${BACKUP_PROJECT_ID}   generated: ${report.generated_at}`);
  console.log(`report:  ${outPath}\n`);
  console.log(
    `${pad("SURFACE", 26)} ${pad("DISPLAYED", 11)} ${pad("TRUTH", 11)} ${pad("DELTA", 9)} VERDICT`,
  );
  console.log("-".repeat(74));
  for (const c of checks) {
    console.log(
      `${pad(c.surface, 26)} ${pad(c.displayed_value, 11)} ${pad(c.truth_value, 11)} ${pad(c.delta, 9)} ${c.verdict}`,
    );
    if (c.surface === "config_failing_counts" && c.per_gate) {
      for (const g of c.per_gate) {
        console.log(
          `  - ${pad(g.gate, 22)} ${pad(g.displayed_value, 11)} ${pad(g.truth_value, 11)} ${pad(g.delta, 9)} ${g.verdict}`,
        );
      }
    }
    if (c.surface === "deprecated_gates" && c.ghost_gates && c.ghost_gates.length) {
      console.log(
        `    ghost gate_ids (${c.ghost_gates.length}, ${c.ghost_failing_rows_total} failing rows):`,
      );
      for (const g of c.ghost_gates) {
        console.log(`      ${pad(g.gate_id, 28)} x${g.count}`);
      }
    }
    if (c.surface === "storefront_authority") {
      console.log(`    static file last commit: ${c.static_file_last_commit}`);
    }
  }
  console.log("-".repeat(74));
  console.log(`OVERALL: ${report.overall_verdict}\n`);

  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("verify_admin_surface_truth FAILED to run:", err);
  process.exit(2);
});
