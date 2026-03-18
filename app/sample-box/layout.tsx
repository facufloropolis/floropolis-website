import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Sample Box — Try Floropolis Before You Buy | Floropolis",
  description:
    "Request a free sample box of wholesale flowers — no credit card, no obligation. We cover shipping. Premium roses, tropical flowers, or greens. See the farm-direct quality yourself.",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      {children}
    </>
  );
}
