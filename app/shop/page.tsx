"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { SlidersHorizontal, X, ChevronDown, Package, Flame, Star, Search } from "lucide-react";
import QuoteBar from "@/components/QuoteBar";
import { products as catalogProducts, type Product } from "@/lib/data/products";
import { getGroupedProducts } from "@/lib/data/product-helpers";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import { PRODUCT_IMAGES_BASE_URL, WHATSAPP_NUMBER } from "@/lib/catalog-constants";
import { getProductImage } from "@/lib/product-images";
import { getEarliestDeliveryDate, formatDeliveryDate } from "@/lib/delivery-dates";

type SortOption = "recommended" | "price-asc" | "price-desc" | "name";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name", label: "Name A–Z" },
];

// Simplified color groups for filter (maps granular colors → display groups)
const COLOR_GROUPS: Record<string, string[]> = {
  Red: ["Red", "Dark Red", "Burgundy"],
  Pink: ["Pink", "Hot Pink", "Dark Pink", "Soft Pink", "Light Pink", "Fuchsia", "Salmon"],
  White: ["White", "Cream"],
  Yellow: ["Yellow"],
  Orange: ["Orange", "Coral", "Peach", "Light Peach"],
  Purple: ["Purple", "Lavender", "Pink Lavender"],
  Blue: ["Blue", "Dark Blue", "Light Blue"],
  Green: ["Green", "Light Green"],
  Mixed: ["Assorted", "Rainbow", "Bicolor"],
  Other: ["Beige", "Brown", "Champagne", "Peach Pink"],
};

// Reverse map: raw color → group name
function getColorGroup(rawColor: string): string {
  for (const [group, colors] of Object.entries(COLOR_GROUPS)) {
    if (colors.includes(rawColor)) return group;
  }
  return "Other";
}

function resolveImage(pathList: string[], variety?: string, color?: string, category?: string): string {
  const path = pathList[0];
  if (path) {
    if (path.startsWith("http") || path.startsWith("/")) return path;
    const base = PRODUCT_IMAGES_BASE_URL.replace(/\/$/, "");
    return `${base}/${path}`;
  }
  // Fall back to our image mapper
  if (variety && category) {
    return getProductImage(variety, color || "", category);
  }
  return "/Floropolis-logo-only.png";
}

// Categories ordered by TAM / market importance
const CATEGORY_TAM_ORDER = [
  "Rose",
  "Tropicals",
  "Bouquets",
  "Mixed Boxes",
  "Greens & Foliage",
  "Delphinium",
  "Anemone",
  "Ranunculus",
  "Gypsophila",
];

// Categories with <10 products get grouped under "Specialty"
const SPECIALTY_THRESHOLD = 10;

const { ALL_CATEGORIES, SPECIALTY_CATEGORIES } = (() => {
  const catCounts = new Map<string, number>();
  for (const p of catalogProducts) {
    catCounts.set(p.category, (catCounts.get(p.category) || 0) + 1);
  }
  const specialty: string[] = [];
  const main: string[] = [];
  for (const [cat, count] of catCounts) {
    if (count < SPECIALTY_THRESHOLD && !CATEGORY_TAM_ORDER.includes(cat)) {
      specialty.push(cat);
    }
  }
  // Build ordered list: TAM order first, then Specialty at end
  const ordered = CATEGORY_TAM_ORDER.filter((c) => catCounts.has(c));
  // Add any unlisted categories with >= threshold
  for (const [cat] of catCounts) {
    if (!ordered.includes(cat) && !specialty.includes(cat)) {
      ordered.push(cat);
    }
  }
  if (specialty.length > 0) {
    ordered.push("Specialty");
  }
  return { ALL_CATEGORIES: ordered, SPECIALTY_CATEGORIES: specialty };
})();

// Group products by variety+color for one-card-per-variety display
interface VarietyGroup {
  key: string;
  name: string;
  variety: string;
  color: string;
  category: string;
  unit: string; // Stem | Bunch | Box
  minPrice: number;
  maxPrice: number;
  originalMinPrice: number; // price before any deal
  image: string;
  has_photo: boolean;
  tier: string; // best (lowest = most available) tier in group
  bestseller: boolean;
  is_on_deal: boolean;
  deal_label: string | null;
  dealPrice: number | null;
  hasPriceIssue: boolean; // true if any variant has price <= 0
  variantCount: number;
  slug: string; // slug of the representative product
  colorGroup: string;
  compareAtPrice: number | null; // market rate for strikethrough display
}

// Returns true if a product is available to show based on tier + arrival_date rules.
// T1/T2: arrival_date must be >= today+5. No date or too soon = HIDE.
// T3: arrival_date must be >= today+14 AND price > 0. No date or too soon = HIDE.
function isAvailable(p: Product): boolean {
  if (!p.available_from) return false; // all tiers: no date = hide
  if (!p.price || p.price <= 0) return false; // all tiers: no valid price = hide
  const daysUntil = Math.ceil((new Date(p.available_from).getTime() - Date.now()) / 86400000);
  if (p.tier === "T3") return daysUntil >= 14;
  return daysUntil >= 5; // T1, T2
}

function buildVarietyGroups(): VarietyGroup[] {
  const groups = new Map<string, Product[]>();
  for (const p of catalogProducts) {
    if (!isAvailable(p)) continue;
    if (p.price <= 0) {
      console.warn(`[PRICE ISSUE] Product "${p.name}" (ID: ${p.id}, slug: ${p.slug}) has price=${p.price}. Needs data fix.`);
    }
    const key = `${p.variety}---${p.color}`.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const result: VarietyGroup[] = [];
  for (const [key, variants] of groups) {
    // Pick the best representative (has photo, best tier, best price)
    const sorted = [...variants].sort((a, b) => {
      if (a.has_photo !== b.has_photo) return a.has_photo ? -1 : 1;
      const tierOrder: Record<string, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };
      const ta = tierOrder[a.tier] ?? 3;
      const tb = tierOrder[b.tier] ?? 3;
      if (ta !== tb) return ta - tb;
      return a.price - b.price;
    });
    const rep = sorted[0];

    const prices = variants.map((v) => v.deal_price ?? v.price);
    const originalPrices = variants.map((v) => v.price);
    const bestTier = sorted.reduce((best, v) => {
      const order: Record<string, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };
      return (order[v.tier] ?? 3) < (order[best] ?? 3) ? v.tier : best;
    }, rep.tier);

    const anyDeal = variants.some((v) => v.is_on_deal && v.deal_price != null);
    const dealVariant = variants.find((v) => v.is_on_deal && v.deal_price != null);
    const hasPriceIssue = variants.some((v) => v.price <= 0);

    const displayName = [rep.variety, rep.color].filter(Boolean).join(" ");

    // For price display, use only valid prices (> 0), fallback to 0 if all broken
    const validPrices = prices.filter((p) => p > 0);
    const validOriginalPrices = originalPrices.filter((p) => p > 0);

    result.push({
      key,
      name: displayName || rep.name,
      variety: rep.variety,
      color: rep.color,
      category: rep.category,
      unit: rep.unit || "Stem",
      minPrice: validPrices.length > 0 ? Math.min(...validPrices) : 0,
      maxPrice: validPrices.length > 0 ? Math.max(...validPrices) : 0,
      originalMinPrice: validOriginalPrices.length > 0 ? Math.min(...validOriginalPrices) : 0,
      image: resolveImage(rep.images || [], rep.variety, rep.color, rep.category),
      has_photo: rep.has_photo,
      tier: bestTier,
      bestseller: variants.some((v) => v.is_best_seller),
      is_on_deal: anyDeal,
      deal_label: dealVariant?.deal_label ?? null,
      dealPrice: dealVariant?.deal_price ?? null,
      hasPriceIssue,
      variantCount: variants.length,
      slug: rep.slug,
      colorGroup: getColorGroup(rep.color),
      compareAtPrice: rep.compare_at_price ?? null,
    });
  }
  return result;
}

/** Sample box CTA — honest, no fake scarcity */
function SampleBoxCTA() {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-xl bg-emerald-50/80 border border-emerald-100 px-5 py-3">
      <Package className="w-5 h-5 text-emerald-600 flex-shrink-0" />
      <p className="text-sm text-slate-700">
        <span className="font-semibold">New to Floropolis?</span>{" "}
        Try our{" "}
        <Link href="/sample-box" className="text-emerald-600 font-semibold hover:underline">
          free sample box
        </Link>{" "}
        — no obligation, no credit card.
      </p>
    </div>
  );
}

function ShopPageContent() {
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [colorGroupFilter, setColorGroupFilter] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<number | "">("");
  const [priceMax, setPriceMax] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllColors, setShowAllColors] = useState(false);
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [showBestsellersOnly, setShowBestsellersOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchParams = useSearchParams();

  // Delivery tier filter chips — "fast" = T1/T2 (~4 days), "preorder" = T3 (~14 days)
  const [showFast, setShowFast] = useState(true);
  const [showPreorder, setShowPreorder] = useState(true);

  const varietyGroups = useMemo(() => buildVarietyGroups(), []);

  // Popular products — top bestsellers for hero section
  const popularProducts = useMemo(() => {
    return varietyGroups
      .filter((g) => g.bestseller && g.minPrice > 0)
      .sort((a, b) => {
        if (a.has_photo !== b.has_photo) return a.has_photo ? -1 : 1;
        if (a.tier !== b.tier) {
          const order: Record<string, number> = { T1: 0, T2: 1, T3: 2 };
          return (order[a.tier] ?? 3) - (order[b.tier] ?? 3);
        }
        return 0;
      })
      .slice(0, 8);
  }, [varietyGroups]);

  // Category counts for filter labels (with Specialty aggregation)
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of varietyGroups) {
      if (SPECIALTY_CATEGORIES.includes(g.category)) {
        counts.set("Specialty", (counts.get("Specialty") || 0) + 1);
      } else {
        counts.set(g.category, (counts.get(g.category) || 0) + 1);
      }
    }
    return counts;
  }, [varietyGroups]);

  // Available color groups with counts, ordered by volume
  const colorGroupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of varietyGroups) {
      counts.set(g.colorGroup, (counts.get(g.colorGroup) || 0) + 1);
    }
    return counts;
  }, [varietyGroups]);

  const availableColorGroups = useMemo(() => {
    return Object.keys(COLOR_GROUPS)
      .filter((cg) => colorGroupCounts.has(cg))
      .sort((a, b) => (colorGroupCounts.get(b) || 0) - (colorGroupCounts.get(a) || 0));
  }, [colorGroupCounts]);

  const [filtersInitialized, setFiltersInitialized] = useState(false);

  // Sync filters from URL on mount
  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      const cats = category.split(",");
      const matches = cats
        .map((c) => ALL_CATEGORIES.find((ac) => ac.toLowerCase() === c.toLowerCase()))
        .filter(Boolean) as string[];
      if (matches.length) setCategoryFilter(matches);
    }
    const color = searchParams.get("color");
    if (color) {
      const colors = color.split(",").filter((c) => c in COLOR_GROUPS);
      if (colors.length) setColorGroupFilter(colors);
    }
    if (searchParams.get("deals") === "1") setShowDealsOnly(true);
    if (searchParams.get("bestsellers") === "1") setShowBestsellersOnly(true);
    const sort = searchParams.get("sort") as SortOption | null;
    if (sort && SORT_OPTIONS.some((o) => o.value === sort)) setSortBy(sort);
    const q = searchParams.get("q");
    if (q) setSearchQuery(q);
    setFiltersInitialized(true);
  }, [searchParams]);

  // EXP-061: Track shop page entry with initial filter context
  useEffect(() => {
    if (!filtersInitialized) return;
    pushEvent(CTA_EVENTS.shop_page_viewed, {
      has_filters: (searchParams.get("category") || searchParams.get("color") || searchParams.get("q")) ? true : false,
      category_filter: searchParams.get("category") ?? "",
      color_filter: searchParams.get("color") ?? "",
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersInitialized]);

  // Sync filters to URL using replaceState (NOT router.replace) so GA4 doesn't count
  // filter clicks as new /shop page views — keeps URL shareable without inflating analytics
  useEffect(() => {
    if (!filtersInitialized) return;
    const params = new URLSearchParams();
    if (categoryFilter.length) params.set("category", categoryFilter.join(","));
    if (colorGroupFilter.length) params.set("color", colorGroupFilter.join(","));
    if (showDealsOnly) params.set("deals", "1");
    if (showBestsellersOnly) params.set("bestsellers", "1");
    if (sortBy !== "recommended") params.set("sort", sortBy);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    const qs = params.toString();
    const newUrl = qs ? `/shop?${qs}` : "/shop";
    window.history.replaceState(null, "", newUrl);
  }, [categoryFilter, colorGroupFilter, showDealsOnly, showBestsellersOnly, sortBy, searchQuery, filtersInitialized]);

  const toggleArray = <T,>(arr: T[], item: T, setter: (arr: T[]) => void, filterType?: string) => {
    const adding = !arr.includes(item);
    if (adding) {
      setter([...arr, item]);
    } else {
      setter(arr.filter((x) => x !== item));
    }
    if (filterType) {
      pushEvent(CTA_EVENTS.filter_change, {
        filter_type: filterType,
        filter_value: String(item),
        filter_action: adding ? "add" : "remove",
      });
    }
  };

  const filteredGroups = useMemo(() => {
    let list = [...varietyGroups];

    // Text search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((g) =>
        g.name.toLowerCase().includes(q) ||
        g.variety.toLowerCase().includes(q) ||
        g.color.toLowerCase().includes(q) ||
        g.category.toLowerCase().includes(q)
      );
    }

    // Delivery tier filter — show only selected tiers
    if (!showFast || !showPreorder) {
      list = list.filter((g) => {
        const isFast = g.tier === "T1" || g.tier === "T2";
        if (isFast) return showFast;
        return showPreorder;
      });
    }

    if (showDealsOnly) {
      list = list.filter((g) => g.is_on_deal);
    }
    if (showBestsellersOnly) {
      list = list.filter((g) => g.bestseller);
    }
    if (categoryFilter.length) {
      list = list.filter((g) => {
        if (categoryFilter.includes(g.category)) return true;
        if (categoryFilter.includes("Specialty") && SPECIALTY_CATEGORIES.includes(g.category)) return true;
        return false;
      });
    }
    if (colorGroupFilter.length) {
      list = list.filter((g) => colorGroupFilter.includes(g.colorGroup));
    }
    if (priceMin !== "") {
      list = list.filter((g) => g.minPrice >= (priceMin as number));
    }
    if (priceMax !== "") {
      list = list.filter((g) => g.maxPrice <= (priceMax as number));
    }
    return list;
  }, [categoryFilter, colorGroupFilter, priceMin, priceMax, showFast, showPreorder, showDealsOnly, showBestsellersOnly, searchQuery, varietyGroups]);

  const sortedGroups = useMemo(() => {
    const list = [...filteredGroups];
    switch (sortBy) {
      case "recommended":
        return list.sort((a, b) => {
          // Bestsellers first
          if (a.bestseller !== b.bestseller) return a.bestseller ? -1 : 1;
          // Deals second
          if (a.is_on_deal !== b.is_on_deal) return a.is_on_deal ? -1 : 1;
          // Better tier (more available) third
          const tierOrder: Record<string, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };
          const ta = tierOrder[a.tier] ?? 3;
          const tb = tierOrder[b.tier] ?? 3;
          if (ta !== tb) return ta - tb;
          return a.name.localeCompare(b.name);
        });
      case "price-asc":
        return list.sort((a, b) => a.minPrice - b.minPrice);
      case "price-desc":
        return list.sort((a, b) => b.maxPrice - a.maxPrice);
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  }, [filteredGroups, sortBy]);

  const clearFilters = () => {
    setCategoryFilter([]);
    setColorGroupFilter([]);
    setPriceMin("");
    setPriceMax("");
    setShowFast(true);
    setShowPreorder(true);
    setShowDealsOnly(false);
    setShowBestsellersOnly(false);
    setSearchQuery("");
  };

  const hasActiveFilters =
    categoryFilter.length > 0 ||
    colorGroupFilter.length > 0 ||
    priceMin !== "" ||
    priceMax !== "" ||
    !showFast ||
    !showPreorder ||
    showDealsOnly ||
    showBestsellersOnly ||
    searchQuery.trim() !== "";

  // Color groups to show (collapsed by default)
  const TOP_COLORS = 6;
  const visibleColorGroups = showAllColors
    ? availableColorGroups
    : availableColorGroups.slice(0, TOP_COLORS);

  const filterPanel = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900 text-sm uppercase tracking-wide">
          Filters
        </h3>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Reset
          </button>
        )}
      </div>

      {/* Delivery tier filter chips */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Availability
        </h4>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setShowFast(!showFast);
              pushEvent(CTA_EVENTS.filter_change, { filter_type: "delivery_fast", filter_action: showFast ? "remove" : "add" });
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
              showFast
                ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                : "bg-white border-slate-200 text-slate-400"
            }`}
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${showFast ? "bg-emerald-600 border-emerald-600" : "border-slate-300"}`}>
              {showFast && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </span>
            <span>
              <span className="block font-semibold">In stock · ships in ~4 days</span>
              <span className="text-slate-400 font-normal">Layer 1 &amp; 2 — ready inventory</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowPreorder(!showPreorder);
              pushEvent(CTA_EVENTS.filter_change, { filter_type: "delivery_preorder", filter_action: showPreorder ? "remove" : "add" });
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-colors text-left ${
              showPreorder
                ? "bg-amber-50 border-amber-300 text-amber-800"
                : "bg-white border-slate-200 text-slate-400"
            }`}
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${showPreorder ? "bg-amber-500 border-amber-500" : "border-slate-300"}`}>
              {showPreorder && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10"><path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </span>
            <span>
              <span className="block font-semibold">Pre-order · ships in ~14 days</span>
              <span className="text-slate-400 font-normal">Layer 3 — full catalog</span>
            </span>
          </button>
        </div>
      </div>

      {/* Quick filters: Deals & Bestsellers */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setShowDealsOnly(!showDealsOnly);
            pushEvent(CTA_EVENTS.filter_change, { filter_type: "deals_only", filter_action: showDealsOnly ? "remove" : "add" });
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            showDealsOnly
              ? "bg-amber-50 border-amber-300 text-amber-700"
              : "bg-white border-slate-200 text-slate-600 hover:border-amber-200 hover:bg-amber-50/50"
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          Deals
        </button>
        <button
          type="button"
          onClick={() => {
            setShowBestsellersOnly(!showBestsellersOnly);
            pushEvent(CTA_EVENTS.filter_change, { filter_type: "bestsellers_only", filter_action: showBestsellersOnly ? "remove" : "add" });
          }}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all border ${
            showBestsellersOnly
              ? "bg-emerald-50 border-emerald-300 text-emerald-700"
              : "bg-white border-slate-200 text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50"
          }`}
        >
          <Star className="w-3.5 h-3.5" />
          Bestsellers
        </button>
      </div>

      {/* Category */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Category
        </h4>
        <ul className="space-y-1">
          {ALL_CATEGORIES.map((cat) => (
            <li key={cat}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={categoryFilter.includes(cat)}
                  onChange={() => toggleArray(categoryFilter, cat, setCategoryFilter, "category")}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-sm text-slate-700">{cat}</span>
                <span className="text-xs text-slate-400 ml-auto">{categoryCounts.get(cat) || 0}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* Price range */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Price per stem
        </h4>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="Min"
            value={priceMin === "" ? "" : priceMin}
            onChange={(e) =>
              setPriceMin(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
          <span className="text-slate-400 text-xs">to</span>
          <input
            type="number"
            min={0}
            step={0.01}
            placeholder="Max"
            value={priceMax === "" ? "" : priceMax}
            onChange={(e) =>
              setPriceMax(e.target.value === "" ? "" : Number(e.target.value))
            }
            className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
          />
        </div>
      </div>

      {/* Color (simplified groups — at the bottom per Facu's feedback) */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Color
        </h4>
        <ul className="space-y-1">
          {visibleColorGroups.map((cg) => (
            <li key={cg}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={colorGroupFilter.includes(cg)}
                  onChange={() =>
                    toggleArray(colorGroupFilter, cg, setColorGroupFilter, "color")
                  }
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                />
                <span className="text-sm text-slate-700">{cg}</span>
                <span className="text-xs text-slate-400 ml-auto">{colorGroupCounts.get(cg) || 0}</span>
              </label>
            </li>
          ))}
        </ul>
        {availableColorGroups.length > TOP_COLORS && (
          <button
            type="button"
            onClick={() => setShowAllColors(!showAllColors)}
            className="mt-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            {showAllColors
              ? "Show fewer"
              : `Show all ${availableColorGroups.length} colors`}
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showAllColors ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Sample box CTA — hidden on mobile (TopBanner already shows it) */}
        <div className="hidden sm:block">
          <SampleBoxCTA />
        </div>

        {/* Popular Right Now — curated bestsellers. EXP-026: hidden on small mobile (products below fold) */}
        {popularProducts.length > 0 && !searchQuery && categoryFilter.length === 0 && colorGroupFilter.length === 0 && (
          <div className="hidden sm:block mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Popular Right Now</h2>
              <button
                type="button"
                onClick={() => setShowBestsellersOnly(true)}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
              >
                See all bestsellers →
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-hide -mx-1 px-1 snap-x snap-mandatory">
              {popularProducts.map((group) => {
                const imgSrc = group.image || "/Floropolis-logo-only.png";
                const displayPrice = group.is_on_deal && group.dealPrice != null
                  ? group.dealPrice
                  : group.minPrice;
                return (
                  <Link
                    key={group.key}
                    href={`/shop/${group.slug}`}
                    className="flex-none w-40 sm:w-48 snap-start bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group/pop"
                    onClick={() => pushEvent(CTA_EVENTS.product_click, {
                      product_name: group.name,
                      product_category: group.category,
                      product_price: displayPrice,
                      cta_location: "popular_section",
                    })}
                  >
                    <div className="aspect-square relative bg-slate-50 overflow-hidden">
                      <Image
                        src={imgSrc}
                        alt={group.name}
                        fill
                        className="object-contain group-hover/pop:scale-105 transition-transform"
                        sizes="192px"
                        unoptimized
                      />
                      {group.bestseller && (
                        <span className="absolute top-1.5 left-1.5 bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                          Popular
                        </span>
                      )}
                    </div>
                    <div className="p-2.5">
                      <h3 className="font-semibold text-slate-900 text-xs leading-tight line-clamp-1 group-hover/pop:text-emerald-600 transition-colors">
                        {group.name}
                      </h3>
                      <p className="text-[10px] text-slate-400 mt-0.5">{group.category}</p>
                      <p className="text-sm font-bold text-emerald-600 mt-1">
                        ${displayPrice.toFixed(2)}<span className="text-[10px] font-normal text-slate-400">/{group.category === "Bouquets" ? "bouquet" : group.unit === "Bunch" ? "bunch" : group.unit === "Box" ? "box" : "stem"}</span>
                      </p>
                      {/* EXP-038: Shipping included on Popular cards — consistency */}
                      {displayPrice > 0 && <p className="text-[9px] text-emerald-600 mt-0.5">✓ Shipping included</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar: desktop */}
          <aside className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-24 rounded-xl border border-slate-200 bg-slate-50/50 p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
              {filterPanel}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {/* Mobile quick-filter chips — single scrollable row (saves ~52px vs 2 rows) */}
            <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-2 scrollbar-hide -mx-1 px-1">
              <button
                type="button"
                onClick={() => { setShowFast(!showFast); pushEvent(CTA_EVENTS.filter_change, { filter_type: "delivery_fast", filter_action: showFast ? "remove" : "add" }); }}
                className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${showFast ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"}`}
              >
                In Stock
              </button>
              <button
                type="button"
                onClick={() => { setShowPreorder(!showPreorder); pushEvent(CTA_EVENTS.filter_change, { filter_type: "delivery_preorder", filter_action: showPreorder ? "remove" : "add" }); }}
                className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${showPreorder ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:border-amber-300"}`}
              >
                Pre-Order
              </button>
              <button
                type="button"
                onClick={() => { setShowDealsOnly(!showDealsOnly); pushEvent(CTA_EVENTS.filter_change, { filter_type: "deals_only", filter_action: showDealsOnly ? "remove" : "add" }); }}
                className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${showDealsOnly ? "bg-amber-500 text-white border-amber-500" : "bg-white text-slate-500 border-slate-200 hover:border-amber-300"}`}
              >
                Deals
              </button>
              <button
                type="button"
                onClick={() => { setShowBestsellersOnly(!showBestsellersOnly); pushEvent(CTA_EVENTS.filter_change, { filter_type: "bestsellers_only", filter_action: showBestsellersOnly ? "remove" : "add" }); }}
                className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${showBestsellersOnly ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-slate-500 border-slate-200 hover:border-emerald-300"}`}
              >
                Bestsellers
              </button>
              {/* Separator */}
              <span className="flex-none w-px bg-slate-200 mx-0.5 self-stretch" aria-hidden />
              {["Rose", "Tropicals", "Greens & Foliage", "Delphinium", "Ranunculus", "Anemone", "Hydrangea"].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleArray(categoryFilter, cat, setCategoryFilter, "category")}
                  className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    categoryFilter.includes(cat)
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  {cat === "Greens & Foliage" ? "Greens" : cat}
                </button>
              ))}
            </div>
            {/* Color chips: hidden on small mobile (use drawer instead), shown on tablet */}
            <div className="hidden sm:flex lg:hidden gap-2 overflow-x-auto pb-2 mb-3 scrollbar-hide -mx-1 px-1">
              {availableColorGroups.slice(0, 8).map((cg) => (
                <button
                  key={cg}
                  type="button"
                  onClick={() => toggleArray(colorGroupFilter, cg, setColorGroupFilter, "color")}
                  className={`flex-none px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    colorGroupFilter.includes(cg)
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  {cg}
                </button>
              ))}
            </div>

            {/* In-page search — filters the grid without triggering GA4 page views */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search within results…"
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                aria-label="Filter products by name, variety, or color"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* EXP-044: Category context header — when single category is filtered, show "Showing: [Category] · N varieties" */}
            {categoryFilter.length === 1 && !searchQuery.trim() && (
              <div className="flex items-center justify-between mb-3 px-3 py-2 bg-emerald-50 rounded-lg border border-emerald-100">
                <p className="text-sm font-semibold text-emerald-800">
                  Showing: <span className="font-bold">{categoryFilter[0]}</span>
                  <span className="font-normal text-emerald-600 ml-1">· {sortedGroups.length} {sortedGroups.length !== 1 ? "varieties" : "variety"}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setCategoryFilter([])}
                  className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                >
                  Show all →
                </button>
              </div>
            )}

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <p className="text-sm text-slate-600 font-medium">
                {sortedGroups.length} variet{sortedGroups.length !== 1 ? "ies" : "y"}
                {searchQuery.trim() && <span className="text-slate-400 font-normal"> matching &ldquo;{searchQuery.trim()}&rdquo;</span>}
                <Link href="/quote" className="ml-3 text-emerald-600 hover:text-emerald-700 text-xs font-semibold hidden sm:inline">
                  Can't find it? Custom quote →
                </Link>
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(true)}
                  className="lg:hidden flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Filters
                </button>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {sortedGroups.map((group) => (
                <VarietyCard key={group.key} group={group} />
              ))}
            </div>

            {sortedGroups.length === 0 && (
              <div className="text-center py-16">
                <p className="text-lg font-medium text-slate-700">
                  {searchQuery.trim()
                    ? `No results for "${searchQuery.trim()}"`
                    : "No products match your filters."}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  {searchQuery.trim()
                    ? "We may carry it — not everything is listed yet."
                    : "Try clearing filters or browsing a different category."}
                </p>
                <div className="mt-5 flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/quote"
                    className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Request a custom quote →
                  </Link>
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex items-center justify-center gap-1.5 border border-slate-200 text-slate-600 text-sm px-5 py-2.5 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Clear all filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* EXP-064: "Don't see your variety?" callout — captures florists who browsed but didn't find what they needed */}
      {sortedGroups.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 py-6 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
            <div>
              <p className="font-semibold text-slate-900 text-sm">Don&apos;t see the variety you&apos;re looking for?</p>
              <p className="text-xs text-slate-600 mt-0.5">We source 270+ varieties farm-direct. Tell us what you need and we&apos;ll find it.</p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Link
                href="/quote"
                className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                onClick={() => pushEvent("custom_request_click", { source: "shop_bottom" })}
              >
                Request Custom Order
              </Link>
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hi! I'm looking for a specific flower variety and don't see it in the catalog.")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 border border-emerald-300 text-emerald-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-emerald-50 transition-colors"
                onClick={() => pushEvent("custom_request_whatsapp_click", { source: "shop_bottom" })}
              >
                Chat on WhatsApp
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Mobile filter drawer */}
      {mobileFiltersOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden
          />
          <div className="fixed inset-y-0 left-0 w-full max-w-sm bg-white shadow-xl z-50 overflow-y-auto lg:hidden">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-900">Filters</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                aria-label="Close filters"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">{filterPanel}</div>
          </div>
        </>
      )}

      {/* FAQ — content matches FAQPage JSON-LD schema in layout.tsx for Google rich results */}
      <section className="max-w-3xl mx-auto px-4 py-12">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Frequently Asked Questions</h2>
        <div className="space-y-5 text-sm">
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Do I need an account to see wholesale flower prices?</h3>
            <p className="text-slate-600">No — all prices are shown openly on floropolis.com. No registration, no login required. Browse our full catalog of roses, tropicals, and greens with transparent per-stem pricing.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">What&apos;s the minimum order for wholesale flowers?</h3>
            <p className="text-slate-600">No minimum order. You can order a single bunch or hundreds of boxes — free shipping applies regardless of order size.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">How does wholesale flower ordering work?</h3>
            <p className="text-slate-600">Browse the catalog, add items to your quote, and submit. We confirm within 1 hour (Mon–Fri, 8 AM – 6 PM ET) and coordinate delivery. Flowers ship farm-direct to your door in 4 days.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">What types of wholesale flowers do you carry?</h3>
            <p className="text-slate-600">We carry roses (30+ varieties), tropical flowers (heliconias, gingers, birds of paradise, anthuriums), greens and foliage (eucalyptus, monsteras, ferns), delphiniums, ranunculus, anemones, and combo boxes from Magic Flowers.</p>
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 mb-1">Is shipping included in the wholesale flower price?</h3>
            <p className="text-slate-600">Yes. All prices shown on Floropolis include FedEx Priority shipping from Ecuador to your door. No surprise freight charges at checkout.</p>
          </div>
        </div>
      </section>

      <Footer />
      <QuoteBar />
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-slate-500">
          Loading…
        </div>
      }
    >
      <ShopPageContent />
    </Suspense>
  );
}

function VarietyCard({ group }: { group: VarietyGroup }) {
  const imgSrc = group.image || "/Floropolis-logo-only.png";

  const hasPriceRange = group.minPrice !== group.maxPrice;
  const displayPrice = group.is_on_deal && group.dealPrice != null
    ? group.dealPrice
    : group.minPrice;

  const earliestDate = getEarliestDeliveryDate(group.tier);

  return (
    <Link
      href={`/shop/${group.slug}`}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group flex flex-col"
      onClick={() => pushEvent(CTA_EVENTS.product_click, {
        product_name: group.name,
        product_category: group.category,
        product_price: displayPrice,
      })}
    >
      <div className="block aspect-square relative bg-slate-50 overflow-hidden">
        <Image
          src={imgSrc}
          alt={group.name}
          fill
          className="object-contain group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          unoptimized
        />
        {group.bestseller && (
          <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
            Bestseller
          </span>
        )}
        {group.is_on_deal && group.deal_label && (
          <span className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
            {group.deal_label}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col flex-1">
        <h3 className="font-semibold text-slate-900 text-sm leading-tight group-hover:text-emerald-600 transition-colors line-clamp-2">
          {group.name}
        </h3>
        <p className="text-xs font-medium text-emerald-700 mt-0.5">{group.category}</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          {group.hasPriceIssue && group.minPrice === 0 ? (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              Price pending
            </span>
          ) : (
            <>
              {group.compareAtPrice != null && group.compareAtPrice > displayPrice && (
                <span className="text-xs text-slate-400 line-through">
                  ${group.compareAtPrice.toFixed(2)}
                </span>
              )}
              <span className="text-base font-bold text-emerald-600">
                {hasPriceRange && !group.is_on_deal
                  ? `$${group.minPrice.toFixed(2)}–$${group.maxPrice.toFixed(2)}`
                  : `$${displayPrice.toFixed(2)}`}
                <span className="text-xs font-normal text-slate-500">
                  /{group.category === "Bouquets" ? "bouquet" : group.unit === "Bunch" ? "bunch" : group.unit === "Box" ? "box" : "stem"}
                </span>
              </span>
            </>
          )}
        </div>
        {/* EXP-027: Shipping-included signal — key differentiator vs competitors */}
        {!group.hasPriceIssue && group.minPrice > 0 && (
          <p className="text-[10px] text-emerald-600 mt-0.5">✓ Shipping included</p>
        )}
        {/* EXP-033: Delivery date more prominent — decision signal for event florists */}
        <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
          {group.tier === "T1" || group.tier === "T2" ? (
            <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
              In Stock
            </span>
          ) : (
            <span className="text-amber-600 font-semibold">Pre-Order</span>
          )}
          <span className="text-slate-500">· Ready {formatDeliveryDate(earliestDate)}</span>
          {group.variantCount > 1 && (
            <span className="text-slate-400">· {group.variantCount} options</span>
          )}
        </p>
        {/* EXP-053: "Select Size →" is clearer than "View Options →" for B2B florists choosing stem length */}
        <span className="mt-auto pt-3 block w-full bg-emerald-600 text-white py-2 rounded-lg font-semibold group-hover:bg-emerald-700 transition-all text-center text-xs">
          Select Size →
        </span>
      </div>
    </Link>
  );
}
