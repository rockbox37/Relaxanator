import { describe, expect, it } from "vitest";

import {
  CANONICAL_HOST,
  CANONICAL_REDIRECT_STATUS,
  WWW_HOST,
  canonicalRedirectTarget,
  normalizeHost,
} from "./canonical-host";

describe("normalizeHost", () => {
  it("returns empty string for nullish/empty input", () => {
    expect(normalizeHost(null)).toBe("");
    expect(normalizeHost(undefined)).toBe("");
    expect(normalizeHost("")).toBe("");
  });

  it("lowercases and strips any port suffix", () => {
    expect(normalizeHost("WWW.Relaxanator.com")).toBe(WWW_HOST);
    expect(normalizeHost("www.relaxanator.com:443")).toBe(WWW_HOST);
    expect(normalizeHost("  Relaxanator.COM  ")).toBe(CANONICAL_HOST);
  });
});

describe("canonicalRedirectTarget", () => {
  it("redirects the www alias to the apex, preserving the path", () => {
    expect(canonicalRedirectTarget(WWW_HOST, "/")).toBe(`https://${CANONICAL_HOST}/`);
    expect(canonicalRedirectTarget(WWW_HOST, "/breathe")).toBe(
      `https://${CANONICAL_HOST}/breathe`,
    );
  });

  it("preserves the query string verbatim", () => {
    expect(canonicalRedirectTarget(WWW_HOST, "/breathe?voice=alto&x=1")).toBe(
      `https://${CANONICAL_HOST}/breathe?voice=alto&x=1`,
    );
  });

  it("matches www case-insensitively and ignores the port", () => {
    expect(canonicalRedirectTarget("WWW.Relaxanator.com", "/a")).toBe(
      `https://${CANONICAL_HOST}/a`,
    );
    expect(canonicalRedirectTarget("www.relaxanator.com:8080", "/a")).toBe(
      `https://${CANONICAL_HOST}/a`,
    );
  });

  it("anchors a missing leading slash at root", () => {
    expect(canonicalRedirectTarget(WWW_HOST, "")).toBe(`https://${CANONICAL_HOST}/`);
    expect(canonicalRedirectTarget(WWW_HOST, "breathe")).toBe(
      `https://${CANONICAL_HOST}/breathe`,
    );
  });

  it("does not redirect the apex itself", () => {
    expect(canonicalRedirectTarget(CANONICAL_HOST, "/breathe?x=1")).toBeNull();
  });

  it("does not redirect localhost or dev hosts", () => {
    expect(canonicalRedirectTarget("localhost", "/")).toBeNull();
    expect(canonicalRedirectTarget("localhost:3000", "/breathe")).toBeNull();
    expect(canonicalRedirectTarget("127.0.0.1", "/")).toBeNull();
  });

  it("does not redirect Fly preview hosts", () => {
    expect(canonicalRedirectTarget("relaxanator.fly.dev", "/")).toBeNull();
    expect(canonicalRedirectTarget("relaxanator.fly.dev:443", "/breathe")).toBeNull();
  });

  it("does not redirect unrelated or lookalike hosts", () => {
    expect(canonicalRedirectTarget("evil.com", "/")).toBeNull();
    expect(canonicalRedirectTarget("www.relaxanator.com.evil.com", "/")).toBeNull();
    expect(canonicalRedirectTarget("notwww.relaxanator.com", "/")).toBeNull();
    expect(canonicalRedirectTarget(null, "/")).toBeNull();
    expect(canonicalRedirectTarget(undefined, "/")).toBeNull();
  });
});

describe("CANONICAL_REDIRECT_STATUS", () => {
  it("is a permanent, method-preserving redirect", () => {
    expect(CANONICAL_REDIRECT_STATUS).toBe(308);
  });
});
