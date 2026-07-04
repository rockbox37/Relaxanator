import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Fly.io Docker image.
  output: "standalone",
  // Pin the tracing root so a stray lockfile in a parent directory can't
  // change the standalone output layout between machines.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
