import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Premium Roses — 30+ Varieties | Farm-Direct Wholesale | Floropolis",
  description:
    "30+ rose varieties from Ecuador. Best value to premium. Delivery included. 4-day to your shop.",
  alternates: { canonical: 'https://www.floropolis.com/shop/roses' },
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

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What's the minimum order for wholesale roses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Our minimum order is 25 stems per variety. You can combine multiple varieties in a single order to meet volume requirements.",
      },
    },
    {
      "@type": "Question",
      name: "Do you carry garden roses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. We carry Quicksand, Free Spirit, Antonia Garden, and several other garden-style roses with open, lush blooms. Check current availability in the shop — selection varies by season.",
      },
    },
    {
      "@type": "Question",
      name: "How do I get the best vase life from Ecuador roses?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Re-cut stems at a 45° angle immediately on arrival, remove foliage below the waterline, and use clean buckets with floral preservative. You should expect 14-16 days consistently with proper conditioning.",
      },
    },
    {
      "@type": "Question",
      name: "How long does wholesale rose delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Roses are cut fresh to order and shipped direct — no warehouse stops.",
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
    { "@type": "ListItem", position: 3, name: "Roses", item: "https://www.floropolis.com/shop/roses" },
  ],
};

export default function RosesLayout({
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
