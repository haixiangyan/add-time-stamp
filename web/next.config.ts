import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "archiver", "opentype.js"],
  // Ship the bundled .ttf files inside the serverless functions that render.
  outputFileTracingIncludes: {
    "/api/preview": ["./fonts/**"],
    "/api/stamp": ["./fonts/**"],
  },
};

export default nextConfig;
