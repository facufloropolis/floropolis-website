#!/usr/bin/env node
/**
 * extend_chrome_mf_flodecol.mjs — chrome matcher for Magic Flowers + Flodecol.
 *
 * WHY THIS EXISTS
 * ---------------
 * shared/scripts/s2_build_product_chrome.py matched the PROD scrape → dim_sku
 * for Ecoroses + Megaflor (558 product_chrome rows) but matched ZERO rows for
 * Magic Flowers and Flodecol. Their dim_sku SKUs are facu-cost-approved and
 * unpublishable SOLELY because they carry no chrome (images/slug/display_name).
 * This job builds the missing product_chrome rows for those two vendors from
 * the BACKUP `floropolis_inventory_mirror` (which holds their images).
 *
 * The match was breaking for two structural reasons we VERIFIED in BACKUP:
 *
 *   1. SIZE ENCODING (Flodecol gypsophila). dim_sku keys gypsophila by
 *      `size_grams` (numeric 250/750/1000) and leaves `size_cm` NULL. The mirror
 *      encodes that weight as a STRING SUFFIX inside `length`: "1000g","750g",
 *      "250g" (the dedicated `unit_weight_g` column is NULL for every row). So
 *      grams must be parsed out of the mirror `length` text, not read from a
 *      numeric column. Flodecol delphinium, by contrast, keys by cm ("60 cm").
 *      NOTE: only Flodecol *gypsophila* (39 SKUs) is ACTIVE in dim_sku today —
 *      the delphinium mirror rows have no active dim_sku, so they fall out as
 *      unmatched_mirror (expected, not a bug).
 *
 *   2. VARIETY FORMAT (Magic Flowers). dim_sku.variety_normalized folds the
 *      category + descriptor into one lowercased string:
 *        "anthurium assorted large", "heliconia sassy", "combo box capricho",
 *        "ginger nicole", "musa coccinea", "bouquet greens round afforest".
 *      The mirror splits the SAME product across name/variety/color/category and
 *      strips the category word ("Sassy", "Combo Box Capricho", "Ginger Nicole").
 *      So neither variety field matches verbatim. We compare TOKEN SETS built per
 *      vendor: the dim side from variety_normalized (+color), the mirror side from
 *      variety+color+the leaf of its category — both reduced to a sorted set of
 *      significant tokens with stopwords (assorted/farm/choice/cm/box paren-notes)
 *      removed, then required to be equal (exact) or subset/superset (fuzzy).
 *
 * SCOPE / SAFETY
 * --------------
 *   - BACKUP only. Reads mirror + dim_sku + product_chrome; the only WRITE is
 *     INSERT into product_chrome, and ONLY under --live.
 *   - DRY-RUN is the default. It writes the full match table to state/ and prints
 *     a summary. It performs NO database writes.
 *   - --live inserts product_chrome ONLY for exact+fuzzy matches whose sku_id is
 *     not already in product_chrome. It NEVER updates an existing chrome row and
 *     NEVER writes ambiguous/unmatched pairings. Job_PM runs --live, not the
 *     author of this script.
 *
 * Usage:
 *   node scripts/jobs/extend_chrome_mf_flodecol.mjs            # dry-run (default)
 *   node scripts/jobs/extend_chrome_mf_flodecol.mjs --live     # Job_PM only
 *   node scripts/jobs/extend_chrome_mf_flodecol.mjs --fixture <path.json>
 *
 * Output (always): state/chrome_match_mf_flodecol_2026-06-04.json
 *
 * Env/client conventions copied from scripts/generate-products.mjs (BACKUP creds
 * from .env.local; process.env wins). NO PROD vars are read.
 *
 * KEY OPERATIONAL NOTE (discovered 2026-06-04): `floropolis_inventory_mirror`
 * has RLS ENABLED with ZERO policies, so it is INVISIBLE to the anon key that is
 * the only BACKUP credential currently in .env.local. dim_sku + product_chrome
 * have RLS disabled and read fine. Therefore, to read the mirror over PostgREST
 * this script needs a privileged key in .env.local as BACKUP_SUPABASE_SERVICE_KEY
 * (service_role bypasses RLS) — which the env loader already prefers over the
 * anon key. The --fixture flag is an escape hatch for offline verification: it
 * loads mirror/dim_sku/product_chrome rows from a local JSON snapshot (shape:
 * { mirror:[...], dim_sku:[...], product_chrome:[...] }) so the matcher can be
 * exercised without DB credentials. --fixture never writes to the DB even with
 * --live (it forces dry-run), since the snapshot may be stale.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const VENDORS = ["Magic Flowers", "Flodecol"];
const MATCHED_BY = "vendor_ext_mf_flodecol_20260604";
const OUT_PATH = resolve(REPO_ROOT, "state/chrome_match_mf_flodecol_2026-06-04.json");

const argv = process.argv;
const fixtureIdx = argv.indexOf("--fixture");
const FIXTURE = fixtureIdx >= 0 ? argv[fixtureIdx + 1] : null;
// --fixture forces dry-run (offline snapshot may be stale; never write from it).
const LIVE = argv.includes("--live") && !FIXTURE;

// ---------------------------------------------------------------------------
// Env — BACKUP credentials only (same loader as generate-products.mjs).
// ---------------------------------------------------------------------------
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
const ENV = { ...env, ...process.env };
const BACKUP_URL = ENV.BACKUP_SUPABASE_URL || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_URL;
const BACKUP_KEY =
  ENV.BACKUP_SUPABASE_SERVICE_KEY || ENV.NEXT_PUBLIC_BACKUP_SUPABASE_ANON_KEY;

if (!FIXTURE && (!BACKUP_URL || !BACKUP_KEY)) {
  console.error("\n!! MISSING BACKUP_SUPABASE_* env — cannot read mirror/dim_sku.");
  console.error("   Need BACKUP_SUPABASE_URL + BACKUP_SUPABASE_SERVICE_KEY (or NEXT_PUBLIC_* fallback).");
  console.error("   (mirror has RLS-on/0-policies → anon key cannot read it; use the service key.)");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Paginated PostgREST GET against BACKUP.
// ---------------------------------------------------------------------------
async function fetchAllRest(table, params = {}) {
  const out = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const usp = new URLSearchParams({ ...params, offset: String(offset), limit: String(limit) });
    const res = await fetch(`${BACKUP_URL}/rest/v1/${table}?${usp}`, {
      headers: { apikey: BACKUP_KEY, Authorization: `Bearer ${BACKUP_KEY}`, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Supabase REST ${table} ${res.status}: ${await res.text()}`);
    const data = await res.json();
    out.push(...data);
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function insertRest(table, rows) {
  const res = await fetch(`${BACKUP_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: BACKUP_KEY,
      Authorization: `Bearer ${BACKUP_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`INSERT ${table} ${res.status}: ${await res.text()}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Normalization helpers.
// ---------------------------------------------------------------------------
function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Lowercase, drop diacritics, drop parenthetical notes, replace punctuation with
// spaces, collapse whitespace. Used as the base for token sets and slugs.
function normText(s) {
  return stripDiacritics(String(s || "").toLowerCase())
    .replace(/\([^)]*\)/g, " ") // drop "(10-12cm)", "(farm choice)", "(21-26 stems)"
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Tokens that carry no identity for matching: category words (re-added per side
// deliberately, so excluded from the discriminating set), generic descriptors,
// units, and color-adjacent fillers. Kept tight to avoid over-merging.
// Pure noise: words that carry no product identity on either side. Dropped from
// BOTH variety-core and color before any comparison.
const STOP = new Set([
  "farm", "choice", "with", "or", "without", "leaves",
  "cm", "g", "stems", "stem", "the", "fix", "recipe", "novelty", "tropicals",
  "tropical", "mixes", "variety", "collection", "bouquet", "bouquets", "box",
  "boxes",
  // CATEGORY words — these appear as the dim variety_normalized PREFIX
  // ("gypsophila tinted blue", "heliconia sassy") but only INCONSISTENTLY on the
  // mirror variety side (mirror "Tinted Blue 250g" has no "gypsophila"; mirror
  // "Heliconia Sassy Red" does). Stopping them removes the asymmetry while the
  // discriminating leaf token (sassy/iris/rostrata, tinted/cosmic/xlence) plus
  // the color gate keep distinct SKUs apart.
  "gypsophila", "heliconia", "anthurium", "delphinium", "anemone",
  // "greens"/"foliage" are a category descriptor on the dim side
  // ("bouquet greens round afforest") but appear as the COLOR "Green" on the
  // mirror side ("Round Afforest" / color=Green). Stop them so the leaf variety
  // (afforest/emerald/forest/paradise) drives the match and the color gate uses
  // the real Green color.
  "greens", "foliage",
]);
// NOTE: category-folder words (bouquet(s)/box(es)/tropical(s)/mixes/the above) are
// stopped because they appear inconsistently across the two sides; the leaf token
// survives. "mini"/"plus"/"mix"/"foliage"/"ginger"/"combo" are KEPT — they are
// real SKU distinctions ("mini fiesta"≠"fiesta", "ginger plus"≠"ginger nicole",
// "combo foliage"≠"combo box"). "ginger"/"combo" are discriminating on BOTH sides
// so they stay.

// Color vocabulary. Color is a HARD discriminator: a match requires color
// compatibility. "mixed"/"assorted" act as wildcards (match any color), because
// the two sides label generic boxes inconsistently (dim "mixed" vs mirror
// "assorted"/specific). Multi-word colors are captured as a set of color tokens.
const COLOR_WORDS = new Set([
  "white", "red", "pink", "blue", "green", "yellow", "orange", "peach", "purple",
  "lavender", "brown", "mocca", "rainbow", "fuchsia", "cream", "beige", "bicolor",
  "hot", "light", "dark", "two", "color", "magenta", "viva", "apple", "silver",
]);
const WILDCARD_COLORS = new Set(["mixed", "assorted"]);
// Tokens fuzzy is allowed to differ on (size/grade/qualifier descriptors that the
// two sides record inconsistently). Anything OUTSIDE this set that differs blocks
// a fuzzy match — so a distinct variety word (nicole vs plus) can never be dropped.
const FUZZY_DROPPABLE = new Set([
  "large", "xlarge", "small", "medium", "mini", "petite", "plus", "king",
]);

// Split a free-text label into { core:Set, colors:Set, wildcard:bool }.
//   core  = identity tokens minus STOP minus colors.
//   colors= the color tokens present (multi-word colors -> multiple tokens).
//   wildcard = true if "mixed"/"assorted" present (color gate becomes permissive).
function tokenize(...parts) {
  const toks = normText(parts.filter(Boolean).join(" ")).split(" ").filter(Boolean);
  const core = new Set();
  const colors = new Set();
  let wildcard = false;
  for (const t of toks) {
    if (STOP.has(t)) continue;
    if (WILDCARD_COLORS.has(t)) { wildcard = true; continue; }
    if (COLOR_WORDS.has(t)) { colors.add(t); continue; }
    core.add(t);
  }
  return { core, colors, wildcard };
}

// Back-compat alias for the old token-set (core only) where size logic needs it.
function tokenSet(...parts) {
  return tokenize(...parts).core;
}

function setEq(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
function jaccard(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

// Parse grams out of mirror `length` text ("1000g","750g","250 g"). Returns int
// or null.
function parseGrams(lengthText) {
  const m = String(lengthText || "").match(/(\d+)\s*g\b/i);
  return m ? parseInt(m[1], 10) : null;
}
// Parse a cm value out of mirror `length` ("60 cm","60-70 cm","57 cm"). Returns
// the FIRST integer when there is no explicit grams suffix. Used for cm-keyed
// varieties (delphinium / stem tropicals).
function parseCm(lengthText) {
  if (/\bg\b/i.test(String(lengthText || ""))) return null; // it's a grams string
  const m = String(lengthText || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// Slug generation — mirror the existing product_chrome convention.
//   cm-keyed:    "{variety-words}-{color}-{N}-cm"   (e.g. razzmatazz-orange-60-cm)
//   grams-keyed: "{variety-words}-{color}-{N}g"     (e.g. cosmic-white-1000g —
//                matches the mirror's own slug style; no cm slug exists for these)
//   sizeless:    "{variety-words}-{color}"          (combos / mixed boxes)
// variety-words: the dim variety_normalized WITH the leading category word
// stripped (so "heliconia sassy" -> "sassy", "combo box capricho" -> kept whole
// minus nothing structural) and color de-duplicated.
// ---------------------------------------------------------------------------
function slugify(s) {
  return normText(s).replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}

function buildSlug(dim, mirror) {
  const variety = normText(dim.variety_normalized);
  const color = normText(dim.color_normalized);
  // Avoid doubling color if variety already ends with it.
  const base = variety.endsWith(` ${color}`) || variety === color
    ? variety
    : `${variety} ${color}`;
  const grams = dim.size_grams != null ? Number(dim.size_grams) : null;
  if (grams != null) return `${slugify(base)}-${grams}g`;
  const cm = dim.size_cm != null ? Number(dim.size_cm) : null;
  if (cm != null) return `${slugify(base)}-${cm}-cm`;
  return slugify(base);
}

function buildDisplayName(dim) {
  // Title-case the normalized variety, append color (if not already trailing)
  // and size. Mirrors the "Razzmatazz Orange 60 cm" / "Cosmic White 1000g" style.
  const tc = (s) =>
    String(s || "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const variety = normText(dim.variety_normalized);
  const color = normText(dim.color_normalized);
  let name = tc(variety);
  if (color && !variety.endsWith(` ${color}`) && variety !== color) {
    name += ` ${tc(color)}`;
  }
  if (dim.size_grams != null) name += ` ${Number(dim.size_grams)}g`;
  else if (dim.size_cm != null) name += ` ${Number(dim.size_cm)} cm`;
  return name.trim();
}

function unitLabel(dim) {
  const u = String(dim.selling_unit || "").toLowerCase();
  if (u === "stem") return "Stem";
  if (u === "bunch") return "Bunch";
  if (u === "box") return "Box";
  return "Stem";
}

// ---------------------------------------------------------------------------
// Build the comparable representation for a mirror row, per vendor quirks.
// ---------------------------------------------------------------------------
function mirrorRepr(m, vendor) {
  const grams = parseGrams(m.length);
  const cm = parseCm(m.length);
  // Variety + color drive identity. The mirror keeps variety and color in
  // separate columns; we tokenize both. Category words are STOP-listed so the
  // mirror's "Bouquets"/"Mixed Boxes" folder noise doesn't pollute the core.
  // (We deliberately do NOT fold `name` in: for many rows it re-introduces size
  // tokens like "250g" or duplicated category words that break the core compare.
  // The cost is that MF anthurium large/xlarge — whose grade lives only in `name`
  // — fall to repair items, which is the safe outcome since dim "assorted large"
  // cannot be disambiguated against mirror Large-Assorted vs Large-Red anyway.)
  const t = tokenize(m.variety, m.color);
  return {
    id: m.id,
    name: m.name,
    variety: m.variety,
    color: m.color,
    category: m.category,
    grams,
    cm,
    img_n: Array.isArray(m.images) ? m.images.length : 0,
    images: Array.isArray(m.images) ? m.images : [],
    has_description: m.contents_note != null && String(m.contents_note).trim() !== "",
    description: m.contents_note ?? null,
    core: t.core,
    colors: t.colors,
    wildcard: t.wildcard,
  };
}

// Build the comparable representation for a dim_sku row.
function dimRepr(d) {
  // dim variety_normalized embeds the category word for MF ("heliconia sassy")
  // and "gypsophila <variety>" for Flodecol; color is a separate column. The
  // STOP list strips folder words; COLOR_WORDS split out the color tokens.
  const t = tokenize(d.variety_normalized, d.color_normalized);
  return {
    sku_id: d.sku_id,
    variety_normalized: d.variety_normalized,
    color_normalized: d.color_normalized,
    size_cm: d.size_cm != null ? Number(d.size_cm) : null,
    size_grams: d.size_grams != null ? Number(d.size_grams) : null,
    box_type: d.box_type,
    selling_unit: d.selling_unit,
    pack: d.pack,
    tier: d.tier,
    category: d.category,
    core: t.core,
    colors: t.colors,
    wildcard: t.wildcard,
  };
}

// Color compatibility gate. Compatible when either side is a wildcard
// (mixed/assorted), OR the color token sets are equal. A non-empty asymmetric
// difference (e.g. dim {light,pink} vs mirror {pink}) is INCOMPATIBLE — this is
// what stops "tinted light pink" stealing the "Tinted Pink" image.
function colorsCompatible(dim, mr) {
  if (dim.wildcard || mr.wildcard) return true;
  if (dim.colors.size === 0 || mr.colors.size === 0) return true; // one side has no color signal
  return setEq(dim.colors, mr.colors);
}

// ---------------------------------------------------------------------------
// Size agreement between a dim row and a mirror candidate.
//   - grams-keyed dim: require mirror grams == dim grams.
//   - cm-keyed dim:    require mirror cm == dim cm when BOTH present; if the
//                      mirror carries no size (sizeless combo/box), size is not a
//                      discriminator and we return "compatible".
// Returns 'exact' | 'compatible' | 'mismatch'.
// ---------------------------------------------------------------------------
function sizeAgreement(dim, mr) {
  if (dim.size_grams != null) {
    if (mr.grams == null) return "compatible"; // mirror size absent -> not disambiguating
    return mr.grams === dim.size_grams ? "exact" : "mismatch";
  }
  if (dim.size_cm != null) {
    if (mr.cm == null) return "compatible";
    return mr.cm === dim.size_cm ? "exact" : "mismatch";
  }
  return "compatible"; // dim sizeless (combos) -> size never disambiguates
}

// ---------------------------------------------------------------------------
// Core match: for each dim_sku, find candidate mirror rows (same vendor) and
// classify. Multiple mirror rows can share a (variety,size) — we keep the one
// with the most images, but if two distinct token-equal candidates disagree we
// mark ambiguous.
// ---------------------------------------------------------------------------
function classifyDim(dim, mirrors) {
  // Hard pre-gates applied to EVERY candidate: color must be compatible and size
  // must not explicitly mismatch. These two gates are what keep colors/sizes from
  // bleeding across SKUs.
  const gated = mirrors.filter(
    (mr) => colorsCompatible(dim, mr) && sizeAgreement(dim, mr) !== "mismatch",
  );
  if (gated.length === 0) {
    return { match_class: "unmatched_dim_sku", reason: "no color/size-compatible mirror row", mirror: null };
  }

  // Helper: the symmetric difference of two core sets (identity tokens only).
  const coreDiff = (mr) => {
    const dimOnly = [...dim.core].filter((t) => !mr.core.has(t));
    const mrOnly = [...mr.core].filter((t) => !dim.core.has(t));
    return { dimOnly, mrOnly };
  };

  // --- Stage 1: EXACT — identical core token set (color already gated). ---
  const exactCands = gated.filter((mr) => setEq(dim.core, mr.core));
  if (exactCands.length >= 1) {
    const ranked = [...exactCands].sort((a, b) => {
      const sa = sizeAgreement(dim, a) === "exact" ? 1 : 0;
      const sb = sizeAgreement(dim, b) === "exact" ? 1 : 0;
      if (sb !== sa) return sb - sa;
      return b.img_n - a.img_n;
    });
    const top = ranked[0];
    // Ambiguous only if a peer at the same size-rank has images AND a DIFFERENT
    // first image (distinct product). Same-image duplicates (one product split
    // across box types) are not ambiguous — we take the richest.
    const peers = ranked.filter(
      (r) =>
        r !== top &&
        (sizeAgreement(dim, r) === "exact") === (sizeAgreement(dim, top) === "exact") &&
        r.img_n > 0 &&
        (r.images[0] || "") !== (top.images[0] || ""),
    );
    if (peers.length > 0) {
      return {
        match_class: "ambiguous",
        reason: `core-equal multiple with distinct images: ids [${[top, ...peers].map((p) => p.id).join(", ")}]`,
        candidates: [top, ...peers].map((p) => p.id),
        mirror: null,
      };
    }
    return {
      match_class: "exact",
      reason:
        sizeAgreement(dim, top) === "exact"
          ? `core+color equal, size match (${dim.size_grams != null ? top.grams + "g" : top.cm + "cm"})`
          : `core+color equal, mirror size absent (not disambiguating)`,
      mirror: top,
    };
  }

  // --- Stage 2: FUZZY — core differs ONLY by FUZZY_DROPPABLE descriptor tokens
  // (large/xlarge/mini/plus/...). Any other core difference disqualifies, so a
  // distinct variety word (nicole vs plus, mix-box vs plus) can never be dropped.
  const fuzzyCands = gated
    .map((mr) => ({ mr, d: coreDiff(mr) }))
    .filter(({ mr, d }) => {
      const allDeltas = [...d.dimOnly, ...d.mrOnly];
      if (allDeltas.length === 0) return false; // handled by exact
      // every differing token must be a droppable descriptor
      if (!allDeltas.every((t) => FUZZY_DROPPABLE.has(t))) return false;
      // require a non-trivial shared core (avoid matching on descriptors alone)
      const shared = [...dim.core].filter((t) => mr.core.has(t)).length;
      return shared >= 1;
    })
    .map(({ mr, d }) => ({ mr, d, j: jaccard(dim.core, mr.core) }))
    .sort((a, b) => b.j - a.j || b.mr.img_n - a.mr.img_n);

  if (fuzzyCands.length >= 1) {
    const best = fuzzyCands[0];
    const tie = fuzzyCands.filter(
      (c) =>
        c !== best &&
        Math.abs(c.j - best.j) < 1e-9 &&
        c.mr.img_n > 0 &&
        (c.mr.images[0] || "") !== (best.mr.images[0] || ""),
    );
    if (tie.length > 0) {
      return {
        match_class: "ambiguous",
        reason: `fuzzy tie jaccard=${best.j.toFixed(2)}: ids [${[best, ...tie].map((c) => c.mr.id).join(", ")}]`,
        candidates: [best, ...tie].map((c) => c.mr.id),
        mirror: null,
      };
    }
    return {
      match_class: "fuzzy",
      reason: `descriptor-only delta; jaccard=${best.j.toFixed(2)}; dim-only[${best.d.dimOnly.join(",")}] mirror-only[${best.d.mrOnly.join(",")}]`,
      mirror: best.mr,
    };
  }

  return { match_class: "unmatched_dim_sku", reason: "color/size-compatible mirror exists but core variety tokens differ beyond descriptors", mirror: null };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`=== EXTEND CHROME — Magic Flowers + Flodecol (${LIVE ? "LIVE" : "DRY-RUN"}) ===`);

  const vendorList = VENDORS.map((v) => `"${v}"`).join(",");

  let mirrorRows, dimRows, existingChrome;
  if (FIXTURE) {
    console.log(`  FIXTURE mode: loading rows from ${FIXTURE} (forced dry-run)`);
    const fx = JSON.parse(readFileSync(resolve(REPO_ROOT, FIXTURE), "utf-8"));
    mirrorRows = (fx.mirror || []).filter((m) => VENDORS.includes(m.vendor));
    dimRows = (fx.dim_sku || []).filter((d) => VENDORS.includes(d.vendor_canonical_name));
    existingChrome = fx.product_chrome || [];
  } else {
    mirrorRows = await fetchAllRest("floropolis_inventory_mirror", {
      select: "id,name,variety,color,length,category,images,contents_note,vendor",
      vendor: `in.(${vendorList})`,
    });
    dimRows = await fetchAllRest("dim_sku", {
      select:
        "sku_id,vendor_canonical_name,variety_normalized,color_normalized,size_cm,size_grams,box_type,selling_unit,pack,stems_per_unit,tier,category,quarantined",
      vendor_canonical_name: `in.(${vendorList})`,
    });
    existingChrome = await fetchAllRest("product_chrome", { select: "sku_id,slug" });
  }
  const chromeSkuSet = new Set(existingChrome.map((r) => r.sku_id));
  const chromeSlugSet = new Set(existingChrome.map((r) => r.slug));

  console.log(`  mirror rows: ${mirrorRows.length} | dim_sku rows: ${dimRows.length} | existing chrome: ${existingChrome.length}`);

  const results = [];
  const inserts = [];
  const newSlugsThisRun = new Set();

  for (const vendor of VENDORS) {
    const mDim = dimRows.filter(
      (d) => d.vendor_canonical_name === vendor && d.quarantined !== true,
    ).map(dimRepr);
    const mMir = mirrorRows.filter((m) => m.vendor === vendor).map((m) => mirrorRepr(m, vendor));

    // --- Mirror format report (printed once per vendor) ---
    const gramsRows = mMir.filter((m) => m.grams != null);
    const cmRows = mMir.filter((m) => m.cm != null);
    const sizelessRows = mMir.filter((m) => m.grams == null && m.cm == null);
    console.log(`\n--- ${vendor} mirror format ---`);
    console.log(`  rows: ${mMir.length} | grams-encoded(length): ${gramsRows.length} | cm-encoded: ${cmRows.length} | sizeless: ${sizelessRows.length}`);
    const gramsSamples = [...new Set(gramsRows.map((m) => `"${mirrorRowLength(mirrorRows, m.id)}"->${m.grams}g`))].slice(0, 6);
    if (gramsSamples.length) console.log(`  grams samples (length text -> parsed): ${gramsSamples.join(", ")}`);
    const dimGrams = mDim.filter((d) => d.size_grams != null).length;
    const dimCm = mDim.filter((d) => d.size_cm != null).length;
    const dimSizeless = mDim.filter((d) => d.size_grams == null && d.size_cm == null).length;
    console.log(`  dim_sku(active): ${mDim.length} | grams-keyed: ${dimGrams} | cm-keyed: ${dimCm} | sizeless: ${dimSizeless}`);

    // --- Match each dim row ---
    const matchedMirrorIds = new Set();
    for (const dim of mDim) {
      const cls = classifyDim(dim, mMir);
      const rec = {
        vendor,
        sku_id: dim.sku_id,
        dim_variety: dim.variety_normalized,
        dim_color: dim.color_normalized,
        dim_size: dim.size_grams != null ? `${dim.size_grams}g` : dim.size_cm != null ? `${dim.size_cm}cm` : "—",
        dim_box_type: dim.box_type,
        match_class: cls.match_class,
        reason: cls.reason,
        mirror_id: cls.mirror ? cls.mirror.id : null,
        mirror_name: cls.mirror ? cls.mirror.name : null,
        image_count: cls.mirror ? cls.mirror.img_n : 0,
        has_description: cls.mirror ? cls.mirror.has_description : false,
        candidates: cls.candidates || null,
        already_in_chrome: chromeSkuSet.has(dim.sku_id),
      };
      results.push(rec);
      if (cls.mirror) matchedMirrorIds.add(cls.mirror.id);

      // Stage an insert for exact+fuzzy, not already in chrome, with >=1 image.
      if ((cls.match_class === "exact" || cls.match_class === "fuzzy") && !chromeSkuSet.has(dim.sku_id)) {
        if (cls.mirror.img_n < 1) {
          rec.skip_reason = "matched mirror has 0 images";
          continue;
        }
        let slug = buildSlug(dim, cls.mirror);
        // Guarantee slug uniqueness against existing chrome + this run.
        let finalSlug = slug;
        let n = 2;
        while (chromeSlugSet.has(finalSlug) || newSlugsThisRun.has(finalSlug)) {
          finalSlug = `${slug}-${n++}`;
        }
        newSlugsThisRun.add(finalSlug);
        rec.planned_slug = finalSlug;
        rec.planned_display_name = buildDisplayName(dim);
        inserts.push({
          sku_id: dim.sku_id,
          fi_id: cls.mirror.id,
          display_name: rec.planned_display_name,
          slug: finalSlug,
          images: cls.mirror.images,
          description: cls.mirror.description,
          unit_label: unitLabel(dim),
          matched_by: MATCHED_BY,
        });
      }
    }

    // --- Unmatched mirror rows (no dim row claimed them) ---
    for (const mr of mMir) {
      if (!matchedMirrorIds.has(mr.id)) {
        results.push({
          vendor,
          sku_id: null,
          dim_variety: null,
          mirror_id: mr.id,
          mirror_name: mr.name,
          mirror_category: mr.category,
          image_count: mr.img_n,
          match_class: "unmatched_mirror",
          reason: "mirror row matched by no active dim_sku",
        });
      }
    }
  }

  // ---- Summary counts ----
  const classes = ["exact", "fuzzy", "ambiguous", "unmatched_dim_sku", "unmatched_mirror"];
  const summary = {};
  for (const c of classes) summary[c] = results.filter((r) => r.match_class === c).length;
  const perVendor = {};
  for (const vendor of VENDORS) {
    perVendor[vendor] = {};
    for (const c of classes) perVendor[vendor][c] = results.filter((r) => r.vendor === vendor && r.match_class === c).length;
  }

  const expectedInserts = inserts.length;
  // Newly-publishable = dim SKUs that gain chrome this run (were missing it).
  const newlyPublishable = inserts.length;

  console.log(`\n=== MATCH SUMMARY (per class) ===`);
  for (const c of classes) console.log(`  ${c.padEnd(20)} ${summary[c]}`);
  console.log(`\n  per vendor:`);
  for (const vendor of VENDORS) {
    console.log(`    ${vendor}: ${classes.map((c) => `${c}=${perVendor[vendor][c]}`).join("  ")}`);
  }
  console.log(`\n  expected chrome inserts (exact+fuzzy, not already in chrome, >=1 img): ${expectedInserts}`);
  console.log(`  expected newly-publishable SKUs: ${newlyPublishable}`);

  // ---- Full match table (print exact+fuzzy and repair items) ----
  console.log(`\n=== MATCH TABLE (exact/fuzzy → planned chrome) ===`);
  for (const r of results.filter((x) => x.match_class === "exact" || x.match_class === "fuzzy")) {
    console.log(
      `  [${r.match_class}] ${r.vendor} | ${r.dim_variety} (${r.dim_size}) -> mirror#${r.mirror_id} "${r.mirror_name}" img=${r.image_count} | slug=${r.planned_slug || "(skipped: " + (r.skip_reason || "already in chrome") + ")"} | ${r.reason}`,
    );
  }
  console.log(`\n=== REPAIR ITEMS (ambiguous / unmatched — never written) ===`);
  for (const r of results.filter((x) => ["ambiguous", "unmatched_dim_sku", "unmatched_mirror"].includes(x.match_class))) {
    if (r.match_class === "unmatched_mirror") {
      console.log(`  [unmatched_mirror] ${r.vendor} | mirror#${r.mirror_id} "${r.mirror_name}" (${r.mirror_category}) img=${r.image_count}`);
    } else {
      console.log(`  [${r.match_class}] ${r.vendor} | ${r.dim_variety} (${r.dim_size}) | ${r.reason}`);
    }
  }

  // ---- Write state file (always) ----
  const stateDir = dirname(OUT_PATH);
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    mode: LIVE ? "live" : "dry-run",
    matched_by: MATCHED_BY,
    summary,
    per_vendor: perVendor,
    expected_chrome_inserts: expectedInserts,
    expected_newly_publishable: newlyPublishable,
    planned_inserts: inserts,
    results,
  };
  writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`\n  match table written to: ${OUT_PATH}`);

  // ---- LIVE insert ----
  if (LIVE) {
    if (inserts.length === 0) {
      console.log(`\n  LIVE: nothing to insert.`);
    } else {
      console.log(`\n  LIVE: inserting ${inserts.length} product_chrome rows (exact+fuzzy only)...`);
      // Re-check chrome membership at write time to avoid racing a prior run.
      const fresh = await fetchAllRest("product_chrome", { select: "sku_id" });
      const freshSet = new Set(fresh.map((r) => r.sku_id));
      const toInsert = inserts.filter((r) => !freshSet.has(r.sku_id));
      const skipped = inserts.length - toInsert.length;
      if (skipped > 0) console.log(`  (skipping ${skipped} sku_id(s) that appeared in chrome since dry-run)`);
      if (toInsert.length > 0) {
        const written = await insertRest("product_chrome", toInsert);
        console.log(`  LIVE: inserted ${written.length} rows.`);
      } else {
        console.log(`  LIVE: all candidates already present; inserted 0.`);
      }
    }
  } else {
    console.log(`\n  DRY-RUN: no database writes performed. Re-run with --live (Job_PM) to insert.`);
  }

  console.log(`\n=== DONE ===`);
}

// Helper to recover the original mirror length text for the format report.
function mirrorRowLength(mirrorRows, id) {
  const r = mirrorRows.find((x) => x.id === id);
  return r ? r.length : "";
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
