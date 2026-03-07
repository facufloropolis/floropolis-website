/**
 * Greens & foliage catalog for /shop/greens.
 * Eucalyptus, Willow, Pandanus, Foliage Mix Boxes. Volume pricing, free shipping.
 */

const KOMET_BASE = "https://eshops.kometsales.com/762172?utm_source=Website";

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
  return `${KOMET_BASE}&utm_campaign=${encodeURIComponent(category.campaign)}`;
}
