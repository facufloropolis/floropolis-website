/**
 * Shop product catalog for the /shop grid.
 * Used for filtering, sorting, and display. Order-now links go to Komet (current ecommerce provider).
 */

const SHOP_BASE = "/shop";

export type ProductCategory =
  | "Rose"
  | "Ranunculus"
  | "Anemone"
  | "Delphinium"
  | "Tropicals"
  | "Greens & Foliage"
  | "Bouquets"
  | "Mixed Boxes"
  | (string & {}); // allow additional catalog categories

export type StemLength =
  | "30-40cm"
  | "40-50cm"
  | "50-60cm"
  | "60-70cm"
  | "70cm+";

/** Stem length options for detail page (40/50/60/70cm with prices) */
export type StemLengthOption = "40cm" | "50cm" | "60cm" | "70cm";

export type Availability = "In stock" | "Limited" | "Seasonal";

export interface StemLengthPrice {
  length: StemLengthOption;
  pricePerStem: number;
}

export interface ShopProduct {
  id: string;
  name: string;
  variety: string;
  category: ProductCategory;
  color: string;
  pricePerStem: number;
  /** Optional: deal price per stem when on promotion */
  dealPricePerStem?: number | null;
  stemsPerBunch: number;
  stemLength: StemLength;
  availability: Availability;
  image: string;
  /** Optional: true if catalog indicates a real photo exists */
  has_photo?: boolean;
  /** Komet campaign param for this product/category */
  campaign: string;
  /** For sort: 1 = newest, higher = more recent */
  addedOrder: number;
  /** For sort: true = bestseller */
  bestseller: boolean;
  /** Optional: catalog deal flags for badge/logic */
  is_on_deal?: boolean;
  deal_label?: string | null;
  /** Optional: multiple images for detail page gallery. Falls back to [image] if absent. */
  images?: string[];
  /** Optional: price per stem by length (40/50/60/70cm). Falls back to pricePerStem if absent. */
  stemLengthPrices?: StemLengthPrice[];
  /** Product tier: T1=available now, T2=5-day, T3=14-day, T4=special order */
  tier?: string;
}

function product(
  p: Omit<ShopProduct, "id"> & { id?: string }
): ShopProduct {
  return {
    ...p,
    id: p.id ?? p.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
  };
}

export const SHOP_PRODUCTS: ShopProduct[] = [
  // Roses
  product({
    name: "Freedom Red Rose",
    variety: "Ecoroses",
    category: "Rose",
    color: "Red",
    pricePerStem: 1.88,
    stemsPerBunch: 20,
    stemLength: "60-70cm",
    availability: "In stock",
    image: "/images/shop/Freedom.png",
    campaign: "Shop-Roses",
    addedOrder: 10,
    bestseller: true,
    images: ["/images/shop/Freedom.png"],
    stemLengthPrices: [
      { length: "40cm", pricePerStem: 1.52 },
      { length: "50cm", pricePerStem: 1.72 },
      { length: "60cm", pricePerStem: 1.88 },
      { length: "70cm", pricePerStem: 2.05 },
    ],
  }),
  product({
    name: "White Tibet",
    variety: "Ecoroses",
    category: "Rose",
    color: "White",
    pricePerStem: 1.3,
    stemsPerBunch: 25,
    stemLength: "40-50cm",
    availability: "In stock",
    image: "/images/shop/white-tibet-ai.png",
    campaign: "Shop-Roses",
    addedOrder: 12,
    bestseller: true,
    stemLengthPrices: [
      { length: "40cm", pricePerStem: 1.3 },
      { length: "50cm", pricePerStem: 1.38 },
      { length: "60cm", pricePerStem: 1.45 },
      { length: "70cm", pricePerStem: 1.55 },
    ],
  }),
  product({
    name: "Orange Crush",
    variety: "Ecoroses",
    category: "Rose",
    color: "Orange",
    pricePerStem: 1.45,
    stemsPerBunch: 25,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/orange-crush-ai.png",
    campaign: "Shop-Roses",
    addedOrder: 11,
    bestseller: false,
    stemLengthPrices: [
      { length: "40cm", pricePerStem: 1.38 },
      { length: "50cm", pricePerStem: 1.45 },
      { length: "60cm", pricePerStem: 1.52 },
      { length: "70cm", pricePerStem: 1.62 },
    ],
  }),
  product({
    name: "Lavender Deep Purple",
    variety: "Ecoroses",
    category: "Rose",
    color: "Lavender",
    pricePerStem: 1.45,
    stemsPerBunch: 25,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/lavender-deep-purple-ai.png",
    campaign: "Shop-Roses",
    addedOrder: 9,
    bestseller: false,
    stemLengthPrices: [
      { length: "40cm", pricePerStem: 1.38 },
      { length: "50cm", pricePerStem: 1.45 },
      { length: "60cm", pricePerStem: 1.52 },
      { length: "70cm", pricePerStem: 1.62 },
    ],
  }),
  product({
    name: "Pink Faith",
    variety: "Ecoroses",
    category: "Roses",
    color: "Pink",
    pricePerStem: 1.52,
    stemsPerBunch: 25,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/Pink_Floyd.png",
    campaign: "Shop-Roses",
    addedOrder: 8,
    bestseller: true,
    stemLengthPrices: [
      { length: "40cm", pricePerStem: 1.45 },
      { length: "50cm", pricePerStem: 1.52 },
      { length: "60cm", pricePerStem: 1.58 },
      { length: "70cm", pricePerStem: 1.68 },
    ],
  }),
  // Ranunculus
  product({
    name: "Rainbow Mix Ranunculus",
    variety: "Assorted",
    category: "Ranunculus",
    color: "Assorted",
    pricePerStem: 1.21,
    stemsPerBunch: 25,
    stemLength: "40-50cm",
    availability: "In stock",
    image: "/images/shop/Ranunculus_Red_FINAL.png",
    campaign: "Shop-Ranunculus",
    addedOrder: 7,
    bestseller: true,
  }),
  product({
    name: "Red Ranunculus",
    variety: "Mistral Rosso",
    category: "Ranunculus",
    color: "Red",
    pricePerStem: 1.21,
    stemsPerBunch: 25,
    stemLength: "40-50cm",
    availability: "In stock",
    image: "/images/shop/Ranunculus_Red_FINAL.png",
    campaign: "Shop-Ranunculus",
    addedOrder: 6,
    bestseller: false,
  }),
  product({
    name: "Hot Pink Ranunculus",
    variety: "Bright fuchsia",
    category: "Ranunculus",
    color: "Pink",
    pricePerStem: 1.35,
    stemsPerBunch: 25,
    stemLength: "40-50cm",
    availability: "In stock",
    image: "/images/shop/Ranunculus_Hot_Pink_FINAL.PNG",
    campaign: "Shop-Ranunculus",
    addedOrder: 5,
    bestseller: false,
  }),
  product({
    name: "Yellow Ranunculus",
    variety: "Bright & cheerful",
    category: "Ranunculus",
    color: "Yellow",
    pricePerStem: 1.28,
    stemsPerBunch: 25,
    stemLength: "40-50cm",
    availability: "In stock",
    image: "/images/shop/Ranunculus_Red_FINAL.png",
    campaign: "Shop-Ranunculus",
    addedOrder: 4,
    bestseller: false,
  }),
  // Anemone & Delphinium
  product({
    name: "Anemones Assorted",
    variety: "White, purple, pink",
    category: "Anemone",
    color: "Assorted",
    pricePerStem: 1.35,
    stemsPerBunch: 25,
    stemLength: "40-50cm",
    availability: "Seasonal",
    image: "/images/shop/Anemone_3.png",
    campaign: "Shop-Summer",
    addedOrder: 3,
    bestseller: false,
  }),
  product({
    name: "Delphinium Sea Waltz",
    variety: "Blue, white, lavender",
    category: "Delphinium",
    color: "Blue",
    pricePerStem: 2.85,
    stemsPerBunch: 10,
    stemLength: "60-70cm",
    availability: "Seasonal",
    image: "/images/shop/Delphinium%20Sea%20Waltz%20Dark%20Blue%20FINAL.png",
    campaign: "Shop-Summer",
    addedOrder: 2,
    bestseller: false,
  }),
  // Tropicals
  product({
    name: "Heliconia Fire Opal",
    variety: "Exotic tropical",
    category: "Tropicals",
    color: "Orange",
    pricePerStem: 0.93,
    stemsPerBunch: 5,
    stemLength: "70cm+",
    availability: "In stock",
    image: "/images/shop/heliconia-fire-opal.png",
    campaign: "Shop-Tropicals",
    addedOrder: 15,
    bestseller: true,
  }),
  product({
    name: "Heliconia Rostrata",
    variety: "Hanging tropical",
    category: "Tropicals",
    color: "Red",
    pricePerStem: 2.94,
    stemsPerBunch: 5,
    stemLength: "70cm+",
    availability: "In stock",
    image: "/images/shop/heliconia-rostrata.png",
    campaign: "Shop-Tropicals",
    addedOrder: 14,
    bestseller: true,
  }),
  product({
    name: "Ginger Nicole (Pink)",
    variety: "Exotic ginger",
    category: "Tropicals",
    color: "Pink",
    pricePerStem: 1.94,
    stemsPerBunch: 3,
    stemLength: "70cm+",
    availability: "In stock",
    image: "/images/shop/ginger-nicole-pink.PNG",
    campaign: "Shop-Tropicals",
    addedOrder: 13,
    bestseller: true,
  }),
  product({
    name: "Anthurium Assorted",
    variety: "10–14cm heads",
    category: "Tropicals",
    color: "Red",
    pricePerStem: 2.72,
    stemsPerBunch: 10,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/anthurium-red.jpg",
    campaign: "Shop-Tropicals",
    addedOrder: 1,
    bestseller: false,
  }),
  product({
    name: "French Kiss / Musa / Anana",
    variety: "Novelties",
    category: "Tropicals",
    color: "Assorted",
    pricePerStem: 0.63,
    stemsPerBunch: 10,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/french-kiss.png",
    campaign: "Shop-Tropicals",
    addedOrder: 16,
    bestseller: false,
  }),
  // Greens & Foliage
  product({
    name: "Willow Greens",
    variety: "Bulk foliage",
    category: "Greens & Foliage",
    color: "Green",
    pricePerStem: 0.13,
    stemsPerBunch: 2000,
    stemLength: "70cm+",
    availability: "In stock",
    image: "/images/shop/Greens.png",
    campaign: "Shop-Greens",
    addedOrder: 20,
    bestseller: true,
  }),
  product({
    name: "Pandanus Green & Variegated",
    variety: "Tropical accent",
    category: "Greens & Foliage",
    color: "Green",
    pricePerStem: 0.21,
    stemsPerBunch: 1900,
    stemLength: "60-70cm",
    availability: "In stock",
    image: "/images/shop/pandanus-variegated.jpg",
    campaign: "Shop-Greens",
    addedOrder: 19,
    bestseller: false,
  }),
  product({
    name: "Foliage Mix Box",
    variety: "Jungle / Amazon / Greenery",
    category: "Greens & Foliage",
    color: "Green",
    pricePerStem: 0.31,
    stemsPerBunch: 90,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/foliage-mix-box.png",
    campaign: "Shop-Greens",
    addedOrder: 18,
    bestseller: false,
  }),
  product({
    name: "Palm Areca",
    variety: "Foliage",
    category: "Greens & Foliage",
    color: "Green",
    pricePerStem: 0.39,
    stemsPerBunch: 500,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/palm-areca.jpg",
    campaign: "Shop-Greens",
    addedOrder: 17,
    bestseller: false,
  }),
  product({
    name: "Monstera",
    variety: "Iconic leaf",
    category: "Greens & Foliage",
    color: "Green",
    pricePerStem: 1.15,
    stemsPerBunch: 10,
    stemLength: "30-40cm",
    availability: "In stock",
    image: "/images/shop/monstera.jpg",
    campaign: "Shop-Greens",
    addedOrder: 21,
    bestseller: true,
  }),
  // Mixed Boxes (as products for grid)
  product({
    name: "Tabasco Combo Box",
    variety: "Flowers + Greens",
    category: "Mixed Boxes",
    color: "Assorted",
    pricePerStem: 0.6,
    stemsPerBunch: 113,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/shop-all-tropicals.png",
    campaign: "Shop-ComboBoxes",
    addedOrder: 22,
    bestseller: true,
  }),
  product({
    name: "Mini Fiesta Box",
    variety: "Flowers + Greens",
    category: "Mixed Boxes",
    color: "Assorted",
    pricePerStem: 0.75,
    stemsPerBunch: 50,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/shop-all-tropicals.png",
    campaign: "Shop-ComboBoxes",
    addedOrder: 23,
    bestseller: false,
  }),
  product({
    name: "Fire Combo Box",
    variety: "Flowers + Greens",
    category: "Mixed Boxes",
    color: "Assorted",
    pricePerStem: 0.82,
    stemsPerBunch: 51,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/shop-all-tropicals.png",
    campaign: "Shop-ComboBoxes",
    addedOrder: 24,
    bestseller: false,
  }),
  product({
    name: "Fiesta Combo Box",
    variety: "Flowers + Greens",
    category: "Mixed Boxes",
    color: "Assorted",
    pricePerStem: 0.89,
    stemsPerBunch: 52,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/shop-all-tropicals.png",
    campaign: "Shop-ComboBoxes",
    addedOrder: 25,
    bestseller: false,
  }),
  product({
    name: "Ginger Mix Box",
    variety: "Assorted gingers",
    category: "Mixed Boxes",
    color: "Assorted",
    pricePerStem: 2.34,
    stemsPerBunch: 24,
    stemLength: "70cm+",
    availability: "In stock",
    image: "/images/shop/ginger-nicole-pink.PNG",
    campaign: "Shop-ComboBoxes",
    addedOrder: 26,
    bestseller: false,
  }),
  // Bouquets (as products)
  product({
    name: "Green Round Emerald Bouquet",
    variety: "11 stems",
    category: "Bouquets",
    color: "Green",
    pricePerStem: 0.53,
    stemsPerBunch: 11,
    stemLength: "60-70cm",
    availability: "In stock",
    image: "/images/shop/Greens.png",
    campaign: "Shop-Bouquets",
    addedOrder: 27,
    bestseller: false,
  }),
  product({
    name: "Flat Hanna Farm Choice",
    variety: "13 stems assorted",
    category: "Bouquets",
    color: "Assorted",
    pricePerStem: 0.68,
    stemsPerBunch: 13,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/heliconia-fire-opal.png",
    campaign: "Shop-Bouquets",
    addedOrder: 28,
    bestseller: true,
  }),
  product({
    name: "Medium Round Amazon",
    variety: "21 stems assorted",
    category: "Bouquets",
    color: "Assorted",
    pricePerStem: 0.49,
    stemsPerBunch: 21,
    stemLength: "50-60cm",
    availability: "In stock",
    image: "/images/shop/shop-all-tropicals.png",
    campaign: "Shop-Bouquets",
    addedOrder: 29,
    bestseller: true,
  }),
];

/** All unique categories from products */
export const CATEGORIES: ProductCategory[] = [
  "Rose",
  "Ranunculus",
  "Anemone",
  "Delphinium",
  "Tropicals",
  "Greens & Foliage",
  "Bouquets",
  "Mixed Boxes",
];

/** All unique colors from products */
export function getUniqueColors(products: ShopProduct[]): string[] {
  const set = new Set(products.map((p) => p.color));
  return Array.from(set).sort();
}

/** All unique stem lengths from products */
export const STEM_LENGTHS: StemLength[] = [
  "30-40cm",
  "40-50cm",
  "50-60cm",
  "60-70cm",
  "70cm+",
];

/** All availability options */
export const AVAILABILITY_OPTIONS: Availability[] = [
  "In stock",
  "Limited",
  "Seasonal",
];

/** Build shop URL for a product — routes to internal PDP */
export function getProductCheckoutUrl(p: ShopProduct): string {
  return `${SHOP_BASE}/${encodeURIComponent(p.id)}`;
}

/** Get product by slug (id). For use in dynamic route app/shop/[slug]. */
export function getProductBySlug(slug: string): ShopProduct | undefined {
  return SHOP_PRODUCTS.find((p) => p.id === slug);
}

/** Get related products from the same category, excluding current product. */
export function getRelatedProducts(
  product: ShopProduct,
  limit: number = 4
): ShopProduct[] {
  return SHOP_PRODUCTS.filter(
    (p) => p.category === product.category && p.id !== product.id
  ).slice(0, limit);
}

/** Get effective price per stem for a chosen length (or base price). */
export function getPriceForLength(
  p: ShopProduct,
  length: StemLengthOption
): number {
  const option = p.stemLengthPrices?.find((o) => o.length === length);
  return option?.pricePerStem ?? p.pricePerStem;
}

/** All stem length options for detail page selector */
export const STEM_LENGTH_OPTIONS: StemLengthOption[] = ["40cm", "50cm", "60cm", "70cm"];
