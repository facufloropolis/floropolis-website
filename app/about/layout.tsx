import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Floropolis - Farm-Direct Wholesale Flowers",
  description:
    "Learn how Floropolis connects professional florists directly with premium flower farms in Ecuador and Colombia.",
};

export default function AboutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
