import { describe, expect, it } from "vitest";

import { EQ_BAND_COUNT, createFlatEqCurve } from "./eq";
import {
  DEFAULT_MASTER_VOLUME,
  EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR,
  NOISE_COLORS,
  clampVolume,
  colorToIndex,
  createDefaultNoiseState,
  eqCurveForColor,
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

describe("eqCurveForColor", () => {
  it("gives white a flat curve", () => {
    expect(eqCurveForColor("white")).toEqual(createFlatEqCurve());
  });

  it("gives every color a full-length curve", () => {
    for (const color of NOISE_COLORS) {
      expect(eqCurveForColor(color.id)).toHaveLength(EQ_BAND_COUNT);
    }
  });

  it("rolls off darker colors more steeply (white < pink < brown)", () => {
    const bass = (color: (typeof NOISE_COLORS)[number]["id"]) =>
      eqCurveForColor(color)[0].gainDb;
    const treble = (color: (typeof NOISE_COLORS)[number]["id"]) =>
      eqCurveForColor(color)[EQ_BAND_COUNT - 1].gainDb;
    expect(bass("white")).toBeLessThan(bass("pink"));
    expect(bass("pink")).toBeLessThanOrEqual(bass("brown"));
    expect(treble("white")).toBeGreaterThan(treble("pink"));
    expect(treble("pink")).toBeGreaterThanOrEqual(treble("brown"));
  });

  it("uses the classic 0 / 3 / 6 dB-per-octave slopes", () => {
    expect(EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR).toEqual({ white: 0, pink: 3, brown: 6 });
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
