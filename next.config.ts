import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: everything (rendering, encoding, EXIF) runs in the
  // browser, so we export a plain HTML/JS/wasm bundle to `out/` that can be
  // hosted on any static host (Cloudflare Pages, COS, OSS, ...).
  output: "export",
  // A stray package-lock.json in a parent dir makes Turbopack infer the wrong
  // workspace root; pin it to this project.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
