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

export default function GreensLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
