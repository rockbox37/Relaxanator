import { describe, expect, it } from "vitest";

import {
  VOCODER_CARRIER_WAVE,
  VOCODER_GAIN_FLOOR,
  VOCODER_OUTPUT_GAIN,
  getModulatorEnvelopeCurve,
} from "./announce-voice";

describe("announce vocoder carrier", () => {
  it("uses a sawtooth carrier, not square", () => {
    expect(VOCODER_CARRIER_WAVE).toBe("sawtooth");
    expect(VOCODER_CARRIER_WAVE).not.toBe("square");
  });

  it("rectifies the modulator to a unipolar envelope", () => {
    const curve = getModulatorEnvelopeCurve();
    expect(curve.length).toBeGreaterThan(0);
    for (const sample of curve) {
      expect(sample).toBeGreaterThanOrEqual(0);
      expect(sample).toBeLessThanOrEqual(1);
    }
    expect(curve[0]).toBe(1);
    expect(curve[curve.length - 1]).toBe(1);
    expect(Math.min(...curve)).toBeCloseTo(0, 2);
  });

  it("keeps vocoder gain positive and loud enough to hear", () => {
    expect(VOCODER_GAIN_FLOOR).toBeGreaterThan(0);
    expect(VOCODER_OUTPUT_GAIN).toBeGreaterThanOrEqual(0.85);
  });
});
