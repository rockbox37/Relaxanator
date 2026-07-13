import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Fly.io Docker image.
  output: "standalone",
  // Pin the tracing root so a stray lockfile in a parent directory can't
  // change the standalone output layout between machines. process.cwd() is
  // the project root — next build always runs from it.
  outputFileTracingRoot: process.cwd(),
};

export default withSerwist(nextConfig);
