import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
      {
        protocol: 'https',
        hostname: 'd3bgzcd3kwm78d.cloudfront.net',
      },
    ],
  },
};

// Wrap with Sentry -- uploads source maps + tunnels client errors past ad blockers.
// Sentry config (SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN) read from env at build time.
// If env vars are missing, withSentryConfig falls back to a no-op build (safe).
export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  sourcemaps: { disable: false },
  disableLogger: true,
  automaticVercelMonitors: true,
});
