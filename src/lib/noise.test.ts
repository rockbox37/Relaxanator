import { describe, expect, it } from "vitest";

import { EQ_BAND_COUNT, EQ_GAIN_MIN_DB, createFlatEqCurve } from "./eq";
import {
  DEFAULT_MASTER_VOLUME,
  DEFAULT_NOISE_COLOR,
  EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR,
  NOISE_COLORS,
  clampVolume,
  colorToIndex,
  createDefaultNoiseState,
  darkBrownEqCurve,
  eqCurveForColor,
} from "./noise";

describe("NOISE_COLORS", () => {
  it("offers white, pink, brown, and dark-brown in worklet param order", () => {
    expect(NOISE_COLORS.map((c) => c.id)).toEqual([
      "white",
      "pink",
      "brown",
      "dark-brown",
    ]);
  });

  it("labels Dark Brown for the UI", () => {
    expect(NOISE_COLORS.find((c) => c.id === "dark-brown")?.label).toBe("Dark Brown");
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
    expect(colorToIndex("dark-brown")).toBe(3);
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
    const bass = (color: "white" | "pink" | "brown") => eqCurveForColor(color)[0].gainDb;
    const treble = (color: "white" | "pink" | "brown") =>
      eqCurveForColor(color)[EQ_BAND_COUNT - 1].gainDb;
    expect(bass("white")).toBeLessThan(bass("pink"));
    expect(bass("pink")).toBeLessThanOrEqual(bass("brown"));
    expect(treble("white")).toBeGreaterThan(treble("pink"));
    expect(treble("pink")).toBeGreaterThanOrEqual(treble("brown"));
  });

  it("uses the classic 0 / 3 / 6 dB-per-octave slopes for white/pink/brown", () => {
    expect(EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR).toEqual({ white: 0, pink: 3, brown: 6 });
  });

  it("keeps Brown’s curve unchanged", () => {
    expect(eqCurveForColor("brown").map((b) => [b.frequency, b.gainDb])).toEqual([
      [31, 12],
      [63, 12],
      [125, 12],
      [250, 9],
      [500, 3],
      [1000, -3],
      [2000, -9],
      [4000, -12],
      [8000, -12],
      [16000, -12],
    ]);
  });
});

describe("darkBrownEqCurve / Dark Brown (#68)", () => {
  it("matches the Dark Brown per-band table", () => {
    expect(eqCurveForColor("dark-brown")).toEqual(darkBrownEqCurve());
    expect(eqCurveForColor("dark-brown").map((b) => [b.frequency, b.gainDb])).toEqual([
      [31, 12],
      [63, 12],
      [125, 12],
      [250, 2],
      [500, EQ_GAIN_MIN_DB],
      [1000, EQ_GAIN_MIN_DB],
      [2000, EQ_GAIN_MIN_DB],
      [4000, EQ_GAIN_MIN_DB],
      [8000, EQ_GAIN_MIN_DB],
      [16000, EQ_GAIN_MIN_DB],
    ]);
  });

  it("matches Brown through 125 Hz and shelves mids/highs", () => {
    const brown = eqCurveForColor("brown");
    const dark = eqCurveForColor("dark-brown");
    for (let i = 0; i < 3; i += 1) {
      expect(dark[i]).toEqual(brown[i]);
    }
    expect(dark[3].gainDb).toBe(2);
    expect(dark.slice(4).every((b) => b.gainDb === EQ_GAIN_MIN_DB)).toBe(true);
  });
});

describe("createDefaultNoiseState", () => {
  it("defaults to brown noise at moderate volume", () => {
    const state = createDefaultNoiseState();
    expect(DEFAULT_NOISE_COLOR).toBe("brown");
    expect(state.color).toBe(DEFAULT_NOISE_COLOR);
    expect(state.masterVolume).toBe(DEFAULT_MASTER_VOLUME);
    expect(state.eqCurve).toHaveLength(EQ_BAND_COUNT);
  });

  it("seeds the EQ curve from the default color, not flat", () => {
    const state = createDefaultNoiseState();
    expect(state.eqCurve).toEqual(eqCurveForColor(DEFAULT_NOISE_COLOR));
    // Brown rolls off, so the startup curve is not flat.
    expect(state.eqCurve).not.toEqual(createFlatEqCurve());
    expect(state.eqCurve.some((b) => b.gainDb !== 0)).toBe(true);
  });
});
