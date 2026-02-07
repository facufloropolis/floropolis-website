import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Premium Wholesale Flowers | Roses, Tropicals & Greens — Farm Direct | Floropolis",
  description:
    "Farm-direct wholesale flowers from Ecuador & Colombia. Roses from $1.30/stem, tropicals from $0.63/stem, greens from $0.13/stem. 4-day delivery to your shop.",
  openGraph: {
    title: "Premium Wholesale Flowers | Roses, Tropicals & Greens — Farm Direct | Floropolis",
    description:
      "Farm-direct wholesale flowers from Ecuador & Colombia. Roses from $1.30/stem, tropicals from $0.63/stem, greens from $0.13/stem. 4-day delivery to your shop.",
  },
};

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
