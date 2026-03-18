import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Premium Roses — 30+ Varieties | Farm-Direct Wholesale | Floropolis",
  description:
    "30+ rose varieties from Ecuador. Best value to premium. Delivery included. 4-day to your shop.",
  openGraph: {
    title: "Premium Roses — 30+ Varieties | Floropolis",
    description:
      "Farm-direct roses. Clear pricing by tier. Delivery included.",
    url: "https://www.floropolis.com/shop/roses",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Premium wholesale roses — Floropolis" }],
    type: "website",
  },
};

export default function RosesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
