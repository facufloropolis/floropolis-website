#!/usr/bin/env node
/**
 * verify_orders_spine.mjs
 * ------------------------------------------------------------------------
 * Paired verifier for the Floropolis ORDERS SPINE (Pipeline Law).
 *
 * Contract: this verifier runs BEFORE any consumer of the orders spine
 * (dispatch, P&L, conversion attribution). A FAIL blocks promotion. It is the
 * "verifier" half of the builder!=verifier pair — it compares what the spine
 * tables actually contain against the invariants the schema promises, and
 * against an INDEPENDENT read-channel for lead_master resolution.
 *
 * READ-ONLY. Only SELECT/HEAD queries are issued. There is intentionally NO
 * code path that issues INSERT/UPDATE/DELETE/DDL.
 *
 * DB = BACKUP project (supabase-backup, ibckhcjvyxzrhvdiazbx) — the same env
 * contract used by scripts/verify_admin_surface_truth.mjs, which this mirrors.
 *
 * Schema under test (applied 2026-06-03):
 *   - orders(source, status, fulfillment_state machine, lead_master_id bigint,
 *     linkage_mode, is_test, address_confirmed_at, cohort_id; CHECK is_test OR
 *     lead_master_id NOT NULL)
 *   - order_status_log(order_id, from_state, to_state, actor, evidence, at)
 *   - order_lines(sku_uuid uuid, unit_price_locked, cost_snapshot)
 *   - deals / cohort_decisions(divergence generated) /
 *     order_conversions(outcome CHECK converted requires paid_order_id or
 *     k2k_invoice_ref) / confirm_address_quarantine
 *
 * Checks (each prints a PASS/FAIL/WARN row; overall exit 1 only on any FAIL):
 *   1. identity_born_with     — non-test orders w/ NULL lead_master_id|linkage_mode = 0
 *   2. log_completeness       — every non-test order has >=1 log row AND the
 *                               chronologically-latest to_state == fulfillment_state
 *   3. price_snapshots        — paid/fulfilled lines have unit_price_locked (FAIL);
 *                               sample-source lines missing cost_snapshot (WARN)
 *   4. conversions_integrity  — converted rows lacking paid_order_id AND
 *                               k2k_invoice_ref = 0 (belt+suspenders over CHECK)
 *   5. source_census          — counts per source + per fulfillment_state (always PASS)
 *   6. quarantine_pulse       — unresolved confirm_address_quarantine rows
 *                               (WARN if >0, FAIL if >10)
 *   7. lead_master_resolution — every DISTINCT non-null lead_master_id on non-test
 *                               orders exists in the lead_master read-channel
 *                               (a: BACKUP mirror table; b: PROD read-only; c: WARN)
 *
 * Output:
 *   - state/orders_spine_verify_YYYY-MM-DD.json   (full machine report)
 *   - PASS/FAIL summary table to stdout
 *   - exit code 1 if any check is FAIL; 2 on harness/env error
 *
 * Usage: node scripts/verify_orders_spine.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loading — mirrors scripts/verify_admin_surface_truth.mjs.
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

// BACKUP project (supabase-backup, ibckhcjvyxzrhvdiazbx) owns the orders spine.
// Same env-var contract used by verify_admin_surface_truth.mjs.
const BACKUP_URL =
  env.BACKUP_SUPABASE_URL || env.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  env.BACKUP_SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;
const BACKUP_PROJECT_ID = "ibckhcjvyxzrhvdiazbx";

// The orders spine is RLS-protected. The anon key sees ZERO rows on orders/
// order_lines/lead_master, which would make every check report a green PASS
// against an empty read surface — a fake PASS. This verifier therefore needs a
// SERVICE key. We track which key class we have so main() can hard-abort (exit
// 2) rather than emit a misleading PASS when the spine is invisible.
const BACKUP_KEY_IS_SERVICE = Boolean(env.BACKUP_SUPABASE_SERVICE_KEY);

// PROD read-channel (production, swhglnjyuorkycpgkmec) — used ONLY by check 7
// option (b), and ONLY for a read-only select against public.lead_master.
// Env names reused verbatim from lib/supabase/prod-server.ts.
const PROD_URL = env.PROD_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const PROD_KEY =
  env.PROD_SUPABASE_SERVICE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!BACKUP_URL || !BACKUP_KEY) {
  console.error(
    "\n!! MISSING BACKUP_SUPABASE_* env — cannot verify the orders spine.",
  );
  console.error("   Need: BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY");
  console.error(
    "     or: NEXT_PUBLIC_BACKUP_SUPABASE_URL + NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY\n",
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// READ-ONLY PostgREST helpers. Same approach as verify_admin_surface_truth.mjs:
// no arbitrary-SQL RPC is available, so we fetch rows from tables/views and
// aggregate in JS. Generalized over a base URL + key so check 7 can also read
// the PROD read-channel with the identical paging/count machinery.
// ---------------------------------------------------------------------------

/** Fetch all rows of a table/view via PostgREST, paginating at 1000. */
async function restSelectAll(
  table,
  { select = "*", filter = {}, baseUrl = BACKUP_URL, key = BACKUP_KEY } = {},
) {
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
    const url = `${baseUrl}/rest/v1/${table}?${usp}`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
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

/** Exact row count via PostgREST `count=exact` (HEAD request, reads 0 rows). */
async function restCount(
  table,
  filter = {},
  { baseUrl = BACKUP_URL, key = BACKUP_KEY } = {},
) {
  const usp = new URLSearchParams({ select: "*", ...filter, limit: "1" });
  const url = `${baseUrl}/rest/v1/${table}?${usp}`;
  const res = await fetch(url, {
    method: "HEAD",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
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

/** Does a BACKUP table/view exist & is it readable via PostgREST? */
async function restTableExists(table, { baseUrl = BACKUP_URL, key = BACKUP_KEY } = {}) {
  const url = `${baseUrl}/rest/v1/${table}?select=*&limit=1`;
  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  return res.ok;
}

function offenderSlice(arr, n = 5) {
  return arr.slice(0, n);
}

// ---------------------------------------------------------------------------
// CHECK 1 — identity_born_with: every non-test order is born linked.
//   FAIL if any non-test order has NULL lead_master_id OR NULL linkage_mode.
// ---------------------------------------------------------------------------
async function checkIdentityBornWith() {
  const queries_used = [
    "SELECT id,lead_master_id,linkage_mode FROM orders WHERE is_test=false",
  ];
  const rows = await restSelectAll("orders", {
    select: "id,lead_master_id,linkage_mode",
    filter: { is_test: "is.false" },
  });
  const offenders = rows
    .filter((r) => r.lead_master_id == null || r.linkage_mode == null)
    .map((r) => ({
      order_id: r.id,
      lead_master_id: r.lead_master_id,
      linkage_mode: r.linkage_mode,
    }));
  const displayed = offenders.length; // observed violations
  return {
    surface: "identity_born_with",
    description:
      "Non-test orders born without identity (NULL lead_master_id or NULL linkage_mode). The is_test-OR-lead_master CHECK only guards lead_master_id; linkage_mode is enforced here.",
    displayed_value: displayed,
    truth_value: 0,
    delta: displayed - 0,
    non_test_orders: rows.length,
    offenders: offenderSlice(offenders),
    verdict: displayed === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 2 — log_completeness: every non-test order has >=1 status-log row AND
//   the chronologically-latest to_state equals orders.fulfillment_state.
//   Scoped to non-test orders (test orders are seed noise and must not block
//   promotion). FAIL on any missing-log or state-mismatch offender.
// ---------------------------------------------------------------------------
async function checkLogCompleteness() {
  const queries_used = [
    "SELECT id,fulfillment_state FROM orders WHERE is_test=false",
    "SELECT order_id,to_state,at FROM order_status_log",
  ];
  const orders = await restSelectAll("orders", {
    select: "id,fulfillment_state",
    filter: { is_test: "is.false" },
  });
  const logs = await restSelectAll("order_status_log", {
    select: "order_id,to_state,at",
  });

  // Latest log row per order_id by chronological `at` (tie-break: keep latest seen).
  const latestByOrder = new Map();
  const countByOrder = new Map();
  for (const l of logs) {
    countByOrder.set(l.order_id, (countByOrder.get(l.order_id) || 0) + 1);
    const prev = latestByOrder.get(l.order_id);
    if (!prev || new Date(l.at).getTime() >= new Date(prev.at).getTime()) {
      latestByOrder.set(l.order_id, l);
    }
  }

  const missingLog = [];
  const stateMismatch = [];
  for (const o of orders) {
    const cnt = countByOrder.get(o.id) || 0;
    if (cnt < 1) {
      missingLog.push({ order_id: o.id, fulfillment_state: o.fulfillment_state });
      continue;
    }
    const latest = latestByOrder.get(o.id);
    if (latest && latest.to_state !== o.fulfillment_state) {
      stateMismatch.push({
        order_id: o.id,
        order_fulfillment_state: o.fulfillment_state,
        latest_log_to_state: latest.to_state,
        latest_log_at: latest.at,
      });
    }
  }
  const offenderCount = missingLog.length + stateMismatch.length;
  return {
    surface: "log_completeness",
    description:
      "Every non-test order has >=1 order_status_log row, and the chronologically-latest to_state matches orders.fulfillment_state (the trigger should keep these in lockstep).",
    displayed_value: offenderCount,
    truth_value: 0,
    delta: offenderCount - 0,
    non_test_orders: orders.length,
    missing_log_offenders: offenderSlice(missingLog),
    state_mismatch_offenders: offenderSlice(stateMismatch),
    verdict: offenderCount === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 3 — price_snapshots:
//   - paid/fulfilled order lines MUST have unit_price_locked (FAIL).
//   - sample-source order lines missing cost_snapshot => WARN (program P&L
//     incomplete, not blocking yet).
//   Test orders are excluded from the blocking price check (seed noise), but
//   their state is reported in the JSON for transparency.
// ---------------------------------------------------------------------------
async function checkPriceSnapshots() {
  const queries_used = [
    "SELECT id,status,source,is_test FROM orders",
    "SELECT id,order_id,unit_price_locked,cost_snapshot FROM order_lines",
  ];
  const orders = await restSelectAll("orders", {
    select: "id,status,source,is_test",
  });
  const lines = await restSelectAll("order_lines", {
    select: "id,order_id,unit_price_locked,cost_snapshot",
  });
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const PAID_STATES = new Set(["paid", "fulfilled"]);
  const missingPrice = []; // FAIL — paid/fulfilled, non-test, null price
  const missingPriceTest = []; // reported only
  const sampleMissingCost = []; // WARN — sample source, null cost_snapshot

  for (const ln of lines) {
    const o = orderById.get(ln.order_id);
    if (!o) continue;
    const priceMissing = ln.unit_price_locked == null;
    if (PAID_STATES.has(o.status) && priceMissing) {
      if (o.is_test) {
        missingPriceTest.push({ line_id: ln.id, order_id: ln.order_id, status: o.status });
      } else {
        missingPrice.push({ line_id: ln.id, order_id: ln.order_id, status: o.status });
      }
    }
    if (o.source === "sample" && ln.cost_snapshot == null) {
      sampleMissingCost.push({ line_id: ln.id, order_id: ln.order_id });
    }
  }

  const failCount = missingPrice.length;
  const warnCount = sampleMissingCost.length;
  let verdict = "PASS";
  if (failCount > 0) verdict = "FAIL";
  else if (warnCount > 0) verdict = "WARN";

  return {
    surface: "price_snapshots",
    description:
      "paid/fulfilled order lines must carry unit_price_locked (FAIL if missing); sample-source lines missing cost_snapshot are a WARN (program P&L incomplete). Test orders excluded from the blocking check.",
    displayed_value: failCount,
    truth_value: 0,
    delta: failCount - 0,
    paidfulfilled_lines_checked: lines.filter(
      (l) => orderById.get(l.order_id) && PAID_STATES.has(orderById.get(l.order_id).status),
    ).length,
    missing_price_offenders: offenderSlice(missingPrice),
    missing_price_test_only: offenderSlice(missingPriceTest),
    sample_missing_cost_warns: offenderSlice(sampleMissingCost),
    sample_missing_cost_count: warnCount,
    verdict,
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 4 — conversions_integrity: converted rows must carry proof of the
//   conversion (paid_order_id OR k2k_invoice_ref). Belt+suspenders over the
//   table CHECK constraint.
// ---------------------------------------------------------------------------
async function checkConversionsIntegrity() {
  const queries_used = [
    "SELECT id,outcome,paid_order_id,k2k_invoice_ref FROM order_conversions",
  ];
  const rows = await restSelectAll("order_conversions", {
    select: "id,outcome,paid_order_id,k2k_invoice_ref",
  });
  const offenders = rows
    .filter(
      (r) =>
        r.outcome === "converted" &&
        r.paid_order_id == null &&
        (r.k2k_invoice_ref == null || String(r.k2k_invoice_ref).trim() === ""),
    )
    .map((r) => ({ conversion_id: r.id }));
  const displayed = offenders.length;
  return {
    surface: "conversions_integrity",
    description:
      "order_conversions with outcome='converted' lacking BOTH paid_order_id and k2k_invoice_ref (should be impossible given the CHECK; verified independently here).",
    displayed_value: displayed,
    truth_value: 0,
    delta: displayed - 0,
    conversions_total: rows.length,
    converted_total: rows.filter((r) => r.outcome === "converted").length,
    offenders: offenderSlice(offenders),
    verdict: displayed === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 5 — source_census: honest counts per source + per fulfillment_state.
//   Informational; always PASS.
// ---------------------------------------------------------------------------
async function checkSourceCensus() {
  const queries_used = ["SELECT source,fulfillment_state,is_test FROM orders"];
  const rows = await restSelectAll("orders", {
    select: "source,fulfillment_state,is_test",
  });
  const bySource = {};
  const byState = {};
  for (const r of rows) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    byState[r.fulfillment_state] = (byState[r.fulfillment_state] || 0) + 1;
  }
  return {
    surface: "source_census",
    description:
      "Honest-numbers row: order counts by source and by fulfillment_state (informational, never blocks).",
    displayed_value: rows.length,
    truth_value: rows.length,
    delta: 0,
    orders_total: rows.length,
    non_test_total: rows.filter((r) => !r.is_test).length,
    by_source: bySource,
    by_fulfillment_state: byState,
    verdict: "PASS",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 6 — quarantine_pulse: unresolved confirm_address_quarantine rows.
//   WARN if >0, FAIL if >10 (a pile-up means address matching is broken).
// ---------------------------------------------------------------------------
async function checkQuarantinePulse() {
  const queries_used = [
    "SELECT count(*) FROM confirm_address_quarantine WHERE resolved_at IS NULL",
  ];
  const unresolved = await restCount("confirm_address_quarantine", {
    resolved_at: "is.null",
  });
  let verdict = "PASS";
  if (unresolved > 10) verdict = "FAIL";
  else if (unresolved > 0) verdict = "WARN";
  return {
    surface: "quarantine_pulse",
    description:
      "Unresolved confirm_address_quarantine rows (resolved_at IS NULL). WARN if >0, FAIL if >10 — a pile-up means address matching is broken.",
    displayed_value: unresolved,
    truth_value: 0,
    delta: unresolved - 0,
    verdict,
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// CHECK 7 — lead_master_resolution (Facu-critical, option-B guard):
//   For each DISTINCT non-null lead_master_id on non-test orders, verify it
//   resolves in the lead_master read-channel. Resolution order:
//     (a) BACKUP mirror table (lead_master | lead_master_mirror) if present;
//     (b) else PROD public.lead_master via a READ-ONLY select;
//     (c) else WARN 'read-channel unavailable — resolution unverified'.
//   Never fakes a PASS.
// ---------------------------------------------------------------------------
async function checkLeadMasterResolution() {
  const queries_used = [
    "SELECT DISTINCT lead_master_id FROM orders WHERE is_test=false AND lead_master_id IS NOT NULL",
  ];
  const orders = await restSelectAll("orders", {
    select: "lead_master_id",
    filter: { is_test: "is.false", lead_master_id: "not.is.null" },
  });
  const ids = [...new Set(orders.map((r) => r.lead_master_id).filter((x) => x != null))];

  // Resolve the read-channel.
  let channel = null; // { kind, table, baseUrl, key, idCol }
  if (await restTableExists("lead_master")) {
    channel = { kind: "backup_mirror", table: "lead_master", baseUrl: BACKUP_URL, key: BACKUP_KEY, idCol: "id" };
  } else if (await restTableExists("lead_master_mirror")) {
    channel = { kind: "backup_mirror", table: "lead_master_mirror", baseUrl: BACKUP_URL, key: BACKUP_KEY, idCol: "id" };
  } else if (PROD_URL && PROD_KEY) {
    channel = { kind: "prod_readonly", table: "lead_master", baseUrl: PROD_URL, key: PROD_KEY, idCol: "id" };
  }

  if (!channel) {
    return {
      surface: "lead_master_resolution",
      description:
        "Each DISTINCT non-null lead_master_id on non-test orders must resolve in the lead_master read-channel.",
      displayed_value: ids.length,
      truth_value: null,
      delta: null,
      distinct_lead_master_ids: ids.length,
      read_channel: "unavailable",
      verdict: "WARN",
      note: "read-channel unavailable — resolution unverified",
      queries_used,
    };
  }

  queries_used.push(
    `[${channel.kind}] SELECT ${channel.idCol} FROM ${channel.table} WHERE ${channel.idCol}=in.(...) (READ-ONLY)`,
  );

  // If there are no ids to resolve, the channel is available and resolution is
  // trivially complete — PASS (vacuously), with channel noted.
  let unresolved = [];
  if (ids.length > 0) {
    // Resolve in chunks via the PostgREST in.() filter to bound URL length.
    const found = new Set();
    const CHUNK = 200;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const rows = await restSelectAll(channel.table, {
        select: channel.idCol,
        filter: { [channel.idCol]: `in.(${chunk.join(",")})` },
        baseUrl: channel.baseUrl,
        key: channel.key,
      });
      for (const r of rows) found.add(r[channel.idCol]);
    }
    unresolved = ids.filter((id) => !found.has(id));
  }

  const displayed = unresolved.length;
  return {
    surface: "lead_master_resolution",
    description:
      "Each DISTINCT non-null lead_master_id on non-test orders must resolve in the lead_master read-channel (Facu-critical option-B guard).",
    displayed_value: displayed,
    truth_value: 0,
    delta: displayed - 0,
    distinct_lead_master_ids: ids.length,
    read_channel: `${channel.kind}:${channel.table}`,
    unresolved_ids: offenderSlice(unresolved),
    verdict: displayed === 0 ? "PASS" : "FAIL",
    queries_used,
  };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main() {
  // ---------------------------------------------------------------------------
  // RLS-visibility guard. The orders spine is RLS-protected; an anon key reads
  // it as empty. Running the checks anyway would print a green PASS against an
  // invisible spine (a fake PASS). If we don't hold a service key AND the spine
  // reads as empty, abort with exit 2 — "read surface blocked", never PASS.
  // (A service key that legitimately sees an empty spine is fine: that's a
  //  truthful PASS on a pre-launch, zero-real-orders state.)
  // ---------------------------------------------------------------------------
  if (!BACKUP_KEY_IS_SERVICE) {
    let ordersVisible = 0;
    try {
      ordersVisible = await restCount("orders");
    } catch {
      ordersVisible = 0;
    }
    if (ordersVisible === 0) {
      console.error(
        "\n!! READ SURFACE BLOCKED — orders spine reads as 0 rows under the anon key.",
      );
      console.error(
        "   The orders/order_lines/lead_master tables are RLS-protected; the anon",
      );
      console.error(
        "   key cannot see them, so every check would report a fake PASS.",
      );
      console.error(
        "   Provide BACKUP_SUPABASE_SERVICE_KEY (service_role) and re-run.",
      );
      console.error(
        "   Refusing to emit PASS against an invisible spine.\n",
      );
      process.exit(2);
    }
  }

  const checks = [];
  checks.push(await checkIdentityBornWith());
  checks.push(await checkLogCompleteness());
  checks.push(await checkPriceSnapshots());
  checks.push(await checkConversionsIntegrity());
  checks.push(await checkSourceCensus());
  checks.push(await checkQuarantinePulse());
  checks.push(await checkLeadMasterResolution());

  const anyFail = checks.some((c) => c.verdict === "FAIL");
  const anyWarn = checks.some((c) => c.verdict === "WARN");
  const today = new Date().toISOString().slice(0, 10);

  const report = {
    generated_at: new Date().toISOString(),
    project: BACKUP_PROJECT_ID,
    spine: "orders",
    overall_verdict: anyFail ? "FAIL" : anyWarn ? "WARN" : "PASS",
    checks,
  };

  // Write JSON report.
  const stateDir = join(REPO_ROOT, "state");
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const outPath = join(stateDir, `orders_spine_verify_${today}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  // Human-readable summary.
  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n=== Orders-Spine Verifier (Pipeline Law: verifier-before-consumer) ===");
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
    if (c.surface === "log_completeness") {
      for (const o of c.missing_log_offenders)
        console.log(`    missing-log: order ${o.order_id} (state ${o.fulfillment_state})`);
      for (const o of c.state_mismatch_offenders)
        console.log(
          `    state-mismatch: order ${o.order_id} order=${o.order_fulfillment_state} latest_log=${o.latest_log_to_state}`,
        );
    }
    if (c.surface === "price_snapshots") {
      for (const o of c.missing_price_offenders)
        console.log(`    missing price: line ${o.line_id} (order ${o.order_id}, ${o.status})`);
      if (c.sample_missing_cost_count > 0)
        console.log(`    WARN sample missing cost_snapshot: ${c.sample_missing_cost_count} line(s)`);
    }
    if (c.surface === "source_census") {
      console.log(`    by source:           ${JSON.stringify(c.by_source)}`);
      console.log(`    by fulfillment_state: ${JSON.stringify(c.by_fulfillment_state)}`);
      console.log(`    (non-test: ${c.non_test_total} / ${c.orders_total})`);
    }
    if (c.surface === "lead_master_resolution") {
      console.log(`    read-channel: ${c.read_channel}   distinct ids: ${c.distinct_lead_master_ids}`);
      if (c.note) console.log(`    note: ${c.note}`);
      if (c.unresolved_ids && c.unresolved_ids.length)
        console.log(`    unresolved ids (sample): ${c.unresolved_ids.join(", ")}`);
    }
  }
  console.log("-".repeat(74));
  console.log(`OVERALL: ${report.overall_verdict}\n`);

  process.exit(anyFail ? 1 : 0);
}

main().catch((err) => {
  console.error("verify_orders_spine FAILED to run:", err);
  process.exit(2);
});
