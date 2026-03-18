import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works — Farm to Door in 4 Days | Floropolis",
  description:
    "Learn how Floropolis delivers fresh flowers from Ecuador farms to your door in 4 days. No middlemen. Farm-direct pricing. Full tracking.",
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

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
