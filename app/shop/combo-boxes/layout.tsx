import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo Boxes — Compare Options & Order | Floropolis",
  description:
    "Compare combo boxes: Tabasco, Mini Fiesta, Fire, Tiki Limbo, and more. Stem count, price per stem, total price. All ship free. Pre-made tropical bouquets too.",
  openGraph: {
    title: "Combo Boxes — Compare & Order | Floropolis",
    description:
      "Mixed flowers, tropicals & greens in one box. Sort by price, stems, or value. Free shipping.",
    url: "https://www.floropolis.com/shop/combo-boxes",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Wholesale combo flower boxes — Floropolis" }],
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "Shop", item: "https://www.floropolis.com/shop" },
    { "@type": "ListItem", position: 3, name: "Combo Boxes", item: "https://www.floropolis.com/shop/combo-boxes" },
  ],
};

export default function ComboBoxesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}
