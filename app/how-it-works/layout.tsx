import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works — Farm to Door in 48-72 Hours | Floropolis",
  description:
    "Learn how Floropolis delivers fresh flowers from Ecuador farms to your door in 48-72 hours. No middlemen. Farm-direct pricing. Full tracking.",
  openGraph: {
    title: "How It Works — Farm to Door in 48-72 Hours | Floropolis",
    description:
      "Zero middlemen. Farm cuts to order. Direct flight to Miami. Delivered to your door in 48-72 hours.",
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
