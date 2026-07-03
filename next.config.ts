import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray package-lock.json in a parent dir makes Turbopack infer the wrong
  // workspace root; pin it to this project.
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ["sharp", "archiver", "opentype.js"],
  // Ship the bundled .ttf files inside the serverless functions that render.
  outputFileTracingIncludes: {
    "/api/preview": ["./public/fonts/**"],
    "/api/stamp": ["./public/fonts/**"],
  },
};

export default nextConfig;
