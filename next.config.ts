import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: virtually every page is per-user and request-time anyway.
  experimental: {
    // Revisiting a tab within 30s reuses the client copy instead of re-rendering on the server. Server actions
    // revalidate, which purges this cache, so the only lag is for runs imported in the background.
    staleTimes: { dynamic: 30 },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
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
