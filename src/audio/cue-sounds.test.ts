import { describe, expect, it, vi } from "vitest";

import { CUE_SOUNDS } from "@/lib/cue-sounds";

import { playCueSound } from "./cue-sounds";

function mockAudioContext() {
  const createOscillator = vi.fn(() => ({
    type: "sine",
    frequency: { value: 440 },
    connect: vi.fn(function connect(this: unknown, next: unknown) {
      return next;
    }),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as null | (() => void),
  }));

  const createGain = vi.fn(() => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(function connect(this: unknown, next: unknown) {
      return next;
    }),
    disconnect: vi.fn(),
  }));

  const createBiquadFilter = vi.fn(() => ({
    type: "lowpass",
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(function connect(this: unknown, next: unknown) {
      return next;
    }),
    disconnect: vi.fn(),
  }));

  return {
    createOscillator,
    createGain,
    createBiquadFilter,
    currentTime: 0,
    destination: {},
  } as unknown as BaseAudioContext & {
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
  };
}

describe("playCueSound", () => {
  it("schedules oscillators for every registered cue sound", () => {
    for (const sound of CUE_SOUNDS) {
      const ctx = mockAudioContext();
      const dest = { connect: vi.fn() } as unknown as AudioNode;
      playCueSound(sound.id, ctx, dest, 1.5, 0.5);
      expect(ctx.createOscillator).toHaveBeenCalled();
      expect(ctx.createGain).toHaveBeenCalled();
    }
  });

  it("falls back to the chime for an unknown id without throwing", () => {
    const ctx = mockAudioContext();
    const dest = { connect: vi.fn() } as unknown as AudioNode;
    expect(() =>
      // @ts-expect-error — exercising the runtime fallback path
      playCueSound("does-not-exist", ctx, dest, 0, 0.5),
    ).not.toThrow();
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2); // chime = 2 tones
  });
});
