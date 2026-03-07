import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getProductBySlug,
  getVariants,
  getRelated,
  getAllSlugs,
  categoryToSlug,
} from "@/lib/data/product-helpers";
import ProductDetailPage from "./ProductDetailPage";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getAllSlugs().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) return { title: "Product Not Found" };

  const unitLabel = product.unit === "Bunch" ? "bunch" : "stem";
  const basePrice =
    typeof product.price === "number" ? product.price.toFixed(2) : "";
  const dealPrice =
    product.deal_price != null ? product.deal_price.toFixed(2) : "";

  const title = `${product.variety} ${product.color} | Floropolis`;
  const pricePart = dealPrice
    ? `$${dealPrice}/${unitLabel} (${product.deal_label ?? "deal"})`
    : basePrice
    ? `$${basePrice}/${unitLabel}`
    : "";
  const desc =
    (pricePart
      ? `${product.variety} ${product.color} — ${pricePart}. `
      : `${product.variety} ${product.color}. `) +
    "Farm-direct wholesale flowers. 4-day delivery.";

  return {
    title,
    description: desc,
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const variants = getVariants(product.variety, product.color);
  const related = getRelated(product.category, product.slug, 8);
  const categorySlug = categoryToSlug(product.category);

  return (
    <ProductDetailPage
      product={product}
      related={related}
      variants={variants}
      categorySlug={categorySlug}
    />
  );
}
