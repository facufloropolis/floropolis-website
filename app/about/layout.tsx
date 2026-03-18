import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Floropolis — Farm-Direct Flowers Built for Florists",
  description:
    "Floropolis connects florists directly with premium farm partners in Ecuador & Colombia — and soon the US and Mexico — with a cold chain built for 4-day delivery.",
  openGraph: {
    title: "About Floropolis — Farm-Direct Flowers Built for Florists",
    description:
      "Floropolis connects florists directly with premium farm partners. Farm-direct, 4-day delivery.",
    url: "https://www.floropolis.com/about",
    siteName: "Floropolis",
    images: [{ url: "https://www.floropolis.com/Floropolis-logo-only.png", alt: "Floropolis — Farm-Direct Wholesale Flowers" }],
    type: "website",
  },
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
