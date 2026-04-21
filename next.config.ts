import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  // `ws` has an optional `require('bufferutil')` that Next's bundler rewrites
  // into a stub returning `{}`, causing `bufferUtil.mask is not a function`
  // at runtime. Marking `ws` / `msedge-tts` as external keeps them as plain
  // CJS requires resolved from node_modules at request time, which preserves
  // the intended try/catch fallback in ws/lib/buffer-util.js.
  serverExternalPackages: ["ws", "msedge-tts"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
