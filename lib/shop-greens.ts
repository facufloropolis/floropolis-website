/**
 * Greens & foliage catalog for /shop/greens.
 * Eucalyptus, Willow, Pandanus, Foliage Mix Boxes. Volume pricing, free shipping.
 */

// Internal catalog — Greens & Foliage products are in our shop catalog (48 products)
const SHOP_BASE = "/shop";

export interface GreensCategory {
  id: string;
  name: string;
  description: string;
  priceRange: string;
  /** e.g. "From $0.13/stem" for volume highlight */
  volumeNote?: string;
  image: string;
  campaign: string;
  stemsInfo?: string;
}

export const GREENS_CATEGORIES: GreensCategory[] = [
  {
    id: "eucalyptus",
    name: "Eucalyptus Silver Dollar",
    description: "Classic silver dollar eucalyptus. Bulk volume pricing. All greens ship free.",
    priceRange: "From $0.13/stem",
    volumeNote: "Volume pricing from $0.13/stem",
    image: "/images/shop/Greens.png",
    campaign: "Shop-Greens",
    stemsInfo: "Bulk boxes available",
  },
  {
    id: "willow",
    name: "Willow Greens",
    description: "Willow greens in bulk. 1,500–2,500 stems per box. Our lowest-priced foliage.",
    priceRange: "$0.13/stem",
    volumeNote: "From $0.13/stem",
    image: "/images/shop/Greens.png",
    campaign: "Shop-Greens",
    stemsInfo: "1,500–2,500 stems/box",
  },
  {
    id: "pandanus",
    name: "Pandanus",
    description: "Green & variegated. Tropical accent foliage. Free shipping on all greens.",
    priceRange: "$0.21/stem",
    image: "/images/shop/pandanus-variegated.jpg",
    campaign: "Shop-Greens",
    stemsInfo: "1,300–2,500 stems/box",
  },
  {
    id: "foliage-mix",
    name: "Foliage Mix Boxes",
    description: "Jungle, Amazon, Greenery mix boxes. Pre-designed assorted foliage. Perfect starter or event boxes.",
    priceRange: "From $0.31/stem",
    image: "/images/shop/foliage-mix-box.png",
    campaign: "Shop-Greens",
    stemsInfo: "90–115 stems/box",
  },
];

export const COMBO_BOXES_LINK = "/shop/combo-boxes";

export function getGreensCheckoutUrl(category: GreensCategory): string {
  const queryMap: Record<string, string> = {
    eucalyptus: "Eucalyptus",
    willow: "Willow",
    pandanus: "Pandanus",
    "foliage-mix": "Foliage",
  };
  const q = queryMap[category.id];
  return q
    ? `${SHOP_BASE}?category=Greens+%26+Foliage&q=${encodeURIComponent(q)}`
    : `${SHOP_BASE}?category=Greens+%26+Foliage`;
}
