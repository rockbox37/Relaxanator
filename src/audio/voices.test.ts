import { describe, expect, it } from "vitest";

import {
  FOG_HORN_2_INTERVAL_SEMITONES,
  FOG_HORN_2_TONE1_HZ,
  FOG_HORN_2_TONE2_HZ,
  FOG_HORN_4_INTERVAL_SEMITONES,
  FOG_HORN_4_TONE1_HZ,
  FOG_HORN_4_TONE2_HZ,
} from "./voices";

describe("fog horn 2 tuning", () => {
  it("places tone 2 a minor sixth plus one whole step (10 semitones) below tone 1", () => {
    const expectedTone2Hz = FOG_HORN_2_TONE1_HZ * 2 ** (-FOG_HORN_2_INTERVAL_SEMITONES / 12);
    expect(FOG_HORN_2_INTERVAL_SEMITONES).toBe(10);
    expect(FOG_HORN_2_TONE2_HZ).toBeCloseTo(expectedTone2Hz, 2);
    expect(FOG_HORN_2_TONE1_HZ).toBeCloseTo(146.83, 2);
    expect(FOG_HORN_2_TONE2_HZ).toBeCloseTo(82.41, 2);
  });
});

describe("fog horn 4 tuning", () => {
  it("places tone 2 a perfect fourth (5 semitones) below tone 1", () => {
    const expectedTone2Hz = FOG_HORN_4_TONE1_HZ * 2 ** (-FOG_HORN_4_INTERVAL_SEMITONES / 12);
    expect(FOG_HORN_4_INTERVAL_SEMITONES).toBe(5);
    expect(FOG_HORN_4_TONE2_HZ).toBeCloseTo(expectedTone2Hz, 2);
    expect(FOG_HORN_4_TONE1_HZ).toBeCloseTo(130.81, 2);
    expect(FOG_HORN_4_TONE2_HZ).toBeCloseTo(98.0, 2);
  });
});
