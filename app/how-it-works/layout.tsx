import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How It Works - Floropolis Farm-Direct Flowers",
  description:
    "Learn how Floropolis delivers fresh flowers from Ecuador farms to your door in 48-72 hours.",
};

export default function HowItWorksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
