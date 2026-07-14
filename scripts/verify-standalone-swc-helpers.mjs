#!/usr/bin/env node
/**
 * Post-build gate: Next standalone must ship @swc/helpers ESM files.
 * Node >= 22.10 resolves helpers via `module-sync` → esm/*, but NFT only
 * traces the CJS default condition unless outputFileTracingIncludes covers them.
 */
import { access } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const helper = join(
  root,
  ".next/standalone/node_modules/@swc/helpers/esm/_interop_require_default.js",
);

try {
  await access(helper);
  console.log("ok: standalone includes @swc/helpers ESM interop helper");
} catch {
  console.error(
    "FAIL: missing",
    helper,
    "\nEnsure next.config outputFileTracingIncludes covers ./node_modules/@swc/helpers/esm/**/*",
  );
  process.exit(1);
}
