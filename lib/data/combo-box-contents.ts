/**
 * What's-in-this-box contents for Magic Flowers combo boxes.
 * Source: Magic Flowers & Botanicals Tropical Collection 2025 catalogue.
 *
 * Maps product slug → comma-separated variety list.
 * Shown as pill badges on the PDP "What's in this box" section.
 * These are typical contents — exact varieties rotate weekly based on peak availability.
 *
 * v1 | 2026-03-31 | Job_PM
 */

/**
 * Slugs that share the same recipe are listed individually so
 * the lookup stays a simple O(1) map — no iteration needed.
 */
export const COMBO_BOX_CONTENTS: Record<string, string> = {
  // ── Ginger Mix — explicit variety list from catalogue ─────────────────────
  "variety-mixes-ginger-mix-assorted":
    "Ginger King Plus Red,Ginger King Nicole,Torch Ginger Red,Torch Ginger Pink",
  "ginger-mix-box-fix-recipe-assorted-70":
    "Ginger King Plus Red,Ginger King Nicole,Torch Ginger Red,Torch Ginger Pink",

  // ── Tabasco (QB 113 stems) — heliconias + gingers + musa + foliage ────────
  "tropical-mixes-tabasco-assorted":
    "Heliconias,Gingers,Musa,Tropical Foliage",
  "combo-box-tabasco-assorted":
    "Heliconias,Gingers,Musa,Tropical Foliage",

  // ── Mini Tabasco (1/8 66 stems) ───────────────────────────────────────────
  "tropical-mixes-mini-tabasco-assorted":
    "Heliconias,Gingers,Tropical Foliage",
  "combo-box-mini-tabasco-assorted":
    "Heliconias,Gingers,Tropical Foliage",

  // ── Mini Fiesta (1/8 50 stems) ────────────────────────────────────────────
  "tropical-mixes-mini-fiesta-assorted":
    "Heliconias,Gingers,Musa,Tropical Foliage",
  "combo-box-mini-fiesta-assorted":
    "Heliconias,Gingers,Musa,Tropical Foliage",

  // ── Fire (QB 51 stems) ────────────────────────────────────────────────────
  "combo-box-fire-assorted":
    "Heliconias,Gingers,Tropical Foliage",

  // ── Mini Fire (1/8 43 stems) ──────────────────────────────────────────────
  "combo-box-mini-fire-assorted":
    "Heliconias,Gingers,Tropical Foliage",

  // ── Capricho (QB 41 stems) ────────────────────────────────────────────────
  "tropical-mixes-capricho-assorted":
    "Hanging Heliconias,Banana Fingers,Tropical Greens",
  "combo-box-capricho-assorted":
    "Hanging Heliconias,Banana Fingers,Tropical Greens",

  // ── Escarlata (QB 41 stems) ───────────────────────────────────────────────
  "tropical-mixes-escarlata-assorted":
    "Gingers,Heliconias,Tropical Greens",
  "combo-escarlata-assorted":
    "Gingers,Heliconias,Tropical Greens",

  // ── Iniziativa (QB 41 stems) ──────────────────────────────────────────────
  "tropical-mixes-iniziativa-assorted":
    "Tropical Heliconias,Foliage",
  "combo-box-iniziativa-assorted":
    "Tropical Heliconias,Foliage",

  // ── Tiki Limbo Flower Kit (HB 180 / QB 95 / 1/8 54 stems) ────────────────
  "tropical-mixes-tiki-limbo-flower-kit-assorted":
    "Heliconias,Gingers,Tropical Flowers,Greens",
  "the-tiki-limbo-flower-kit-assorted":
    "Heliconias,Gingers,Tropical Flowers,Greens",
};
