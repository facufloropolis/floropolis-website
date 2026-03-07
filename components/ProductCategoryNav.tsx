"use client";

import type React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Category = {
  id: string;
  label: string;
  price: string;
  emoji: string;
  /** When set, links to /shop?category=Label for grid filtering */
  shopCategory?: string;
  /** When set, links to this path instead of /shop?category= (e.g. /shop/tropicals) */
  dedicatedPath?: string;
  externalUrl?: string;
};

const CATEGORIES: Category[] = [
  { id: "roses", label: "Roses", price: "From $1.30/stem", emoji: "🌹", shopCategory: "Roses" },
  { id: "ranunculus", label: "Ranunculus", price: "From $1.21/stem", emoji: "🌼", shopCategory: "Ranunculus" },
  { id: "anemone", label: "Anemone", price: "From $1.35/stem", emoji: "✨", shopCategory: "Anemone" },
  { id: "delphinium", label: "Delphinium", price: "From $2.85/stem", emoji: "🪻", shopCategory: "Delphinium" },
  { id: "tropicals", label: "Tropicals", price: "From $0.63/stem", emoji: "🌴", dedicatedPath: "/shop/tropicals" },
  { id: "greens-foliage", label: "Greens & Foliage", price: "From $0.13/stem", emoji: "🌿", dedicatedPath: "/shop/greens" },
  { id: "bouquets", label: "Bouquets", price: "From $0.60/stem", emoji: "💐", shopCategory: "Bouquets" },
  { id: "mixed-boxes", label: "Mixed Boxes", price: "From $0.60/stem", emoji: "📦", dedicatedPath: "/shop/combo-boxes" },
  {
    id: "gypsophila",
    label: "Gypsophila",
    price: "From $0.40/stem",
    emoji: "☁️",
    externalUrl: "/shop",
  },
];

export default function ProductCategoryNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");

  return (
    <section className="bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-slate-500">
          Shop by category
        </div>
        <div className="flex gap-3 overflow-x-auto md:grid md:grid-cols-9 md:gap-4">
          {CATEGORIES.map((category) => {
            const isActive = category.dedicatedPath
              ? pathname === category.dedicatedPath
              : category.shopCategory != null && categoryParam === category.shopCategory;

            if (category.externalUrl) {
              return (
                <a
                  key={category.id}
                  href={category.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex-shrink-0 w-40 md:w-auto md:h-full rounded-2xl border px-3 py-3 text-left transition-all shadow-sm hover:shadow-md bg-white ${
                    isActive ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                        isActive ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {category.emoji}
                    </div>
                    <div className="text-sm font-semibold text-slate-900">{category.label}</div>
                  </div>
                  <div className="text-xs font-medium text-emerald-700">{category.price}</div>
                </a>
              );
            }

            const href = category.dedicatedPath
              ? category.dedicatedPath
              : category.shopCategory
                ? `/shop?category=${encodeURIComponent(category.shopCategory)}`
                : "/shop";

            return (
              <Link
                key={category.id}
                href={href}
                className={`flex-shrink-0 w-40 md:w-auto md:h-full rounded-2xl border px-3 py-3 text-left transition-all shadow-sm hover:shadow-md bg-white ${
                  isActive ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-emerald-300"
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-lg ${
                      isActive ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {category.emoji}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{category.label}</div>
                </div>
                <div className="text-xs font-medium text-emerald-700">{category.price}</div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

