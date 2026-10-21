import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server binds to 0.0.0.0, so the browser origin is 127.0.0.1 or
  // localhost. Without this, Next blocks /_next module scripts and the page
  // stays on the server HTML.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
