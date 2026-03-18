import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Premium Wholesale Flowers | Roses, Tropicals & Greens — Farm Direct | Floropolis",
  description:
    "Farm-direct wholesale flowers from Ecuador & Colombia. Roses from $1.30/stem, tropicals from $0.63/stem, greens from $0.13/stem. 4-day delivery to your shop.",
  openGraph: {
    title: "Premium Wholesale Flowers | Roses, Tropicals & Greens — Farm Direct | Floropolis",
    description:
      "Farm-direct wholesale flowers from Ecuador & Colombia. Roses from $1.30/stem, tropicals from $0.63/stem, greens from $0.13/stem. 4-day delivery to your shop.",
    url: "https://www.floropolis.com/shop",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Wholesale flowers — Floropolis" }],
    type: "website",
  },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do I need an account to see wholesale flower prices?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No — all prices are shown openly on floropolis.com. No registration, no login required. Browse our full catalog of roses, tropicals, and greens with transparent per-stem pricing.",
      },
    },
    {
      "@type": "Question",
      name: "What's the minimum order for wholesale flowers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No minimum order. You can order a single bunch or hundreds of boxes — free shipping applies regardless of order size.",
      },
    },
    {
      "@type": "Question",
      name: "How does wholesale flower ordering work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Browse the catalog, add items to your quote, and submit. We confirm within 1 hour (Mon–Fri, 8 AM – 6 PM ET) and coordinate delivery. Flowers ship farm-direct to your door in 4 days.",
      },
    },
    {
      "@type": "Question",
      name: "What types of wholesale flowers do you carry?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We carry roses (30+ varieties), tropical flowers (heliconias, gingers, birds of paradise, anthuriums), greens and foliage (eucalyptus, monsteras, ferns), delphiniums, ranunculus, anemones, and combo boxes from Magic Flowers.",
      },
    },
    {
      "@type": "Question",
      name: "Is shipping included in the wholesale flower price?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. All prices shown on Floropolis include FedEx Priority shipping from Ecuador to your door. No surprise freight charges at checkout.",
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
  ],
};

export default function ShopLayout({
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
