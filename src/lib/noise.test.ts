import { describe, expect, it } from "vitest";

import { EQ_BAND_COUNT } from "./eq";
import {
  DEFAULT_MASTER_VOLUME,
  NOISE_COLORS,
  clampVolume,
  colorToIndex,
  createDefaultNoiseState,
} from "./noise";

describe("NOISE_COLORS", () => {
  it("offers white, pink, and brown in worklet param order", () => {
    expect(NOISE_COLORS.map((c) => c.id)).toEqual(["white", "pink", "brown"]);
  });
});

describe("clampVolume", () => {
  it("passes through in-range values", () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(1)).toBe(1);
  });

  it("clamps out-of-range values", () => {
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(-0.5)).toBe(0);
  });

  it("fails safe (silent) on NaN", () => {
    expect(clampVolume(Number.NaN)).toBe(0);
  });
});

describe("colorToIndex", () => {
  it("maps each color to its registry index", () => {
    expect(colorToIndex("white")).toBe(0);
    expect(colorToIndex("pink")).toBe(1);
    expect(colorToIndex("brown")).toBe(2);
  });

  it("falls back to white for unknown persisted values", () => {
    expect(colorToIndex("magenta" as Parameters<typeof colorToIndex>[0])).toBe(0);
  });
});

describe("createDefaultNoiseState", () => {
  it("defaults to brown noise at moderate volume with a flat curve", () => {
    const state = createDefaultNoiseState();
    expect(state.color).toBe("brown");
    expect(state.masterVolume).toBe(DEFAULT_MASTER_VOLUME);
    expect(state.eqCurve).toHaveLength(EQ_BAND_COUNT);
    expect(state.eqCurve.every((b) => b.gainDb === 0)).toBe(true);
  });
});
