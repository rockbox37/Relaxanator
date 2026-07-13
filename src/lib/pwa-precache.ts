/**
 * Build-time helpers for PWA precache entries: walk public/ sample assets
 * and produce Serwist PrecacheEntry-shaped { url, revision } records.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export interface PrecacheUrlEntry {
  url: string;
  revision: string;
}

/**
 * Recursively list files under `publicDir` as root-relative URL paths
 * (POSIX `/…`), sorted for stable manifests.
 */
export function listPublicAssetUrls(publicDir: string): string[] {
  const urls: string[] = [];

  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      // Skip generated Serwist SW artifacts if they ever land under public/.
      if (name === "sw.js" || name.startsWith("swe-worker")) continue;
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!st.isFile()) continue;
      const rel = relative(publicDir, full).split(sep).join("/");
      urls.push(`/${rel}`);
    }
  };

  walk(publicDir);
  return urls.sort();
}

/**
 * Content-hash a file for cache busting (short sha256 hex).
 */
export function contentRevision(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex").slice(0, 16);
}

/**
 * Map a root-relative public URL (`/audio/…`) to an absolute path under
 * `publicDir`. Rejects path traversal and non-public URLs.
 */
export function publicUrlToPath(publicDir: string, url: string): string {
  if (!url.startsWith("/") || url.includes("\0") || url.includes("..")) {
    throw new Error(`Invalid public asset URL: ${url}`);
  }
  const rel = url.slice(1);
  return join(publicDir, ...rel.split("/"));
}

/**
 * Build precache entries for every file under `publicDir`, each with a
 * content-based revision so deploy diffs invalidate only changed assets.
 */
export function buildPublicPrecacheEntries(
  publicDir: string,
): PrecacheUrlEntry[] {
  return listPublicAssetUrls(publicDir).map((url) => ({
    url,
    revision: contentRevision(publicUrlToPath(publicDir, url)),
  }));
}

/**
 * App-shell navigation entry for `/` (and optional offline document).
 * Uses a shared revision string (typically git HEAD or build id).
 */
export function buildAppShellPrecacheEntries(
  revision: string,
  urls: readonly string[] = ["/"],
): PrecacheUrlEntry[] {
  return urls.map((url) => ({ url, revision }));
}
