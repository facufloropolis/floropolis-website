"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { SlidersHorizontal, X, ChevronDown, Package, Flame, Star } from "lucide-react";
import { products as catalogProducts, type Product } from "@/lib/data/products";
import { getGroupedProducts } from "@/lib/data/product-helpers";
import { pushEvent, CTA_EVENTS } from "@/lib/gtm";
import { PRODUCT_IMAGES_BASE_URL } from "@/lib/catalog-constants";
import { getProductImage } from "@/lib/product-images";
import {
  getSliderDeliveryDates,
  getEarliestDeliveryDate,
  formatDeliveryDate,
  isAvailableByDate,
  isAvailableInRange,
  toISODate,
} from "@/lib/delivery-dates";

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
  "Scabiosa",
  "Thistle",
  "Bells of Ireland",
  "Craspedia",
  "Larkspur",
];

const ALL_CATEGORIES = (() => {
  const cats = new Set<string>();
  for (const p of catalogProducts) {
    cats.add(p.category);
  }
  // Return in TAM order, then any unlisted categories at the end
  const ordered = CATEGORY_TAM_ORDER.filter((c) => cats.has(c));
  for (const c of cats) {
    if (!ordered.includes(c)) ordered.push(c);
  }
  return ordered;
})();

// Group products by variety+color for one-card-per-variety display
interface VarietyGroup {
  key: string;
  name: string;
  variety: string;
  color: string;
  category: string;
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
}

function buildVarietyGroups(): VarietyGroup[] {
  const groups = new Map<string, Product[]>();
  for (const p of catalogProducts) {
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
  const searchParams = useSearchParams();

  // Delivery date range slider — from/to window
  const sliderDates = useMemo(() => getSliderDeliveryDates(), []);
  const [sliderFrom, setSliderFrom] = useState(0);
  const [sliderTo, setSliderTo] = useState(sliderDates.length - 1);
  const dateFrom = sliderDates[sliderFrom] || sliderDates[0];
  const dateTo = sliderDates[sliderTo] || sliderDates[sliderDates.length - 1];

  const varietyGroups = useMemo(() => buildVarietyGroups(), []);

  // Available color groups from current products
  const availableColorGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const g of varietyGroups) {
      groups.add(g.colorGroup);
    }
    return Object.keys(COLOR_GROUPS).filter((cg) => groups.has(cg));
  }, [varietyGroups]);

  const router = useRouter();
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
    setFiltersInitialized(true);
  }, [searchParams]);

  // Sync filters to URL
  useEffect(() => {
    if (!filtersInitialized) return;
    const params = new URLSearchParams();
    if (categoryFilter.length) params.set("category", categoryFilter.join(","));
    if (colorGroupFilter.length) params.set("color", colorGroupFilter.join(","));
    if (showDealsOnly) params.set("deals", "1");
    if (showBestsellersOnly) params.set("bestsellers", "1");
    if (sortBy !== "recommended") params.set("sort", sortBy);
    const qs = params.toString();
    const newUrl = qs ? `/shop?${qs}` : "/shop";
    router.replace(newUrl, { scroll: false });
  }, [categoryFilter, colorGroupFilter, showDealsOnly, showBestsellersOnly, sortBy, router, filtersInitialized]);

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

    // Delivery date range filter — show products deliverable within window
    if (dateFrom && dateTo) {
      list = list.filter((g) => isAvailableInRange(g.tier, dateFrom, dateTo));
    }

    if (showDealsOnly) {
      list = list.filter((g) => g.is_on_deal);
    }
    if (showBestsellersOnly) {
      list = list.filter((g) => g.bestseller);
    }
    if (categoryFilter.length) {
      list = list.filter((g) => categoryFilter.includes(g.category));
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
  }, [categoryFilter, colorGroupFilter, priceMin, priceMax, dateFrom, dateTo, showDealsOnly, showBestsellersOnly, varietyGroups]);

  const sortedGroups = useMemo(() => {
    const list = [...filteredGroups];
    switch (sortBy) {
      case "recommended":
        return list.sort((a, b) => {
          // Products with photos first
          if (a.has_photo !== b.has_photo) return a.has_photo ? -1 : 1;
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
    setSliderFrom(0);
    setSliderTo(sliderDates.length - 1);
    setShowDealsOnly(false);
    setShowBestsellersOnly(false);
  };

  const hasActiveFilters =
    categoryFilter.length > 0 ||
    colorGroupFilter.length > 0 ||
    priceMin !== "" ||
    priceMax !== "" ||
    sliderFrom !== 0 ||
    sliderTo !== sliderDates.length - 1 ||
    showDealsOnly ||
    showBestsellersOnly;

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

      {/* Delivery date range */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Delivery window
        </h4>
        <div className="px-1 space-y-2">
          <div>
            <label className="text-[10px] text-slate-500 font-medium">From</label>
            <input
              type="range"
              min={0}
              max={sliderDates.length - 1}
              step={1}
              value={sliderFrom}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSliderFrom(Math.min(v, sliderTo));
              }}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-500 font-medium">To</label>
            <input
              type="range"
              min={0}
              max={sliderDates.length - 1}
              step={1}
              value={sliderTo}
              onChange={(e) => {
                const v = Number(e.target.value);
                setSliderTo(Math.max(v, sliderFrom));
              }}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{sliderDates[0] ? formatDeliveryDate(sliderDates[0]) : ""}</span>
            <span>
              {sliderDates[sliderDates.length - 1]
                ? formatDeliveryDate(sliderDates[sliderDates.length - 1])
                : ""}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs font-medium text-emerald-700">
          {dateFrom && dateTo
            ? `${formatDeliveryDate(dateFrom)} → ${formatDeliveryDate(dateTo)}`
            : ""}
        </p>
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
        {/* Sample box CTA with scarcity countdown */}
        <SampleBoxCTA />

        <div className="flex gap-8">
          {/* Sidebar: desktop */}
          <aside className="hidden lg:block w-52 flex-shrink-0">
            <div className="sticky top-24 rounded-xl border border-slate-200 bg-slate-50/50 p-4 max-h-[calc(100vh-120px)] overflow-y-auto">
              {filterPanel}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <p className="text-sm text-slate-600 font-medium">
                {sortedGroups.length} variet{sortedGroups.length !== 1 ? "ies" : "y"}
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
              <div className="text-center py-16 text-slate-500">
                <p className="text-lg font-medium">No products match your filters.</p>
                <p className="text-sm mt-1">
                  Try selecting a later delivery date or clearing filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-3 text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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

      <Footer />
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
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg transition-all group flex flex-col">
      <Link
        href={`/shop/${group.slug}`}
        className="block aspect-square relative bg-slate-50 overflow-hidden"
        onClick={() => pushEvent(CTA_EVENTS.product_click, {
          product_name: group.name,
          product_category: group.category,
          product_price: displayPrice,
        })}
      >
        <Image
          src={imgSrc}
          alt={group.name}
          fill
          className="object-contain group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          unoptimized={imgSrc.startsWith("http")}
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
      </Link>
      <div className="p-3 flex flex-col flex-1">
        <Link href={`/shop/${group.slug}`}>
          <h3 className="font-semibold text-slate-900 text-sm leading-tight hover:text-emerald-600 transition-colors line-clamp-2">
            {group.name}
          </h3>
        </Link>
        <p className="text-xs text-slate-400 mt-0.5">{group.category}</p>
        <div className="mt-2 flex items-baseline gap-1.5">
          {group.hasPriceIssue && group.minPrice === 0 ? (
            <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
              Price pending
            </span>
          ) : (
            <>
              {group.is_on_deal && group.dealPrice != null && group.dealPrice < group.originalMinPrice && (
                <span className="text-xs text-slate-400 line-through">
                  ${group.originalMinPrice.toFixed(2)}
                </span>
              )}
              <span className="text-base font-bold text-emerald-600">
                {hasPriceRange && !group.is_on_deal
                  ? `$${group.minPrice.toFixed(2)}–$${group.maxPrice.toFixed(2)}`
                  : `$${displayPrice.toFixed(2)}`}
                <span className="text-xs font-normal text-slate-500">/stem</span>
              </span>
            </>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          {formatDeliveryDate(earliestDate)}
          {group.variantCount > 1 && (
            <span> · {group.variantCount} options</span>
          )}
        </p>
        <Link
          href={`/shop/${group.slug}`}
          className="mt-auto pt-3 block w-full bg-emerald-600 text-white py-2 rounded-lg font-semibold hover:bg-emerald-700 transition-all text-center text-xs"
        >
          View Options →
        </Link>
      </div>
    </div>
  );
}
