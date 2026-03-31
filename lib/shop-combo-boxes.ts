/**
 * Combo boxes and pre-made bouquets for /shop/combo-boxes.
 * Sortable comparison: name, contents, stem count, price per stem, total, free shipping.
 */

// Internal catalog — Mixed Boxes (30) and Bouquets (21) are in our shop catalog
const SHOP_BASE = "/shop";

export interface ComboBox {
  id: string;
  name: string;
  contents: string;
  stemCount: number;
  totalPrice: number;
  pricePerStem: number;
  bestValue?: boolean;
  freeShipping: boolean;
  campaign: string;
}

export interface ComboBouquet {
  id: string;
  name: string;
  description: string;
  stemCount: number;
  totalPrice: number;
  pricePerStem: number;
  image: string;
  campaign: string;
}

/** All combo box options for the comparison table */
export const COMBO_BOXES: ComboBox[] = [
  {
    id: "tabasco",
    name: "Tabasco",
    contents: "Heliconias, gingers, musa & tropical foliage",
    stemCount: 113,
    totalPrice: 68,
    pricePerStem: 0.6,
    bestValue: true,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "mini-fiesta",
    name: "Mini Fiesta",
    contents: "Heliconias, gingers, musa & tropical foliage",
    stemCount: 50,
    totalPrice: 38,
    pricePerStem: 0.76,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "mini-tabasco",
    name: "Mini Tabasco",
    contents: "Heliconias, gingers & tropical foliage",
    stemCount: 66,
    totalPrice: 52,
    pricePerStem: 0.79,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "fire",
    name: "Fire",
    contents: "Heliconias, gingers & tropical foliage",
    stemCount: 51,
    totalPrice: 42,
    pricePerStem: 0.82,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "tiki-limbo-large",
    name: "Tiki Limbo Large",
    contents: "Heliconias, gingers, tropical flowers & greens",
    stemCount: 180,
    totalPrice: 175,
    pricePerStem: 0.97,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "capricho",
    name: "Capricho",
    contents: "Hanging heliconias, banana fingers & tropical greens",
    stemCount: 41,
    totalPrice: 42,
    pricePerStem: 1.02,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "escarlata",
    name: "Escarlata",
    contents: "Gingers, heliconias & tropical greens",
    stemCount: 41,
    totalPrice: 42,
    pricePerStem: 1.02,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "iniziativa",
    name: "Iniziativa",
    contents: "Tropical heliconias & foliage",
    stemCount: 41,
    totalPrice: 42,
    pricePerStem: 1.02,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
  {
    id: "ginger-mix",
    name: "Ginger Mix",
    contents: "King Plus Red, King Nicole, Torch Red & Pink — pure gingers, no greens",
    stemCount: 24,
    totalPrice: 56,
    pricePerStem: 2.33,
    freeShipping: true,
    campaign: "Shop-ComboBoxes",
  },
];

/** Pre-made tropical bouquets subsection */
export const COMBO_BOUQUETS: ComboBouquet[] = [
  {
    id: "green-round-emerald",
    name: "Green Round Emerald Bouquet",
    description: "11 stems — greenery-focused round bouquet",
    stemCount: 11,
    totalPrice: 5.83,
    pricePerStem: 0.53,
    image: "/images/shop/Greens.png",
    campaign: "Shop-Bouquets",
  },
  {
    id: "flat-hanna",
    name: "Flat Hanna Farm Choice",
    description: "13 stems assorted — farm choice tropical",
    stemCount: 13,
    totalPrice: 8.84,
    pricePerStem: 0.68,
    image: "/images/shop/heliconia-fire-opal.png",
    campaign: "Shop-Bouquets",
  },
  {
    id: "medium-round-amazon",
    name: "Medium Round Amazon",
    description: "21 stems assorted — tropical round",
    stemCount: 21,
    totalPrice: 10.29,
    pricePerStem: 0.49,
    image: "/images/shop/shop-all-tropicals.png",
    campaign: "Shop-Bouquets",
  },
];

export type ComboSortKey = "totalPrice" | "stemCount" | "pricePerStem";

export function getComboCheckoutUrl(box: ComboBox): string {
  // Route to internal catalog — each box has a slug in /shop/[slug]
  return `${SHOP_BASE}/${encodeURIComponent(box.id)}`;
}

export function getBouquetCheckoutUrl(bouquet: ComboBouquet): string {
  return `${SHOP_BASE}?category=${encodeURIComponent("Mixed Boxes")}`;
}
