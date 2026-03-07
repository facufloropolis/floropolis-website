import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Floropolis — Farm-Direct Flowers Built for Florists",
  description:
    "Floropolis connects florists directly with premium farm partners in Ecuador & Colombia — and soon the US and Mexico — with a cold chain built for 48–72 hour delivery.",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
