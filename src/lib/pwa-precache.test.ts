import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildAppShellPrecacheEntries,
  buildPublicPrecacheEntries,
  contentRevision,
  listPublicAssetUrls,
  publicUrlToPath,
} from "./pwa-precache";

function fixturePublicDir(): string {
  const root = mkdtempSync(join(tmpdir(), "relaxanator-pwa-"));
  mkdirSync(join(root, "audio", "tts", "hal"), { recursive: true });
  mkdirSync(join(root, "worklets"), { recursive: true });
  writeFileSync(join(root, "logo.png"), "logo-bytes");
  writeFileSync(join(root, "audio", "tts", "hal", "one.wav"), "wav-one");
  writeFileSync(join(root, "worklets", "noise-processor.js"), "worklet");
  // Generated SW artifacts must be ignored.
  writeFileSync(join(root, "sw.js"), "generated");
  writeFileSync(join(root, "swe-worker-abc.js"), "generated");
  return root;
}

describe("listPublicAssetUrls", () => {
  it("lists every real public file as a sorted root-relative URL", () => {
    const dir = fixturePublicDir();
    expect(listPublicAssetUrls(dir)).toEqual([
      "/audio/tts/hal/one.wav",
      "/logo.png",
      "/worklets/noise-processor.js",
    ]);
  });
});

describe("contentRevision / publicUrlToPath", () => {
  it("hashes file contents and maps URLs under publicDir", () => {
    const dir = fixturePublicDir();
    const path = publicUrlToPath(dir, "/logo.png");
    const expected = createHash("sha256")
      .update("logo-bytes")
      .digest("hex")
      .slice(0, 16);
    expect(contentRevision(path)).toBe(expected);
  });

  it("rejects path traversal and non-root URLs", () => {
    const dir = fixturePublicDir();
    expect(() => publicUrlToPath(dir, "../secret")).toThrow(/Invalid/);
    expect(() => publicUrlToPath(dir, "/../secret")).toThrow(/Invalid/);
    expect(() => publicUrlToPath(dir, "logo.png")).toThrow(/Invalid/);
  });
});

describe("buildPublicPrecacheEntries", () => {
  it("attaches a content revision to each public asset URL", () => {
    const dir = fixturePublicDir();
    const entries = buildPublicPrecacheEntries(dir);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.url)).toEqual([
      "/audio/tts/hal/one.wav",
      "/logo.png",
      "/worklets/noise-processor.js",
    ]);
    for (const entry of entries) {
      expect(entry.revision).toMatch(/^[a-f0-9]{16}$/);
    }
  });
});

describe("buildAppShellPrecacheEntries", () => {
  it("tags navigation documents with the shared build revision", () => {
    expect(buildAppShellPrecacheEntries("abc123")).toEqual([
      { url: "/", revision: "abc123" },
    ]);
    expect(buildAppShellPrecacheEntries("rev", ["/", "/offline"])).toEqual([
      { url: "/", revision: "rev" },
      { url: "/offline", revision: "rev" },
    ]);
  });
});
