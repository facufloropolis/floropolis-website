/**
 * Spring collection for /shop/spring-collection.
 * Seasonal products with EXCLUSIVE badges.
 */

const KOMET_BASE = "https://eshops.kometsales.com/762172?utm_source=Website";

export interface SpringProduct {
  id: string;
  name: string;
  description: string;
  varietyCount: number;
  priceMin: number;
  priceMax: number;
  image: string;
  badge?: "EXCLUSIVE";
  campaign: string;
}

function spring(p: Omit<SpringProduct, "id"> & { id?: string }): SpringProduct {
  const id =
    p.id ??
    p.name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  return { ...p, id };
}

export const SPRING_PRODUCTS: SpringProduct[] = [
  spring({
    name: "Ranunculus Amandine",
    description: "13 Amandine varieties — colors and sizes no wholesaler carries. Direct from Ecuador.",
    varietyCount: 13,
    priceMin: 1.01,
    priceMax: 1.46,
    image: "/images/shop/Ranunculus_Red_FINAL.png",
    badge: "EXCLUSIVE",
    campaign: "Shop-Spring-Ranunculus",
  }),
  spring({
    name: "Anemone FullStar + Mariane",
    description: "17 varieties FullStar & Mariane. Seasonal spring anemones from Ecuador farms.",
    varietyCount: 17,
    priceMin: 1.08,
    priceMax: 1.31,
    image: "/images/shop/Anemone_3.png",
    badge: "EXCLUSIVE",
    campaign: "Shop-Spring-Anemone",
  }),
  spring({
    name: "Delphinium",
    description: "16 varieties. Towering stems, blue to white to lavender. Farm-direct.",
    varietyCount: 16,
    priceMin: 0.88,
    priceMax: 1.78,
    image: "/images/shop/Delphinium%20Sea%20Waltz%20Dark%20Blue%20FINAL.png",
    badge: "EXCLUSIVE",
    campaign: "Shop-Spring-Delphinium",
  }),
  spring({
    name: "Scabiosa",
    description: "Seasonal scabiosa in multiple colors. Perfect for spring and summer weddings.",
    varietyCount: 6,
    priceMin: 1.15,
    priceMax: 1.45,
    image: "/images/shop/Ranunculus_Red_FINAL.png",
    campaign: "Shop-Spring-Scabiosa",
  }),
  spring({
    name: "Thistle",
    description: "Blue and green thistle. Textural and long-lasting.",
    varietyCount: 4,
    priceMin: 0.95,
    priceMax: 1.25,
    image: "/images/shop/Greens.png",
    campaign: "Shop-Spring-Thistle",
  }),
  spring({
    name: "Molucella",
    description: "Bells of Ireland. Classic spring green stems.",
    varietyCount: 2,
    priceMin: 1.08,
    priceMax: 1.28,
    image: "/images/shop/Greens.png",
    campaign: "Shop-Spring-Molucella",
  }),
  spring({
    name: "Larkspur",
    description: "Spring larkspur in blues, pinks, and white. Light and airy.",
    varietyCount: 8,
    priceMin: 0.92,
    priceMax: 1.35,
    image: "/images/shop/Delphinium%20Sea%20Waltz%20Dark%20Blue%20FINAL.png",
    campaign: "Shop-Spring-Larkspur",
  }),
];

export function getSpringCheckoutUrl(product: SpringProduct): string {
  return `${KOMET_BASE}&utm_campaign=${encodeURIComponent(product.campaign)}`;
}
