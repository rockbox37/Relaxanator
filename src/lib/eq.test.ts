import { describe, expect, it } from "vitest";

import {
  EQ_BAND_COUNT,
  EQ_BAND_FREQUENCIES,
  EQ_GAIN_MAX_DB,
  EQ_GAIN_MIN_DB,
  clampGainDb,
  createFlatEqCurve,
  formatFrequency,
  withBandGain,
} from "./eq";

describe("EQ_BAND_FREQUENCIES", () => {
  it("has 10 octave-spaced bands from 31 Hz to 16 kHz", () => {
    expect(EQ_BAND_COUNT).toBe(10);
    expect(EQ_BAND_FREQUENCIES[0]).toBe(31);
    expect(EQ_BAND_FREQUENCIES[9]).toBe(16000);
    for (let i = 1; i < EQ_BAND_FREQUENCIES.length; i += 1) {
      const ratio = EQ_BAND_FREQUENCIES[i] / EQ_BAND_FREQUENCIES[i - 1];
      expect(ratio).toBeGreaterThan(1.9);
      expect(ratio).toBeLessThan(2.1);
    }
  });
});

describe("clampGainDb", () => {
  it("passes through in-range values", () => {
    expect(clampGainDb(0)).toBe(0);
    expect(clampGainDb(-11.5)).toBe(-11.5);
    expect(clampGainDb(12)).toBe(12);
  });

  it("clamps to the slider range", () => {
    expect(clampGainDb(100)).toBe(EQ_GAIN_MAX_DB);
    expect(clampGainDb(-100)).toBe(EQ_GAIN_MIN_DB);
  });

  it("treats NaN as flat", () => {
    expect(clampGainDb(Number.NaN)).toBe(0);
  });
});

describe("createFlatEqCurve", () => {
  it("returns all bands at zero gain", () => {
    const curve = createFlatEqCurve();
    expect(curve).toHaveLength(EQ_BAND_COUNT);
    expect(curve.map((b) => b.frequency)).toEqual([...EQ_BAND_FREQUENCIES]);
    expect(curve.every((b) => b.gainDb === 0)).toBe(true);
  });

  it("returns fresh objects each call", () => {
    const a = createFlatEqCurve();
    const b = createFlatEqCurve();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
  });
});

describe("withBandGain", () => {
  it("replaces one band's gain without mutating the input", () => {
    const curve = createFlatEqCurve();
    const next = withBandGain(curve, 3, 6);
    expect(next[3].gainDb).toBe(6);
    expect(curve[3].gainDb).toBe(0);
    expect(next.filter((b) => b.gainDb === 0)).toHaveLength(9);
  });

  it("clamps the new gain", () => {
    const next = withBandGain(createFlatEqCurve(), 0, 99);
    expect(next[0].gainDb).toBe(EQ_GAIN_MAX_DB);
  });

  it("ignores out-of-range indexes", () => {
    const curve = createFlatEqCurve();
    expect(withBandGain(curve, -1, 6)).toEqual(curve);
    expect(withBandGain(curve, 10, 6)).toEqual(curve);
  });
});

describe("formatFrequency", () => {
  it("formats sub-kHz values in Hz", () => {
    expect(formatFrequency(31)).toBe("31 Hz");
    expect(formatFrequency(500)).toBe("500 Hz");
  });

  it("formats kHz values, trimming whole numbers", () => {
    expect(formatFrequency(1000)).toBe("1 kHz");
    expect(formatFrequency(1500)).toBe("1.5 kHz");
    expect(formatFrequency(16000)).toBe("16 kHz");
  });
});
