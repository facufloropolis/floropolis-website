import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Sample Box — Try Floropolis Before You Buy | Floropolis",
  description:
    "Request a free sample box of wholesale flowers — no credit card, no obligation. We cover shipping. Premium roses, tropical flowers, or greens. See the farm-direct quality yourself.",
  alternates: { canonical: 'https://www.floropolis.com/sample-box' },
  openGraph: {
    title: "Free Sample Box — Try Farm-Direct Flowers | Floropolis",
    description:
      "No credit card. We cover shipping. No obligation. See farm-direct flower quality before your first wholesale order.",
    url: "https://www.floropolis.com/sample-box",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Floropolis Free Sample Box" }],
    type: "website",
  },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is the sample box really free?",
      acceptedAnswer: { "@type": "Answer", text: "Yes — we cover shipping and there's no credit card required. You pay nothing. We send it because we know once you see the quality, you'll want to order regularly." },
    },
    {
      "@type": "Question",
      name: "What's included in the sample box?",
      acceptedAnswer: { "@type": "Answer", text: "Your choice of roses, tropical flowers, or greens — one QB (quarter box). The exact varieties may vary by season and availability, but you'll receive a curated selection that represents our best current inventory." },
    },
    {
      "@type": "Question",
      name: "How long does the sample box take to arrive?",
      acceptedAnswer: { "@type": "Answer", text: "4 days from our Ecuador farms to your door via FedEx Priority. We coordinate the cutoff so flowers arrive Monday through Thursday — never on a weekend." },
    },
    {
      "@type": "Question",
      name: "Do I have to buy after getting the sample box?",
      acceptedAnswer: { "@type": "Answer", text: "No obligation whatsoever. The sample box is exactly what it says — a free sample so you can see the quality yourself. If you love it, we'd love your business. If not, no hard feelings." },
    },
    {
      "@type": "Question",
      name: "Who is the sample box for?",
      acceptedAnswer: { "@type": "Answer", text: "Retail florists, event planners, and floral designers who want to evaluate farm-direct wholesale quality before committing to a first order." },
    },
  ],
};

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
    { "@type": "ListItem", position: 2, name: "Free Sample Box", item: "https://www.floropolis.com/sample-box" },
  ],
};

export default function SampleBoxLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}
