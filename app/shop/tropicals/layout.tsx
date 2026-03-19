import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tropicals — Heliconia, Ginger, Anthurium & Novelties | Floropolis",
  description:
    "Farm-direct tropicals from Ecuador. Lasts 2x longer than traditional cuts. All ship free. Heliconia, ginger, anthurium, French Kiss, Musas. Unique varieties.",
  alternates: { canonical: 'https://www.floropolis.com/shop/tropicals' },
  openGraph: {
    title: "Tropicals — Heliconia, Ginger, Anthurium | Floropolis",
    description:
      "Tropicals that last 2x longer. Free shipping. Unique varieties. Farm-direct.",
    url: "https://www.floropolis.com/shop/tropicals",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Wholesale tropical flowers — Floropolis" }],
    type: "website",
  },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do you have bird of paradise year-round?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Bird of paradise is one of our most reliable year-round varieties, supplied from our Ecuador farm partners. Check current availability for specific stem counts.",
      },
    },
    {
      "@type": "Question",
      name: "What's the minimum order for heliconias?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Minimum is typically 5 stems for tropicals, depending on variety. Heliconias are sold by the stem due to their size and value. Contact us for volume pricing for event work.",
      },
    },
    {
      "@type": "Question",
      name: "How do I condition tropical flowers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Most tropicals prefer warm water (room temperature, not cold). Re-cut stems at an angle, keep in a cool spot (not refrigerator), and avoid direct drafts. Do NOT refrigerate heliconias — they'll blacken overnight.",
      },
    },
    {
      "@type": "Question",
      name: "How long does tropical flower delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Tropicals ship with no warehouse stops — the fastest path from farm to florist.",
      },
    },
  ],
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "Shop", item: "https://www.floropolis.com/shop" },
    { "@type": "ListItem", position: 3, name: "Tropicals", item: "https://www.floropolis.com/shop/tropicals" },
  ],
};

export default function TropicalsLayout({
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      {children}
    </>
  );
}
