import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tropicals — Heliconia, Ginger, Anthurium & Novelties | Floropolis",
  description:
    "Farm-direct tropicals from Ecuador. Lasts 2x longer than traditional cuts. All ship free. Heliconia, ginger, anthurium, French Kiss, Musas. Unique varieties.",
  openGraph: {
    title: "Tropicals — Heliconia, Ginger, Anthurium | Floropolis",
    description:
      "Tropicals that last 2x longer. Free shipping. Unique varieties. Farm-direct.",
  },
};

export default function TropicalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
