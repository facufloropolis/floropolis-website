import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Combo Boxes — Compare Options & Order | Floropolis",
  description:
    "Compare combo boxes: Tabasco, Mini Fiesta, Fire, Tiki Limbo, and more. Stem count, price per stem, total price. All ship free. Pre-made tropical bouquets too.",
  openGraph: {
    title: "Combo Boxes — Compare & Order | Floropolis",
    description:
      "Mixed flowers, tropicals & greens in one box. Sort by price, stems, or value. Free shipping.",
  },
};

export default function ComboBoxesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
