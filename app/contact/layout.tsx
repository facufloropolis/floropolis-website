import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Floropolis — Wholesale Flower Supplier",
  description:
    "Questions about wholesale accounts, ordering, or shipping? Contact Floropolis — farm-direct flowers from Ecuador and Colombia.",
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

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
