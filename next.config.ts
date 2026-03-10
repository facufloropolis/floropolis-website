import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/valentines", destination: "/shop", permanent: true },
      { source: "/valentiens", destination: "/shop", permanent: true },
      // Old /catalog URLs → new /shop routes
      { source: "/catalog", destination: "/shop", permanent: true },
      { source: "/catalog/:path*", destination: "/shop", permanent: true },
      // Category direct URLs → shop with filter
      { source: "/shop/roses", destination: "/shop?category=Rose", permanent: true },
      { source: "/shop/tropicals", destination: "/shop?category=Tropicals", permanent: true },
      { source: "/shop/greens", destination: "/shop?category=Greens+%26+Foliage", permanent: true },
      { source: "/shop/bouquets", destination: "/shop?category=Bouquets", permanent: true },
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
