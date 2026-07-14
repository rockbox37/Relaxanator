import { describe, expect, it } from "vitest";

import {
  DARK_CHIME_FUNDAMENTAL_HZ,
  DOOM_BELL_FUNDAMENTAL_HZ,
  FOG_HORN_1_INTERVAL_SEMITONES,
  FOG_HORN_1_TONE1_HZ,
  FOG_HORN_1_TONE2_HZ,
  FOG_HORN_2_INTERVAL_SEMITONES,
  FOG_HORN_2_TONE1_HZ,
  FOG_HORN_2_TONE2_HZ,
  FOG_HORN_3_INTERVAL_SEMITONES,
  FOG_HORN_3_TONE1_HZ,
  FOG_HORN_3_TONE2_HZ,
  FOG_HORN_4_INTERVAL_SEMITONES,
  FOG_HORN_4_TONE1_HZ,
  FOG_HORN_4_TONE2_HZ,
} from "./voices";

describe("doom bell tuning (#65)", () => {
  it("uses F3 (174.61 Hz) — one octave above prior F2", () => {
    expect(DOOM_BELL_FUNDAMENTAL_HZ).toBeCloseTo(174.61, 2);
    // Prior F2 was 87.31; exact 2× is 174.62 due to rounding — F3 is 174.61.
    expect(DOOM_BELL_FUNDAMENTAL_HZ / 87.31).toBeCloseTo(2, 1);
  });
});

describe("dark chime tuning (#66)", () => {
  it("uses A3 (220 Hz) — 3 semitones below Chime C4", () => {
    const chimeC4Hz = 261.63;
    expect(DARK_CHIME_FUNDAMENTAL_HZ).toBeCloseTo(220.0, 2);
    // 3 semitones below C4: 261.63 * 2^(-3/12) ≈ 219.99
    expect(DARK_CHIME_FUNDAMENTAL_HZ).toBeCloseTo(chimeC4Hz * 2 ** (-3 / 12), 1);
    // Still a chime register — well above Bell C3 (130.81) and doom bell F3.
    expect(DARK_CHIME_FUNDAMENTAL_HZ).toBeGreaterThan(174.61);
    expect(DARK_CHIME_FUNDAMENTAL_HZ).toBeLessThan(chimeC4Hz);
  });
});

describe("fog horn 1 tuning", () => {
  it("places tone 2 a perfect fifth (7 semitones) below tone 1", () => {
    const expectedTone2Hz = FOG_HORN_1_TONE1_HZ * 2 ** (-FOG_HORN_1_INTERVAL_SEMITONES / 12);
    expect(FOG_HORN_1_INTERVAL_SEMITONES).toBe(7);
    expect(FOG_HORN_1_TONE2_HZ).toBeCloseTo(expectedTone2Hz, 2);
    expect(FOG_HORN_1_TONE1_HZ).toBeCloseTo(123.47, 2);
    expect(FOG_HORN_1_TONE2_HZ).toBeCloseTo(82.41, 2);
  });
});

describe("fog horn 2 tuning", () => {
  it("places tone 2 a perfect fifth (7 semitones) below tone 1", () => {
    const expectedTone2Hz = FOG_HORN_2_TONE1_HZ * 2 ** (-FOG_HORN_2_INTERVAL_SEMITONES / 12);
    expect(FOG_HORN_2_INTERVAL_SEMITONES).toBe(7);
    expect(FOG_HORN_2_TONE2_HZ).toBeCloseTo(expectedTone2Hz, 2);
    expect(FOG_HORN_2_TONE1_HZ).toBeCloseTo(146.83, 2);
    expect(FOG_HORN_2_TONE2_HZ).toBeCloseTo(98.0, 2);
  });
});

describe("fog horn 3 tuning", () => {
  it("places tone 2 a perfect fifth (7 semitones) below tone 1", () => {
    const expectedTone2Hz = FOG_HORN_3_TONE1_HZ * 2 ** (-FOG_HORN_3_INTERVAL_SEMITONES / 12);
    expect(FOG_HORN_3_INTERVAL_SEMITONES).toBe(7);
    expect(FOG_HORN_3_TONE2_HZ).toBeCloseTo(expectedTone2Hz, 2);
    expect(FOG_HORN_3_TONE1_HZ).toBeCloseTo(130.81, 2);
    expect(FOG_HORN_3_TONE2_HZ).toBeCloseTo(87.31, 2);
  });
});

describe("fog horn 4 tuning", () => {
  it("places tone 2 a perfect fifth (7 semitones) below tone 1", () => {
    const expectedTone2Hz = FOG_HORN_4_TONE1_HZ * 2 ** (-FOG_HORN_4_INTERVAL_SEMITONES / 12);
    expect(FOG_HORN_4_INTERVAL_SEMITONES).toBe(7);
    expect(FOG_HORN_4_TONE2_HZ).toBeCloseTo(expectedTone2Hz, 2);
    expect(FOG_HORN_4_TONE1_HZ).toBeCloseTo(130.81, 2);
    expect(FOG_HORN_4_TONE2_HZ).toBeCloseTo(87.31, 2);
  });
});

describe("fog horn family interval alignment (#54)", () => {
  it("uses the same perfect-fifth interval for all four fog horns", () => {
    expect(FOG_HORN_1_INTERVAL_SEMITONES).toBe(FOG_HORN_3_INTERVAL_SEMITONES);
    expect(FOG_HORN_2_INTERVAL_SEMITONES).toBe(FOG_HORN_3_INTERVAL_SEMITONES);
    expect(FOG_HORN_4_INTERVAL_SEMITONES).toBe(FOG_HORN_3_INTERVAL_SEMITONES);
  });
});
