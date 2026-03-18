import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Greens & Foliage — Volume Pricing from $0.13/Stem | Floropolis",
  description:
    "Wholesale greens and foliage. Eucalyptus silver dollar, willow, pandanus, foliage mix boxes. Volume pricing from $0.13/stem. All ship free.",
  openGraph: {
    title: "Greens & Foliage — Volume Pricing | Floropolis",
    description:
      "Greens from $0.13/stem. Free shipping. Eucalyptus, willow, pandanus, mix boxes.",
    url: "https://www.floropolis.com/shop/greens",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Wholesale greens and foliage — Floropolis" }],
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "Shop", item: "https://www.floropolis.com/shop" },
    { "@type": "ListItem", position: 3, name: "Greens & Foliage", item: "https://www.floropolis.com/shop/greens" },
  ],
};

export default function GreensLayout({
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
