import type { Metadata } from "next";

// EXP-116: MDY page SEO metadata — proper title/description for Google discovery
export const metadata: Metadata = {
  title: "Mother's Day Flowers 2026 — Farm-Direct Wholesale | Floropolis",
  description:
    "Order wholesale Mother's Day flowers direct from Ecuador. Ranunculus, anemones & delphiniums from $1.17/stem. Pre-order by April 25 for guaranteed May 10 delivery.",
  openGraph: {
    title: "Mother's Day Flowers 2026 — Farm-Direct Wholesale",
    description:
      "Farm-direct Mother's Day flowers from Ecuador. Ranunculus, anemones & delphiniums. Pre-order by April 25, deliver May 10.",
    type: "website",
  },
};

export default function MothersDayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
