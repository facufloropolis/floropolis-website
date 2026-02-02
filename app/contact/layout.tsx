import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Floropolis - Wholesale Flower Supplier",
  description:
    "Questions about wholesale accounts, ordering, or shipping? Contact Floropolis.",
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
