#!/usr/bin/env node
/**
 * extend_chrome_megaflor.mjs — chrome matcher for MEGAFLOR, on the color-aware spine.
 *
 * WHY THIS EXISTS
 * ---------------
 * Megaflor was recovered: ~80 ACTIVE dim_sku SKUs (delphinium / anemone / ranunculus /
 * scabiosa / etc — variety families like elegance, mistral, fullstar, mariane, pacific),
 * of which only 17 already carry product_chrome (images/slug/display_name). The other
 * ~63 are facu-cost-approved but unpublishable SOLELY because they have no chrome.
 * `floropolis_inventory_mirror` holds 165 Megaflor rows (per-COLOR listings, 155 with
 * images) that carry exactly those images. This job builds the missing product_chrome
 * rows from the BACKUP mirror.
 *
 * This is the sibling of scripts/jobs/extend_chrome_mf_flodecol.mjs and copies its
 * conventions verbatim (env loading, paginated PostgREST, match classes
 * exact/fuzzy/ambiguous/unmatched_*, state-file output, --fixture/--dry-run/--live modes,
 * slug dedup, "builder ≠ writer" safety). What changes for Megaflor is the MATCH SPINE,
 * driven by three structural facts VERIFIED in BACKUP on 2026-06-04:
 *
 *   1. COLOR IS A FIRST-CLASS COLUMN NOW (the point of this rewrite). dim_sku carries
 *      color_normalized inside its natural key. We gate on that COLUMN, not on
 *      token-folding the variety string. BUT Megaflor's color_normalized is messy:
 *        - plain:     "red", "white", "hot pink", "light blue", "burgundy"
 *        - misspelled:"fucsia" (-> fuchsia), "strawberry"/"chocolate" (vendor trade names)
 *        - compound "<tradename> - <color>": "french vanilla - light pink",
 *          "black berry - burgundy", "popsicle - purple", "white improved - white",
 *          "red apple - red", "teaberry - lavender", "maraschino burgundy".
 *      We CANONICALIZE each side to a color-token set: for "X - Y" we take Y (the real
 *      color after the dash); for the rest we keep the recognized COLOR_WORDS found in
 *      the string (so "maraschino burgundy" -> {burgundy}). The mirror side canonicalizes
 *      its `color` column the same way ("Hot Pink" -> {hot,pink}, "Blue-White" -> {blue,white},
 *      "Bordeaux" -> {burgundy} via alias). 'assorted'/'mixed' on EITHER side is a wildcard.
 *      The gate is HARD: incompatible color = no match (this is what stops Elegance Red
 *      stealing the Elegance Pink image).
 *
 *   2. SIZE IS A RANGE ON THE MIRROR, A SCALAR ON dim. dim_sku keys by a single
 *      size_cm integer (35, 40, 60, 70...). The mirror `length` is free text that is
 *      USUALLY A RANGE: "30-35 cm", "35-40 cm", "55-60 cm", "80-90 cm", plus singles
 *      "60 cm","35 cm","250g" and blanks "". So size agreement is RANGE-AWARE: a dim cm
 *      matches a mirror length when the cm equals a single value, OR equals either
 *      endpoint of a range, OR (looser, fuzzy-only) falls strictly inside the range.
 *      Exact-tier match requires endpoint/single equality; interior-of-range is a
 *      compatible-but-not-exact signal used only to rank, never to upgrade a class.
 *      Blank/grams mirror length on a cm-keyed dim => size not disambiguating.
 *
 *   3. VARIETY APPEARS IN TWO LAYOUTS ON THE MIRROR. Older rows: variety="Mariane",
 *      color="Pink", name="Mariane Pink 25cm". Newer rows: variety="Mariane",
 *      color="Pink", name="Anemone Pink Mariane 30-35CM" (category + color + variety in
 *      the name). dim variety_normalized is the clean lowercased variety ("mariane",
 *      "fullstar","pacific blue bird","scoop red"). We compare TOKEN SETS of the variety
 *      (dim variety_normalized vs mirror `variety`), with category words STOP-listed and
 *      color tokens pulled OUT into the color gate, so "FullStar" == "Full Star" and
 *      "scoop red" stays distinct from "scoop".
 *
 * SCOPE / SAFETY (identical contract to the MF/Flodecol job)
 * ----------------------------------------------------------
 *   - BACKUP only. Reads mirror + dim_sku + product_chrome; the only WRITE is INSERT
 *     into product_chrome, ONLY under --live, ONLY for exact+fuzzy whose sku_id is not
 *     already in chrome and whose matched mirror row has >=1 image.
 *   - DRY-RUN is the default: writes the full match table to state/ and prints a summary,
 *     performs NO database writes.
 *   - Quarantined dim rows are excluded (jumbo / x families are quarantined today).
 *   - Job_PM runs --live, not the author of this script.
 *
 * Usage:
 *   node scripts/jobs/extend_chrome_megaflor.mjs            # dry-run (default)
 *   node scripts/jobs/extend_chrome_megaflor.mjs --live     # Job_PM only
 *   node scripts/jobs/extend_chrome_megaflor.mjs --fixture <path.json>
 *
 * Output (always): state/chrome_match_megaflor_2026-06-04.json
 *
 * Env/client conventions copied from scripts/jobs/extend_chrome_mf_flodecol.mjs:
 * BACKUP creds from .env.local (process.env wins); service key preferred (mirror has
 * RLS-on/0-policies so the anon key cannot read it). --fixture forces dry-run.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const VENDORS = ["Megaflor"];
const MATCHED_BY = "vendor_ext_megaflor_20260604";
const OUT_PATH = resolve(REPO_ROOT, "state/chrome_match_megaflor_2026-06-04.json");

const argv = process.argv;
const fixtureIdx = argv.indexOf("--fixture");
const FIXTURE = fixtureIdx >= 0 ? argv[fixtureIdx + 1] : null;
// --fixture forces dry-run (offline snapshot may be stale; never write from it).
const LIVE = argv.includes("--live") && !FIXTURE;

// ---------------------------------------------------------------------------
// Env — BACKUP credentials only (same loader as extend_chrome_mf_flodecol.mjs).
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
// Paginated PostgREST GET / INSERT against BACKUP.
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

// Lowercase, drop diacritics, drop parenthetical notes, punctuation -> spaces,
// collapse whitespace. Base for token sets and slugs. NOTE: hyphens become spaces
// (so "Blue-White" -> "blue white", "30-35" -> "30 35").
function normText(s) {
  return stripDiacritics(String(s || "").toLowerCase())
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---- Color vocabulary --------------------------------------------------------
// Recognized base color tokens. Multi-word colors (hot pink, light blue) survive as
// multiple tokens, which keeps "light blue" distinct from "blue".
const COLOR_WORDS = new Set([
  "white", "red", "pink", "blue", "green", "yellow", "orange", "peach", "purple",
  "lavender", "brown", "cream", "salmon", "fuchsia", "violet", "bicolor",
  "burgundy", "magenta", "hot", "light", "dark",
]);
// Vendor spellings / trade-name colors -> canonical color tokens. Applied token-by-token
// AND on whole strings before tokenizing.
const COLOR_ALIASES = {
  fucsia: "fuchsia",
  strawberry: "red",      // FullStar Strawberry = a red anemone trade name
  chocolate: "brown",     // Elegance Chocolate = a brown ranunculus trade name
  bordeaux: "burgundy",
  maraschino: "burgundy", // "maraschino burgundy"
};
const WILDCARD_COLORS = new Set(["assorted", "mixed"]);

// Canonicalize a free-text color field into { tokens:Set, wildcard:bool }.
//   - "french vanilla - light pink" -> take the part AFTER the last " - " ("light pink").
//     The pre-dash part is a vendor trade name, not a color; the post-dash part is the
//     real color (verified across all dim compound colors on 2026-06-04).
//   - apply aliases, then keep only recognized COLOR_WORDS as tokens.
//   - 'assorted'/'mixed' anywhere -> wildcard.
function canonColor(raw) {
  let s = String(raw || "");
  if (s.includes(" - ")) s = s.split(" - ").pop(); // "tradename - color" -> color
  s = normText(s);
  if (!s) return { tokens: new Set(), wildcard: false };
  const out = new Set();
  let wildcard = false;
  for (let tok of s.split(" ")) {
    if (COLOR_ALIASES[tok]) tok = COLOR_ALIASES[tok];
    if (WILDCARD_COLORS.has(tok)) { wildcard = true; continue; }
    if (COLOR_WORDS.has(tok)) out.add(tok);
  }
  return { tokens: out, wildcard };
}

// ---- Variety tokenization ----------------------------------------------------
// Category words appear inconsistently: as the mirror name PREFIX
// ("Anemone Pink Full Star 30CM", "Delphinium Blue Blue Bird 60CM") but never in the
// dim variety_normalized. Stop them so the leaf variety token drives the match. Also
// stop units/grade/color fillers; color is handled by the color gate, not here.
const STOP = new Set([
  "cm", "g", "stem", "stems", "the", "with",
  // category words (mirror name prefixes)
  "anemone", "delphinium", "ranunculus", "scabiosa", "alstroemeria", "gypsophila",
  "thistle", "eryngium", "craspedia", "larkspur", "bells", "of", "ireland",
]);

// Build a variety token set: normalize, drop STOP, drop pure-number tokens (sizes),
// drop recognized color tokens (handled separately), drop wildcard words.
function varietyTokens(...parts) {
  const toks = normText(parts.filter(Boolean).join(" ")).split(" ").filter(Boolean);
  const core = new Set();
  for (const t of toks) {
    if (!t) continue;
    if (STOP.has(t)) continue;
    // Size tokens — pure numbers ("35") AND digit-glued units ("35cm","80cm","250g",
    // "90mm") that normText leaves intact because there's no separator inside them.
    // These are sizes embedded in mirror names ("FullStar Assorted 35cm"), never variety.
    if (/^\d+$/.test(t)) continue;
    if (/^\d+(cm|mm|g)$/.test(t)) continue;
    if (WILDCARD_COLORS.has(t)) continue; // 'assorted'/'mixed' is color, not variety
    if (COLOR_WORDS.has(t)) continue;     // colors go through the color gate
    if (COLOR_ALIASES[t]) continue;       // alias colors too (fucsia/strawberry/...)
    core.add(t);
  }
  return core;
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

// ---- Size parsing (range-aware) ---------------------------------------------
// Parse grams out of mirror length ("250g"). Returns int or null.
function parseGrams(lengthText) {
  const m = String(lengthText || "").match(/(\d+)\s*g\b/i);
  return m ? parseInt(m[1], 10) : null;
}
// Parse a cm spec out of mirror length into { lo, hi } (inclusive). Handles:
//   "60 cm" / "60cm"   -> {lo:60, hi:60}
//   "30-35 cm"         -> {lo:30, hi:35}
//   "80-90 cm"         -> {lo:80, hi:90}
//   "250g" / "" / null -> null (no cm signal)
function parseCmRange(lengthText) {
  const s = String(lengthText || "");
  if (/\d+\s*g\b/i.test(s)) return null; // grams string, not cm
  const range = s.match(/(\d+)\s*-\s*(\d+)/);
  if (range) {
    const lo = parseInt(range[1], 10);
    const hi = parseInt(range[2], 10);
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
  }
  const single = s.match(/(\d+)/);
  if (single) {
    const n = parseInt(single[1], 10);
    return { lo: n, hi: n };
  }
  return null;
}

// ---- Slug / display-name (mirror existing Megaflor product_chrome convention) -
// Existing Megaflor slugs: "elegance-assorted-35-40-cm", "focal-scoop-lavender-60cm",
// "fullstar-assorted-35cm", "pacific-blue-bird-blue-70-cm", "x-green-70cm".
// They are derived from the MIRROR display label (variety + color + length), with cm
// suffixed as "{N}cm" or "{lo}-{hi}-cm". We rebuild from the DIM key (clean, single cm)
// for a stable canonical form, then dedup against existing + this run.
function slugify(s) {
  return normText(s).replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}
function buildSlug(dim) {
  const variety = normText(dim.variety_normalized);
  const colorRaw = normText(dim.color_normalized);
  // collapse compound dim color "tradename color" for the slug to just the canonical
  // color tokens when present, else the raw normalized color (so we don't lose signal).
  const cc = canonColor(dim.color_normalized);
  const colorPart = cc.wildcard
    ? "assorted"
    : cc.tokens.size
      ? [...cc.tokens].join(" ")
      : colorRaw;
  const base = variety.endsWith(` ${colorPart}`) || variety === colorPart
    ? variety
    : `${variety} ${colorPart}`;
  const cm = dim.size_cm != null ? Number(dim.size_cm) : null;
  if (cm != null) return `${slugify(base)}-${cm}cm`;
  return slugify(base);
}
function buildDisplayName(dim) {
  const tc = (s) =>
    String(s || "")
      .split(" ")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  const variety = normText(dim.variety_normalized);
  const cc = canonColor(dim.color_normalized);
  const colorPart = cc.wildcard
    ? "assorted"
    : cc.tokens.size
      ? [...cc.tokens].join(" ")
      : normText(dim.color_normalized);
  let name = tc(variety);
  if (colorPart && !variety.endsWith(` ${colorPart}`) && variety !== colorPart) {
    name += ` ${tc(colorPart)}`;
  }
  if (dim.size_cm != null) name += ` ${Number(dim.size_cm)} cm`;
  return name.trim();
}
function unitLabel(dim) {
  const u = String(dim.selling_unit || "").toLowerCase();
  if (u === "bunch") return "Bunch";
  if (u === "box") return "Box";
  return "Stem";
}

// ---------------------------------------------------------------------------
// Build comparable representations.
// ---------------------------------------------------------------------------
function mirrorRepr(m) {
  const grams = parseGrams(m.length);
  const cmRange = parseCmRange(m.length);
  const cc = canonColor(m.color);
  return {
    id: m.id,
    name: m.name,
    variety: m.variety,
    color: m.color,
    length: m.length,
    category: m.category,
    grams,
    cmRange, // {lo,hi} | null
    img_n: Array.isArray(m.images) ? m.images.length : 0,
    images: Array.isArray(m.images) ? m.images : [],
    has_description: m.contents_note != null && String(m.contents_note).trim() !== "",
    description: m.contents_note ?? null,
    // variety tokens come from BOTH variety and name (name carries the leaf for some
    // rows, e.g. "X" variety with name "X Green 70cm"); STOP/color/size strip the noise.
    core: (() => {
      const a = varietyTokens(m.variety);
      const b = varietyTokens(m.name);
      // union, but if variety alone is non-empty prefer it as the spine and only add
      // name tokens that aren't size/color noise (already stripped). Union is safe here.
      return new Set([...a, ...b]);
    })(),
    colors: cc.tokens,
    wildcard: cc.wildcard,
  };
}

function dimRepr(d) {
  const cc = canonColor(d.color_normalized);
  return {
    sku_id: d.sku_id,
    variety_normalized: d.variety_normalized,
    color_normalized: d.color_normalized,
    size_cm: d.size_cm != null ? Number(d.size_cm) : null,
    box_type: d.box_type,
    selling_unit: d.selling_unit,
    category: d.category,
    quarantined: d.quarantined,
    core: varietyTokens(d.variety_normalized),
    colors: cc.tokens,
    wildcard: cc.wildcard,
  };
}

// Color compatibility gate (HARD). Compatible when either side is a wildcard
// (assorted/mixed), OR one side has no recognized color signal, OR the canonical color
// token sets are exactly equal. An asymmetric non-empty difference (dim {light,blue} vs
// mirror {blue}) is INCOMPATIBLE — keeps "light blue" from stealing "blue".
function colorsCompatible(dim, mr) {
  if (dim.wildcard || mr.wildcard) return true;
  if (dim.colors.size === 0 || mr.colors.size === 0) return true;
  return setEq(dim.colors, mr.colors);
}

// Size agreement (range-aware) between a cm-keyed dim row and a mirror candidate.
// Returns 'exact' | 'compatible' | 'mismatch'.
//   - dim cm == mirror single, OR == an endpoint of mirror range  -> 'exact'
//   - dim cm strictly inside mirror range (not an endpoint)        -> 'compatible'
//   - mirror carries no cm signal (blank / grams)                  -> 'compatible'
//   - dim cm outside mirror range                                  -> 'mismatch'
// (All Megaflor dim rows are cm-keyed; no grams-keyed dim exists, so grams mirror rows
//  fall to 'compatible' i.e. non-disambiguating, and only match if nothing cm-sized does.)
function sizeAgreement(dim, mr) {
  if (dim.size_cm == null) return "compatible";
  if (mr.cmRange == null) return "compatible"; // mirror has no cm (blank/grams)
  const { lo, hi } = mr.cmRange;
  if (dim.size_cm === lo || dim.size_cm === hi) return "exact";
  if (dim.size_cm > lo && dim.size_cm < hi) return "compatible";
  return "mismatch";
}

// ---------------------------------------------------------------------------
// Core match: for each dim_sku, gate candidate mirror rows on color + size, then
// classify by variety token-set equality (exact) / descriptor-free overlap (fuzzy).
// ---------------------------------------------------------------------------
function classifyDim(dim, mirrors) {
  const gated = mirrors.filter(
    (mr) => colorsCompatible(dim, mr) && sizeAgreement(dim, mr) !== "mismatch",
  );
  if (gated.length === 0) {
    return { match_class: "unmatched_dim_sku", reason: "no color/size-compatible mirror row", mirror: null };
  }

  const sizeRank = (mr) => (sizeAgreement(dim, mr) === "exact" ? 2 : 1); // exact > interior
  // Color match TIER (the spine of the color-aware gate):
  //   2 = STRONG  — both sides specific and color sets equal (true color identity),
  //                 OR both sides wildcard (assorted dim ↔ assorted mirror).
  //   1 = NEUTRAL — exactly one side carries no recognized color signal (identity
  //                 rests on variety+size; color is silent, not contradictory).
  //   0 = WILDCARD-BRIDGE — a wildcard bridges to a SPECIFIC color on the other side
  //                 (assorted dim ↔ a single-color mirror, or specific dim ↔ assorted
  //                 mirror). Weakest: an assorted box must not adopt one color's photo,
  //                 and a specific SKU must not adopt the generic-mix photo, when a
  //                 better-tier candidate exists.
  const colorTier = (mr) => {
    const dw = dim.wildcard, mw = mr.wildcard;
    if (dw && mw) return 2;            // assorted ↔ assorted
    if (dw || mw) return 0;            // wildcard bridging to a specific color
    if (dim.colors.size === 0 || mr.colors.size === 0) return 1; // one side color-silent
    return setEq(dim.colors, mr.colors) ? 2 : 0;
  };
  // Tier-then-size-then-images ordering, shared by exact and fuzzy stages.
  const rankCmp = (a, b) => {
    const ct = colorTier(b) - colorTier(a);
    if (ct) return ct;
    const sr = sizeRank(b) - sizeRank(a);
    if (sr) return sr;
    return b.img_n - a.img_n;
  };

  // --- Stage 1: EXACT — identical variety token set (color already gated). ---
  const exactCands = gated.filter((mr) => setEq(dim.core, mr.core));
  if (exactCands.length >= 1) {
    const ranked = [...exactCands].sort(rankCmp);
    const top = ranked[0];
    // Ambiguous only among peers at the SAME color-tier AND size-rank that carry a
    // DIFFERENT first image (a genuinely distinct product). A lower-tier candidate
    // (e.g. a single-color listing under an assorted dim) is never a peer, so it can
    // neither win nor trigger ambiguity. Same-image dupes -> take the richest.
    const peers = ranked.filter(
      (r) =>
        r !== top &&
        colorTier(r) === colorTier(top) &&
        sizeRank(r) === sizeRank(top) &&
        r.img_n > 0 &&
        (r.images[0] || "") !== (top.images[0] || ""),
    );
    if (peers.length > 0) {
      return {
        match_class: "ambiguous",
        reason: `variety+color+size-equal multiple with distinct images: ids [${[top, ...peers].map((p) => p.id).join(", ")}]`,
        candidates: [top, ...peers].map((p) => p.id),
        mirror: null,
      };
    }
    return {
      match_class: "exact",
      reason:
        sizeAgreement(dim, top) === "exact"
          ? `variety+color equal, size endpoint match (dim ${dim.size_cm}cm ∈ "${top.length}")`
          : sizeAgreement(dim, top) === "compatible" && top.cmRange
            ? `variety+color equal, dim ${dim.size_cm}cm inside range "${top.length}"`
            : `variety+color equal, mirror size absent (not disambiguating)`,
      mirror: top,
    };
  }

  // --- Stage 2: FUZZY — variety token sets are NOT equal but one is a non-empty subset
  // of the other (mirror carries an extra grade/series word, or vice versa) AND they
  // share >=1 token. Any disjoint-token situation is NOT fuzzy (distinct varieties).
  const fuzzyCands = gated
    .filter((mr) => {
      if (setEq(dim.core, mr.core)) return false; // handled by exact
      if (dim.core.size === 0 || mr.core.size === 0) return false;
      const shared = [...dim.core].filter((t) => mr.core.has(t)).length;
      if (shared < 1) return false;
      const dimSubset = [...dim.core].every((t) => mr.core.has(t));
      const mrSubset = [...mr.core].every((t) => dim.core.has(t));
      return dimSubset || mrSubset; // one fully contains the other
    })
    .map((mr) => ({ mr, j: jaccard(dim.core, mr.core), ct: colorTier(mr), sr: sizeRank(mr) }))
    .sort((a, b) => b.ct - a.ct || b.sr - a.sr || b.j - a.j || b.mr.img_n - a.mr.img_n);

  if (fuzzyCands.length >= 1) {
    const best = fuzzyCands[0];
    // Tie (ambiguous) only among same color-tier + size-rank + jaccard with distinct
    // first images. A lower color-tier candidate is never a tie.
    const tie = fuzzyCands.filter(
      (c) =>
        c !== best &&
        c.ct === best.ct &&
        c.sr === best.sr &&
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
      reason: `variety subset/superset; jaccard=${best.j.toFixed(2)}; dim[${[...dim.core].join(",")}] mirror[${[...best.mr.core].join(",")}]`,
      mirror: best.mr,
    };
  }

  return {
    match_class: "unmatched_dim_sku",
    reason: "color/size-compatible mirror exists but variety tokens disjoint",
    mirror: null,
  };
}

// ---------------------------------------------------------------------------
async function main() {
  console.log(`=== EXTEND CHROME — Megaflor (${LIVE ? "LIVE" : "DRY-RUN"}) ===`);

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
        "sku_id,vendor_canonical_name,variety_normalized,color_normalized,size_cm,box_type,selling_unit,tier,category,quarantined",
      vendor_canonical_name: `in.(${vendorList})`,
    });
    existingChrome = await fetchAllRest("product_chrome", { select: "sku_id,slug" });
  }
  const chromeSkuSet = new Set(existingChrome.map((r) => r.sku_id));
  const chromeSlugSet = new Set(existingChrome.map((r) => r.slug));

  console.log(`  mirror rows: ${mirrorRows.length} | dim_sku rows: ${dimRows.length} | existing chrome (all vendors): ${existingChrome.length}`);

  const results = [];
  const inserts = [];
  const newSlugsThisRun = new Set();

  for (const vendor of VENDORS) {
    const mDimAll = dimRows.filter((d) => d.vendor_canonical_name === vendor);
    const mDim = mDimAll.filter((d) => d.quarantined !== true).map(dimRepr);
    const quarantinedN = mDimAll.length - mDim.length;
    const mMir = mirrorRows.filter((m) => m.vendor === vendor).map(mirrorRepr);

    // --- Mirror format report ---
    const gramsRows = mMir.filter((m) => m.grams != null);
    const rangeRows = mMir.filter((m) => m.cmRange && m.cmRange.lo !== m.cmRange.hi);
    const singleCmRows = mMir.filter((m) => m.cmRange && m.cmRange.lo === m.cmRange.hi);
    const blankRows = mMir.filter((m) => m.grams == null && m.cmRange == null);
    console.log(`\n--- ${vendor} mirror format ---`);
    console.log(`  rows: ${mMir.length} | cm-range: ${rangeRows.length} | single-cm: ${singleCmRows.length} | grams: ${gramsRows.length} | blank-length: ${blankRows.length}`);
    const rangeSamples = [...new Set(rangeRows.map((m) => `"${m.length}"->${m.cmRange.lo}-${m.cmRange.hi}`))].slice(0, 6);
    if (rangeSamples.length) console.log(`  cm-range samples: ${rangeSamples.join(", ")}`);
    const imglessN = mMir.filter((m) => m.img_n === 0).length;
    console.log(`  mirror rows with 0 images (cannot seed chrome): ${imglessN}`);
    console.log(`  dim_sku(active): ${mDim.length} | quarantined(excluded): ${quarantinedN} | already in chrome: ${mDim.filter((d) => chromeSkuSet.has(d.sku_id)).length}`);

    // --- Match each active dim row ---
    const matchedMirrorIds = new Set();
    for (const dim of mDim) {
      const cls = classifyDim(dim, mMir);
      const cc = canonColor(dim.color_normalized);
      const rec = {
        vendor,
        sku_id: dim.sku_id,
        dim_variety: dim.variety_normalized,
        dim_color: dim.color_normalized,
        dim_color_canon: cc.wildcard ? "*assorted*" : [...cc.tokens].join("+") || "(none)",
        dim_size: dim.size_cm != null ? `${dim.size_cm}cm` : "—",
        dim_box_type: dim.box_type,
        match_class: cls.match_class,
        reason: cls.reason,
        mirror_id: cls.mirror ? cls.mirror.id : null,
        mirror_name: cls.mirror ? cls.mirror.name : null,
        mirror_length: cls.mirror ? cls.mirror.length : null,
        image_count: cls.mirror ? cls.mirror.img_n : 0,
        has_description: cls.mirror ? cls.mirror.has_description : false,
        candidates: cls.candidates || null,
        already_in_chrome: chromeSkuSet.has(dim.sku_id),
      };
      results.push(rec);
      if (cls.mirror) matchedMirrorIds.add(cls.mirror.id);

      if ((cls.match_class === "exact" || cls.match_class === "fuzzy") && !chromeSkuSet.has(dim.sku_id)) {
        if (cls.mirror.img_n < 1) {
          rec.skip_reason = "matched mirror has 0 images";
          continue;
        }
        const slug = buildSlug(dim);
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

    // --- Unmatched mirror rows ---
    for (const mr of mMir) {
      if (!matchedMirrorIds.has(mr.id)) {
        results.push({
          vendor,
          sku_id: null,
          dim_variety: null,
          mirror_id: mr.id,
          mirror_name: mr.name,
          mirror_category: mr.category,
          mirror_length: mr.length,
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

  const expectedInserts = inserts.length;
  const newlyPublishable = inserts.length; // each insert = one dim SKU that gains chrome

  console.log(`\n=== MATCH SUMMARY (per class) ===`);
  for (const c of classes) console.log(`  ${c.padEnd(20)} ${summary[c]}`);
  console.log(`\n  expected chrome inserts (exact+fuzzy, not already in chrome, >=1 img): ${expectedInserts}`);
  console.log(`  expected newly-publishable SKUs: ${newlyPublishable}`);

  console.log(`\n=== MATCH TABLE (exact/fuzzy → planned chrome) ===`);
  for (const r of results.filter((x) => x.match_class === "exact" || x.match_class === "fuzzy")) {
    console.log(
      `  [${r.match_class}] ${r.dim_variety} / ${r.dim_color_canon} (${r.dim_size}) -> mirror#${r.mirror_id} "${r.mirror_name}" [${r.mirror_length || "—"}] img=${r.image_count} | slug=${r.planned_slug || "(skipped: " + (r.skip_reason || "already in chrome") + ")"}`,
    );
  }
  console.log(`\n=== REPAIR ITEMS (ambiguous / unmatched — never written) ===`);
  for (const r of results.filter((x) => ["ambiguous", "unmatched_dim_sku"].includes(x.match_class))) {
    console.log(`  [${r.match_class}] ${r.dim_variety} / ${r.dim_color_canon} (${r.dim_size}) | ${r.reason}`);
  }
  const unmatchedMir = results.filter((x) => x.match_class === "unmatched_mirror");
  console.log(`\n  unmatched_mirror rows: ${unmatchedMir.length} (mirror listings no active dim claimed — informational)`);
  for (const r of unmatchedMir.slice(0, 30)) {
    console.log(`    mirror#${r.mirror_id} "${r.mirror_name}" (${r.mirror_category}) [${r.mirror_length || "—"}] img=${r.image_count}`);
  }
  if (unmatchedMir.length > 30) console.log(`    ... +${unmatchedMir.length - 30} more (see state file)`);

  // ---- Write state file (always) ----
  const stateDir = dirname(OUT_PATH);
  if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  const payload = {
    generated_at: new Date().toISOString(),
    mode: LIVE ? "live" : "dry-run",
    matched_by: MATCHED_BY,
    vendors: VENDORS,
    summary,
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
