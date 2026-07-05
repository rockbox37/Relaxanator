import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HAL_OUTPUT_GAIN,
  VOCODER_CARRIER_WAVE,
  VOCODER_GAIN_FLOOR,
  VOCODER_OUTPUT_GAIN,
  getModulatorEnvelopeCurve,
} from "./announce-voice";
import { ANNOUNCE_WORDS } from "../lib/announce";

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

  it("does not attenuate HAL beyond plain voice level", () => {
    expect(HAL_OUTPUT_GAIN).toBe(1);
  });
});

describe("HAL word sprites", () => {
  /** macOS `say` in a sandbox emits 4096-byte FLLR silence — real sprites are much larger. */
  const MIN_HAL_SPRITE_BYTES = 8000;

  it("ships non-silent Daniel TTS sprites for every word", () => {
    for (const word of ANNOUNCE_WORDS) {
      const path = join(process.cwd(), "public/audio/tts/hal", `${word}.wav`);
      const bytes = readFileSync(path);
      expect(bytes.byteLength, `${word}.wav`).toBeGreaterThan(MIN_HAL_SPRITE_BYTES);
    }
  });
});
