"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import TopBanner from "@/components/TopBanner";
import { SlidersHorizontal, X, ChevronDown, Package } from "lucide-react";
import { products as catalogProducts, type Product } from "@/lib/data/products";
import { getGroupedProducts } from "@/lib/data/product-helpers";
import { PRODUCT_IMAGES_BASE_URL } from "@/lib/catalog-constants";
import {
  getSliderDeliveryDates,
  getEarliestDeliveryDate,
  formatDeliveryDate,
  isAvailableByDate,
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

function resolveImage(pathList: string[]): string {
  const path = pathList[0];
  if (!path) return "/Floropolis-logo-only.png";
  if (path.startsWith("http") || path.startsWith("/")) return path;
  const base = PRODUCT_IMAGES_BASE_URL.replace(/\/$/, "");
  return `${base}/${path}`;
}

// Get all known categories from catalog
const ALL_CATEGORIES = (() => {
  const cats = new Map<string, number>();
  for (const p of catalogProducts) {
    cats.set(p.category, (cats.get(p.category) || 0) + 1);
  }
  return Array.from(cats.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
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
  image: string;
  has_photo: boolean;
  tier: string; // best (lowest = most available) tier in group
  bestseller: boolean;
  is_on_deal: boolean;
  deal_label: string | null;
  dealPrice: number | null;
  variantCount: number;
  slug: string; // slug of the representative product
  colorGroup: string;
}

function buildVarietyGroups(): VarietyGroup[] {
  const groups = new Map<string, Product[]>();
  for (const p of catalogProducts) {
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
    const bestTier = sorted.reduce((best, v) => {
      const order: Record<string, number> = { T1: 0, T2: 1, T3: 2, T4: 3 };
      return (order[v.tier] ?? 3) < (order[best] ?? 3) ? v.tier : best;
    }, rep.tier);

    const anyDeal = variants.some((v) => v.is_on_deal && v.deal_price != null);
    const dealVariant = variants.find((v) => v.is_on_deal && v.deal_price != null);

    const displayName = [rep.variety, rep.color].filter(Boolean).join(" ");

    result.push({
      key,
      name: displayName || rep.name,
      variety: rep.variety,
      color: rep.color,
      category: rep.category,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      image: resolveImage(rep.images || []),
      has_photo: rep.has_photo,
      tier: bestTier,
      bestseller: variants.some((v) => v.is_best_seller),
      is_on_deal: anyDeal,
      deal_label: dealVariant?.deal_label ?? null,
      dealPrice: dealVariant?.deal_price ?? null,
      variantCount: variants.length,
      slug: rep.slug,
      colorGroup: getColorGroup(rep.color),
    });
  }
  return result;
}

function ShopPageContent() {
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [colorGroupFilter, setColorGroupFilter] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState<number | "">("");
  const [priceMax, setPriceMax] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllColors, setShowAllColors] = useState(false);
  const searchParams = useSearchParams();

  // Delivery date slider
  const sliderDates = useMemo(() => getSliderDeliveryDates(), []);
  const [sliderIndex, setSliderIndex] = useState(0);
  const selectedDate = sliderDates[sliderIndex] || sliderDates[0];

  const varietyGroups = useMemo(() => buildVarietyGroups(), []);

  // Available color groups from current products
  const availableColorGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const g of varietyGroups) {
      groups.add(g.colorGroup);
    }
    return Object.keys(COLOR_GROUPS).filter((cg) => groups.has(cg));
  }, [varietyGroups]);

  // Sync category filter from URL
  useEffect(() => {
    const category = searchParams.get("category");
    if (category) {
      const match = ALL_CATEGORIES.find(
        (c) => c.toLowerCase() === category.toLowerCase(),
      );
      if (match) setCategoryFilter([match]);
    }
  }, [searchParams]);

  const toggleArray = <T,>(arr: T[], item: T, setter: (arr: T[]) => void) => {
    if (arr.includes(item)) setter(arr.filter((x) => x !== item));
    else setter([...arr, item]);
  };

  const filteredGroups = useMemo(() => {
    let list = [...varietyGroups];

    // Delivery date filter — show products available by selected date
    if (selectedDate) {
      list = list.filter((g) => isAvailableByDate(g.tier, selectedDate));
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
  }, [categoryFilter, colorGroupFilter, priceMin, priceMax, selectedDate, varietyGroups]);

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
    setSliderIndex(0);
  };

  const hasActiveFilters =
    categoryFilter.length > 0 ||
    colorGroupFilter.length > 0 ||
    priceMin !== "" ||
    priceMax !== "" ||
    sliderIndex !== 0;

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

      {/* Delivery date slider */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
          Delivery by
        </h4>
        <div className="px-1">
          <input
            type="range"
            min={0}
            max={sliderDates.length - 1}
            step={1}
            value={sliderIndex}
            onChange={(e) => setSliderIndex(Number(e.target.value))}
            className="w-full accent-emerald-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-1">
            <span>{sliderDates[0] ? formatDeliveryDate(sliderDates[0]) : ""}</span>
            <span>
              {sliderDates[sliderDates.length - 1]
                ? formatDeliveryDate(sliderDates[sliderDates.length - 1])
                : ""}
            </span>
          </div>
        </div>
        <p className="mt-1 text-xs font-medium text-emerald-700">
          {selectedDate ? `Showing items available by ${formatDeliveryDate(selectedDate)}` : ""}
        </p>
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
                  onChange={() => toggleArray(categoryFilter, cat, setCategoryFilter)}
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
                    toggleArray(colorGroupFilter, cg, setColorGroupFilter)
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
        {/* Sample box CTA for new visitors */}
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
          {group.is_on_deal && group.dealPrice != null && (
            <span className="text-xs text-slate-400 line-through">
              ${group.minPrice.toFixed(2)}
            </span>
          )}
          <span className="text-base font-bold text-emerald-600">
            {hasPriceRange && !group.is_on_deal
              ? `$${group.minPrice.toFixed(2)}–$${group.maxPrice.toFixed(2)}`
              : `$${displayPrice.toFixed(2)}`}
            <span className="text-xs font-normal text-slate-500">/stem</span>
          </span>
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
