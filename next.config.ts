import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components is off: virtually every page is per-user and request-time anyway.
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
