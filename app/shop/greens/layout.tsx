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

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What's the minimum order for wholesale greens?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No minimum order required. Greens are sold by the bunch — typical bunches range from 10-25 stems depending on variety. Free shipping on all orders.",
      },
    },
    {
      "@type": "Question",
      name: "Do you carry eucalyptus year-round?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Eucalyptus silver dollar is one of our most consistent year-round varieties. We also carry willow eucalyptus, seeded eucalyptus, and other varieties depending on availability.",
      },
    },
    {
      "@type": "Question",
      name: "What greens and foliage varieties do you carry?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We carry eucalyptus (silver dollar, willow, seeded), pandanus, Italian ruscus, pittosporum, foliage mix boxes from Magic Flowers (Amazon, Jungle, Botanical, Greenery mixes), and more. Browse our shop for current availability.",
      },
    },
    {
      "@type": "Question",
      name: "How long does foliage and greenery delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Greens are cut fresh and shipped direct with no warehouse stops.",
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      {children}
    </>
  );
}
