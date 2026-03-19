import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getProductBySlug,
  getVariants,
  getRelated,
  getBundleSuggestions,
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

  const pricePart = dealPrice
    ? `$${dealPrice}/${unitLabel} (${product.deal_label ?? "deal"})`
    : basePrice
    ? `$${basePrice}/${unitLabel}`
    : "";
  // Include "wholesale" + category in title for SEO (people search "freedom red roses wholesale price")
  const title = pricePart
    ? `${product.variety} ${product.color} Wholesale ${product.category} — ${pricePart} | Floropolis`
    : `${product.variety} ${product.color} Wholesale ${product.category} | Floropolis`;
  // Description leads with buying intent + price + key benefits
  const desc = pricePart
    ? `Buy ${product.variety} ${product.color} wholesale from ${pricePart}. Farm-direct from Ecuador — arrives in 4 days. No minimum order. Free shipping.`
    : `Buy ${product.variety} ${product.color} wholesale flowers. Farm-direct from Ecuador — arrives in 4 days. No minimum order. Free shipping.`;

  // Build OG image URL for social sharing
  const firstImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null;
  const ogImageUrl = firstImage
    ? firstImage.startsWith("http") || firstImage.startsWith("/")
      ? firstImage
      : `https://www.floropolis.com/product-photos/${firstImage}`
    : "https://www.floropolis.com/Floropolis-logo-only.png";

  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      url: `https://www.floropolis.com/shop/${slug}`,
      siteName: "Floropolis",
      images: [{ url: ogImageUrl, alt: `${product.variety} ${product.color} wholesale flowers` }],
      type: "website",
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();

  const variants = getVariants(product.variety, product.color);
  const related = getRelated(product.category, product.slug, 8);
  const bundles = getBundleSuggestions(product.category, product.slug, 3);
  const categorySlug = categoryToSlug(product.category);

  const price = product.deal_price ?? product.price;
  const availability =
    product.tier === "T1" || product.tier === "T2"
      ? "https://schema.org/InStock"
      : "https://schema.org/PreOrder";

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${product.variety} ${product.color}`,
    description: `Wholesale ${product.variety} ${product.color} — farm-direct from Ecuador. ${product.category}. 4-day delivery to your door.`,
    brand: { "@type": "Brand", name: "Floropolis" },
    category: product.category,
    offers: price
      ? {
          "@type": "Offer",
          priceCurrency: "USD",
          price: price.toFixed(2),
          availability,
          seller: { "@type": "Organization", name: "Floropolis" },
          url: `https://www.floropolis.com/shop/${slug}`,
        }
      : undefined,
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.floropolis.com" },
      { "@type": "ListItem", position: 2, name: "Shop", item: "https://www.floropolis.com/shop" },
      {
        "@type": "ListItem",
        position: 3,
        name: product.category,
        item: product.category === "Rose"
          ? "https://www.floropolis.com/shop/roses"
          : product.category === "Tropicals"
          ? "https://www.floropolis.com/shop/tropicals"
          : product.category === "Greens & Foliage"
          ? "https://www.floropolis.com/shop/greens"
          : `https://www.floropolis.com/shop?category=${encodeURIComponent(product.category)}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `${product.variety} ${product.color}`,
        item: `https://www.floropolis.com/shop/${slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <ProductDetailPage
        product={product}
        related={related}
        bundles={bundles}
        variants={variants}
        categorySlug={categorySlug}
      />
    </>
  );
}
