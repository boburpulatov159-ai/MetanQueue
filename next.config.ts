import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is off: almost every page reads the Supabase session cookie,
  // and with it on each read must sit behind <Suspense> or the build fails.
  turbopack: {
    // A stray package-lock.json on the Desktop made Next pick the wrong workspace root.
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
