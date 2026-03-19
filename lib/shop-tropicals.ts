/**
 * Tropicals catalog for /shop/tropicals.
 * Heliconia, Ginger, Anthurium, Novelties. Value props: 2x longer vase life, free shipping, unique varieties.
 */

// Internal catalog base — tropicals are in our shop catalog (42 products)
const SHOP_BASE = "/shop";

export interface TropicalCategory {
  id: string;
  name: string;
  description: string;
  priceRange: string;
  image: string;
  campaign: string;
  /** e.g. "5 stems/bunch" */
  stemsInfo?: string;
}

export const TROPICAL_CATEGORIES: TropicalCategory[] = [
  {
    id: "heliconia",
    name: "Heliconia",
    description: "Fire Opal, Rostrata, and more. Iconic tropical stems that last 2x longer than traditional cuts. Direct from Ecuador's jungle.",
    priceRange: "$0.93–$2.94/stem",
    image: "/images/shop/heliconia-fire-opal.png",
    campaign: "Shop-Tropicals",
    stemsInfo: "3–5 stems/bunch",
  },
  {
    id: "ginger",
    name: "Ginger",
    description: "Nicole Pink, assorted gingers. Bold color and structure. All ship free.",
    priceRange: "$1.94–$2.34/stem",
    image: "/images/shop/ginger-nicole-pink.PNG",
    campaign: "Shop-Tropicals",
    stemsInfo: "3 stems/bunch",
  },
  {
    id: "anthurium",
    name: "Anthurium",
    description: "Red, pink, white, and assorted. 3+ weeks vase life. Unique varieties most wholesalers can't get.",
    priceRange: "From $2.72/stem",
    image: "/images/shop/anthurium-red.jpg",
    campaign: "Shop-Tropicals",
    stemsInfo: "10 stems/bunch",
  },
  {
    id: "novelties",
    name: "Novelties (Musas, French Kiss)",
    description: "French Kiss, Musa, Anana. Rare tropicals your clients have never seen. Farm-direct from Magic Flowers.",
    priceRange: "$0.63–$2.12/stem",
    image: "/images/shop/french-kiss.png",
    campaign: "Shop-Tropicals",
  },
];

export const COMBO_BOXES_LINK = "/shop/combo-boxes";

// EXP-030: Route to internal catalog instead of Koronet — 42 tropicals in our shop
export function getTropicalCheckoutUrl(category: TropicalCategory): string {
  const searchMap: Record<string, string> = {
    heliconia: "Heliconia",
    ginger: "Ginger",
    anthurium: "Anthurium",
  };
  const q = searchMap[category.id];
  return q
    ? `${SHOP_BASE}?category=Tropicals&q=${encodeURIComponent(q)}`
    : `${SHOP_BASE}?category=Tropicals`;
}
