import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works — Farm to Door in 4 Days | Floropolis",
  description:
    "Learn how Floropolis delivers fresh flowers from Ecuador farms to your door in 4 days. No middlemen. Farm-direct pricing. Full tracking.",
  alternates: { canonical: 'https://www.floropolis.com/how-it-works' },
  openGraph: {
    title: "How It Works — Farm to Door in 4 Days | Floropolis",
    description:
      "Zero middlemen. Farm cuts to order. Direct flight to Miami. Delivered to your door in 4 days.",
    url: "https://www.floropolis.com/how-it-works",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Floropolis — Farm-Direct Wholesale Flowers" }],
    type: "website",
  },
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "How It Works", item: "https://www.floropolis.com/how-it-works" },
  ],
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "How long does wholesale flower delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Flowers are cut fresh to order and shipped with no warehouse stops or middlemen.",
      },
    },
    {
      "@type": "Question",
      name: "Do you ship wholesale flowers nationwide?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, Floropolis delivers to all 50 states via FedEx Priority. Free shipping on all orders, no minimum required.",
      },
    },
    {
      "@type": "Question",
      name: "How fresh are the flowers when they arrive?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Flowers are cut to order in Ecuador and arrive in 4 days. With no warehouse stops or distributor handling, you get flowers with 14+ days of vase life — significantly fresher than traditional wholesale channels.",
      },
    },
    {
      "@type": "Question",
      name: "What farms does Floropolis source from?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Floropolis sources direct from partner farms in Ecuador and Colombia, including MegaFlor, Ecoroses, Flodecol, and Magic Flowers. All farms ship direct — no middlemen or wholesale distributors.",
      },
    },
    {
      "@type": "Question",
      name: "Is there a minimum order for wholesale flowers?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No minimum order. Order a single box or hundreds of stems — free shipping applies to all orders regardless of size.",
      },
    },
  ],
};

export default function HowItWorksLayout({
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
