import { describe, expect, it, vi } from "vitest";

import type { ChordNoteEvent } from "@/lib/chords";

import { playChordVoice } from "./chord-voices";

/** Records created oscillators so tests can fire their onended callbacks. */
function mockCtx() {
  const oscillators: Array<{
    onended: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];
  const disconnects = { lowpass: 0, gains: 0 };

  const ctx = {
    currentTime: 0,
    createOscillator: vi.fn(() => {
      const osc = {
        type: "sine" as OscillatorType,
        frequency: { value: 0 },
        detune: { value: 0 },
        connect: vi.fn(function connect(this: unknown, next: unknown) {
          return next;
        }),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(function connect(this: unknown, next: unknown) {
        return next;
      }),
      disconnect: vi.fn(() => {
        disconnects.gains += 1;
      }),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: "lowpass" as BiquadFilterType,
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(function connect(this: unknown, next: unknown) {
        return next;
      }),
      disconnect: vi.fn(() => {
        disconnects.lowpass += 1;
      }),
    })),
  };

  return {
    ctx: ctx as unknown as BaseAudioContext,
    oscillators,
    disconnects,
  };
}

const events: ChordNoteEvent[] = [
  { hz: 261.63, whenSec: 0, gain: 1, holdSec: 2 },
  { hz: 329.63, whenSec: 0, gain: 0.8, holdSec: 2 },
  { hz: 392.0, whenSec: 0, gain: 0.8, holdSec: 2 },
];

describe("playChordVoice", () => {
  it("does nothing for an empty play-plan", () => {
    const { ctx, oscillators } = mockCtx();
    playChordVoice("rhodes", ctx, {} as AudioNode, [], 0.5);
    expect(oscillators).toHaveLength(0);
    expect(ctx.createGain).not.toHaveBeenCalled();
  });

  it("schedules one oscillator per partial per note through a shared chain", () => {
    const { ctx, oscillators } = mockCtx();
    playChordVoice("rhodes", ctx, {} as AudioNode, events, 0.5);
    // rhodes has 3 partials, 3 notes -> 9 oscillators.
    expect(oscillators).toHaveLength(9);
    expect(ctx.createBiquadFilter).toHaveBeenCalledTimes(1);
    for (const osc of oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it("tears down the shared chain only after the last oscillator ends", () => {
    const { ctx, oscillators, disconnects } = mockCtx();
    playChordVoice("rhodes", ctx, {} as AudioNode, events, 0.5);
    // Fire all-but-one onended: nothing disconnects yet.
    for (let i = 0; i < oscillators.length - 1; i += 1) {
      oscillators[i].onended?.();
    }
    expect(disconnects.lowpass).toBe(0);
    expect(disconnects.gains).toBe(0);
    // Final oscillator ends -> chain disconnects once.
    oscillators[oscillators.length - 1].onended?.();
    expect(disconnects.lowpass).toBe(1);
    expect(disconnects.gains).toBe(1);
  });

  it("plays a pad timbre with an attack/hold/release envelope", () => {
    const { ctx, oscillators } = mockCtx();
    expect(() =>
      playChordVoice("warm-pad", ctx, {} as AudioNode, events, 0.5),
    ).not.toThrow();
    expect(oscillators.length).toBeGreaterThan(0);
  });

  it("falls back to a default preset for an unknown timbre id", () => {
    const { ctx, oscillators } = mockCtx();
    playChordVoice(
      "does-not-exist" as never,
      ctx,
      {} as AudioNode,
      events,
      0.5,
    );
    expect(oscillators.length).toBeGreaterThan(0);
  });
});
