import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { createSerwistRoute } from "@serwist/turbopack";

import {
  buildAppShellPrecacheEntries,
  buildPublicPrecacheEntries,
} from "@/lib/pwa-precache";

/**
 * Build revision for app-shell documents. Prefer git HEAD so each deploy
 * busts the navigation precache; fall back to a random id outside git.
 */
const gitHead = spawnSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf-8",
}).stdout?.trim();
const revision = gitHead && gitHead.length > 0 ? gitHead : crypto.randomUUID();

const publicDir = join(process.cwd(), "public");
const additionalPrecacheEntries = [
  ...buildAppShellPrecacheEntries(revision),
  ...buildPublicPrecacheEntries(publicDir),
];

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries,
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
