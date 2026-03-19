import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Floropolis — Wholesale Flower Supplier",
  description:
    "Questions about wholesale accounts, ordering, or shipping? Contact Floropolis — farm-direct flowers from Ecuador and Colombia.",
  alternates: { canonical: 'https://www.floropolis.com/contact' },
  openGraph: {
    title: "Contact Floropolis — Wholesale Flower Supplier",
    description:
      "Get in touch with Floropolis for wholesale accounts, ordering, and shipping questions.",
    url: "https://www.floropolis.com/contact",
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
    { "@type": "ListItem", position: 2, name: "Contact", item: "https://www.floropolis.com/contact" },
  ],
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Do you have a minimum order?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No minimum order required. Free shipping on all orders, regardless of size.",
      },
    },
    {
      "@type": "Question",
      name: "Do you offer free shipping?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes, free shipping on all orders. No minimum purchase required.",
      },
    },
    {
      "@type": "Question",
      name: "Are the flowers guaranteed fresh?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. Our flowers are cut fresh and delivered in 4 days. If your flowers don't arrive fresh, we'll replace them or refund your order.",
      },
    },
    {
      "@type": "Question",
      name: "What areas do you deliver to?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "We deliver nationwide to all 50 states via FedEx Priority.",
      },
    },
    {
      "@type": "Question",
      name: "Can I pre-book for holidays?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Pre-booking for peak seasons such as Mother's Day and other holidays opens 3-6 months in advance with locked-in pricing.",
      },
    },
    {
      "@type": "Question",
      name: "How long does wholesale flower delivery take?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Farm-direct from Ecuador to your door in 4 days via FedEx Priority. Orders are cut fresh and shipped direct with no warehouse stops.",
      },
    },
  ],
};

export default function ContactLayout({
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
