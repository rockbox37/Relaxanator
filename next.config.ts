import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Fly.io Docker image.
  output: "standalone",
  // Pin the tracing root so a stray lockfile in a parent directory can't
  // change the standalone output layout between machines. process.cwd() is
  // the project root — next build always runs from it.
  outputFileTracingRoot: process.cwd(),
  // Node >= 22.10 resolves @swc/helpers via the `module-sync` export
  // (ESM). File tracing only follows the CJS `default` condition, so the
  // standalone image would crash with MODULE_NOT_FOUND on
  // esm/_interop_require_default.js. Force-include the ESM tree.
  // See: https://github.com/vercel/next.js/issues/90567
  outputFileTracingIncludes: {
    "/*": ["./node_modules/@swc/helpers/esm/**/*"],
  },
};

export default withSerwist(nextConfig);
