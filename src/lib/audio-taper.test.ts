import { describe, expect, it } from "vitest";

import { TAPER_EXPONENT, sliderToGain } from "./audio-taper";

describe("sliderToGain", () => {
  it("preserves the extremes (0 -> silent, 1 -> unity)", () => {
    expect(sliderToGain(0)).toBe(0);
    expect(sliderToGain(1)).toBe(1);
  });

  it("is monotonically increasing across the travel", () => {
    let prev = -1;
    for (let i = 0; i <= 100; i += 1) {
      const gain = sliderToGain(i / 100);
      expect(gain).toBeGreaterThan(prev);
      prev = gain;
    }
  });

  it("is sub-linear (mid-travel gain noticeably below linear)", () => {
    // Linear would give 0.5 at the midpoint; the taper must be well below it.
    expect(sliderToGain(0.5)).toBeLessThan(0.5);
    expect(sliderToGain(0.5)).toBeCloseTo(0.5 ** TAPER_EXPONENT, 10);
    // Below linear across the interior of the range.
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(sliderToGain(p)).toBeLessThan(p);
    }
  });

  it("matches the documented power curve", () => {
    expect(sliderToGain(0.25)).toBeCloseTo(0.25 ** TAPER_EXPONENT, 10);
    expect(sliderToGain(0.75)).toBeCloseTo(0.75 ** TAPER_EXPONENT, 10);
  });

  it("clamps out-of-range and NaN inputs", () => {
    expect(sliderToGain(-1)).toBe(0);
    expect(sliderToGain(2)).toBe(1);
    expect(sliderToGain(Number.NaN)).toBe(0);
  });
});
