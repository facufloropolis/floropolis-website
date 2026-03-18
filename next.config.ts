import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/valentines", destination: "/shop", permanent: true },
      { source: "/valentiens", destination: "/shop", permanent: true },
      // Old /catalog URLs → new /shop routes
      { source: "/catalog", destination: "/shop", permanent: true },
      { source: "/catalog/:path*", destination: "/shop", permanent: true },
      // Category redirect for URLs with no dedicated page
      { source: "/shop/bouquets", destination: "/shop?category=Bouquets", permanent: true },
      // NOTE: /shop/roses, /shop/tropicals, /shop/greens, /shop/combo-boxes, /shop/spring-collection
      // have their own curated pages — do NOT redirect them here
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
};

export default nextConfig;
