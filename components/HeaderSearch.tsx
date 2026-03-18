"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Search, X, Clock, TrendingUp } from "lucide-react";
import {
  searchProducts,
  searchCategories,
  getCategoryPageUrl,
  getRecentSearches,
  addRecentSearch,
  clearRecentSearches,
  POPULAR_SEARCHES,
  type ProductCategory,
} from "@/lib/shop-search";
import type { ShopProduct } from "@/lib/shop-products";

const MAX_PRODUCT_RESULTS = 8;
const MAX_CATEGORY_RESULTS = 4;

export default function HeaderSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const showDropdown = isOpen && (isFocused || query.length > 0);

  const productResults = useMemo(
    () => (query.trim() ? searchProducts(query).slice(0, MAX_PRODUCT_RESULTS) : []),
    [query]
  );
  const categoryResults = useMemo(
    () => (query.trim() ? searchCategories(query).slice(0, MAX_CATEGORY_RESULTS) : []),
    [query]
  );

  useEffect(() => {
    setRecent(getRecentSearches());
  }, [showDropdown]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (type: "product" | "category" | "popular" | "recent", value: string, href: string) => {
    addRecentSearch(value);
    setQuery("");
    setIsOpen(false);
    setIsFocused(false);
    if (href.startsWith("http")) {
      window.location.href = href;
    }
    // If same page Link, navigation happens via Link
  };

  const showRecentOrPopular = showDropdown && !query.trim();
  const showResults = showDropdown && query.trim().length > 0;
  const hasResults = productResults.length > 0 || categoryResults.length > 0;

  return (
    <div
      ref={containerRef}
      className={`
        relative flex-1 max-w-md mx-2 md:mx-4
        ${isFocused ? "z-50" : ""}
      `}
    >
      <div
        className={`
          relative z-[70] flex items-center rounded-lg border bg-slate-50
          transition-all duration-200
          md:border-slate-200 md:bg-white
          ${isFocused ? "border-emerald-400 ring-2 ring-emerald-200 md:ring-1" : "border-slate-200"}
          w-full
        `}
      >
        <Search className="w-5 h-5 text-slate-400 ml-3 flex-shrink-0" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            setIsOpen(true);
            setIsFocused(true);
          }}
          onBlur={() => {
            // Delay so link click can fire
            setTimeout(() => setIsFocused(false), 150);
          }}
          placeholder="Search products, varieties, colors…"
          className="w-full py-2.5 pl-2 pr-4 bg-transparent text-slate-900 placeholder-slate-400 outline-none text-sm"
          aria-label="Search products"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="p-1.5 text-slate-400 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {isFocused && (
          <button
            type="button"
            onClick={() => { setQuery(""); setIsOpen(false); setIsFocused(false); }}
            className="md:hidden ml-1 text-sm font-medium text-slate-500 hover:text-slate-700"
            aria-label="Close search"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          className="
            absolute left-0 right-0 top-full mt-1 py-2 bg-white border border-slate-200 rounded-xl shadow-xl
            max-h-[min(70vh,420px)] overflow-y-auto
            z-[80]
          "
          role="listbox"
        >
          {showRecentOrPopular && (
            <>
              {recent.length > 0 && (
                <div className="px-3 pb-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Recent
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearRecentSearches();
                        setRecent([]);
                      }}
                      className="text-xs text-slate-500 hover:text-emerald-600"
                    >
                      Clear
                    </button>
                  </div>
                  <ul className="space-y-0.5">
                    {recent.map((term) => {
                      const productHit = searchProducts(term)[0];
                      const categoryHit = searchCategories(term)[0];
                      const href = productHit
                        ? `/shop/${productHit.id}`
                        : categoryHit
                          ? getCategoryPageUrl(categoryHit)
                          : `/shop?category=${encodeURIComponent(term)}`;
                      return (
                        <li key={term}>
                          <Link
                            href={href}
                            onClick={() => handleSelect("recent", term, href)}
                            className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
                          >
                            {term}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              <div className="px-3 pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 flex items-center gap-1.5 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />
                  Popular
                </span>
                <ul className="space-y-0.5">
                  {POPULAR_SEARCHES.map(({ label, href }) => (
                    <li key={label}>
                      <Link
                        href={href}
                        onClick={() => handleSelect("popular", label, href)}
                        className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {showResults && (
            <>
              {categoryResults.length > 0 && (
                <div className="px-3 pb-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-3 block mb-1.5">
                    Categories
                  </span>
                  <ul className="space-y-0.5">
                    {categoryResults.map((cat) => (
                      <CategoryRow
                        key={cat}
                        category={cat}
                        onSelect={() => handleSelect("category", cat, getCategoryPageUrl(cat))}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {productResults.length > 0 && (
                <div className="px-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 px-3 block mb-1.5">
                    Products
                  </span>
                  <ul className="space-y-0.5">
                    {productResults.map((p) => (
                      <ProductRow
                        key={p.id}
                        product={p}
                        onSelect={() => handleSelect("product", p.name, `/shop/${p.id}`)}
                      />
                    ))}
                  </ul>
                </div>
              )}
              {!hasResults && categoryResults.length === 0 && (
                <p className="px-4 py-6 text-sm text-slate-500 text-center">
                  No products or categories match &quot;{query}&quot;
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  onSelect,
}: {
  category: ProductCategory;
  onSelect: () => void;
}) {
  const href = getCategoryPageUrl(category);
  return (
    <li>
      <Link
        href={href}
        onClick={onSelect}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
      >
        <span className="font-medium">{category}</span>
        <span className="text-slate-400 text-xs">Category</span>
      </Link>
    </li>
  );
}

function ProductRow({
  product,
  onSelect,
}: {
  product: ShopProduct;
  onSelect: () => void;
}) {
  return (
    <li>
      <Link
        href={`/shop/${product.id}`}
        onClick={onSelect}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-800"
      >
        <span className="font-medium">{product.name}</span>
        <span className="text-slate-500 truncate">{product.variety}</span>
        <span className="text-slate-400 text-xs flex-shrink-0">{product.category}</span>
      </Link>
    </li>
  );
}
