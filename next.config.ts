import type { NextConfig } from "next";

/**
 * `output: "export"` keeps the build a pure static bundle, which is what
 * Capacitor needs to wrap the app into an Android project (`npx cap add android`).
 * Unoptimized images are required by the static export for the same reason.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
