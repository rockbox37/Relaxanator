import { describe, expect, it } from "vitest";

import {
  GLOW_DURATION_MS,
  type GlowState,
  glowingIds,
  pruneGlow,
  triggerGlow,
} from "./sound-glow";

describe("triggerGlow", () => {
  it("lights a voice with an expiry one duration out", () => {
    const state = triggerGlow({}, "bell", 1000);
    expect(state.bell).toBe(1000 + GLOW_DURATION_MS);
  });

  it("refreshes (does not stack) an already-lit voice", () => {
    const first = triggerGlow({}, "bell", 1000, 500);
    const refreshed = triggerGlow(first, "bell", 1200, 500);
    expect(Object.keys(refreshed)).toEqual(["bell"]);
    expect(refreshed.bell).toBe(1200 + 500);
  });

  it("does not mutate the input map", () => {
    const state: GlowState = {};
    triggerGlow(state, "bell", 1000);
    expect(state).toEqual({});
  });

  it("clamps a negative duration to zero", () => {
    const state = triggerGlow({}, "bell", 1000, -50);
    expect(state.bell).toBe(1000);
  });
});

describe("pruneGlow", () => {
  it("drops elapsed entries and keeps live ones", () => {
    const state: GlowState = { bell: 2000, chime: 500 };
    expect(pruneGlow(state, 1000)).toEqual({ bell: 2000 });
  });

  it("treats an exactly-expired entry as elapsed", () => {
    expect(pruneGlow({ bell: 1000 }, 1000)).toEqual({});
  });

  it("returns an empty map when everything has elapsed", () => {
    expect(pruneGlow({ a: 10, b: 20 }, 100)).toEqual({});
  });
});

describe("glowingIds", () => {
  it("returns the set of currently-lit voiceIds", () => {
    const state: GlowState = { bell: 2000, chime: 500, drone: 3000 };
    expect(glowingIds(state, 1000)).toEqual(new Set(["bell", "drone"]));
  });

  it("is empty when nothing is lit", () => {
    expect(glowingIds({}, 1000)).toEqual(new Set());
  });
});
