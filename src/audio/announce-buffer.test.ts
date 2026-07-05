import { describe, expect, it } from "vitest";

import {
  SPRITE_DECODE_FADE_SEC,
  fadeInDecodedBuffer,
} from "./announce-buffer";

function makeBuffer(
  samples: number[],
  sampleRate = 22050,
): AudioBuffer {
  const channel = new Float32Array(samples);
  const buffer = {
    sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    duration: samples.length / sampleRate,
    getChannelData() {
      return channel;
    },
  };
  return buffer as unknown as AudioBuffer;
}

describe("fadeInDecodedBuffer", () => {
  it("exports a short decode-time fade constant", () => {
    expect(SPRITE_DECODE_FADE_SEC).toBeGreaterThan(0.005);
    expect(SPRITE_DECODE_FADE_SEC).toBeLessThan(0.05);
  });

  it("ramps the first samples to zero while leaving the tail intact", () => {
    const tail = 0.42;
    const samples = Array.from({ length: 300 }, (_, i) =>
      i < 20 ? 0.25 : tail,
    );
    const buffer = makeBuffer(samples);
    fadeInDecodedBuffer(buffer, 0.01);

    const data = buffer.getChannelData(0);
    expect(data[0]).toBe(0);
    expect(data[1]).toBeGreaterThan(0);
    expect(data[19]).toBeLessThan(0.25);
    expect(data[250]).toBeCloseTo(tail);
  });
});
