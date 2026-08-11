import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle with only the node_modules actually
  // reached at runtime. Required for a reasonably-sized Cloud Run image.
  output: "standalone",

  images: {
    // Pokemon sprites come from PokeAPI's asset repo; fusion artwork from the
    // app's own GCS bucket. Declared for any future next/image usage - the
    // game itself renders the fusion with a plain <img> so a CSS transform can
    // be applied directly to it.
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default nextConfig;
