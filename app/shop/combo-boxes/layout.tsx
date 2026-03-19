import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo Boxes — Compare Options & Order | Floropolis",
  description:
    "Compare combo boxes: Tabasco, Mini Fiesta, Fire, Tiki Limbo, and more. Stem count, price per stem, total price. All ship free. Pre-made tropical bouquets too.",
  alternates: { canonical: 'https://www.floropolis.com/shop/combo-boxes' },
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

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What's in a combo box?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Combo boxes are curated mixes of tropical flowers and greens from Magic Flowers in Ecuador. Each box has a set composition — for example, the Fiesta Box includes a mix of heliconias, gingers, anthuriums, and tropical foliage. Exact variety details are listed on each product page.",
      },
    },
    {
      "@type": "Question",
      name: "Can I customize what's in my combo box?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes — you can add a note when requesting your quote specifying variety preferences. For large orders, we can work with Magic Flowers to customize the composition. Add your preferences in the quote notes field.",
      },
    },
    {
      "@type": "Question",
      name: "How many stems are in a combo box?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Stem counts vary by box. Quarter boxes (QB) typically contain 41-113 stems depending on the mix. Each product page shows the total stem count so you can compare value before ordering.",
      },
    },
    {
      "@type": "Question",
      name: "How long does combo box delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Combo boxes ship direct from Magic Flowers with no warehouse stops.",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      {children}
    </>
  );
}
