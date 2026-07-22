import { describe, expect, it, vi } from "vitest";

import type { ChordNoteEvent } from "@/lib/chords";

import { playChordVoice } from "./chord-voices";

/** Records created oscillators so tests can fire their onended callbacks. */
function mockCtx() {
  const oscillators: Array<{
    type: OscillatorType;
    frequency: { value: number };
    onended: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  const disconnects = {
    lowpass: 0,
    gains: 0,
    oscillators: 0,
    waveshapers: 0,
    delays: 0,
  };
  const created = { waveShapers: 0, delays: 0 };

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
        disconnect: vi.fn(() => {
          disconnects.oscillators += 1;
        }),
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
    createWaveShaper: vi.fn(() => {
      created.waveShapers += 1;
      return {
        curve: null as Float32Array | null,
        oversample: "none" as OverSampleType,
        connect: vi.fn(function connect(this: unknown, next: unknown) {
          return next;
        }),
        disconnect: vi.fn(() => {
          disconnects.waveshapers += 1;
        }),
      };
    }),
    createDelay: vi.fn(() => {
      created.delays += 1;
      return {
        delayTime: { value: 0 },
        connect: vi.fn(function connect(this: unknown, next: unknown) {
          return next;
        }),
        disconnect: vi.fn(() => {
          disconnects.delays += 1;
        }),
      };
    }),
  };

  return {
    ctx: ctx as unknown as BaseAudioContext,
    oscillators,
    disconnects,
    created,
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

  it("builds no extra effect nodes for additive presets", () => {
    // Regression guard for the existing 11 timbres: the plain additive graph
    // must not create any waveshaper/delay/LFO nodes.
    const { ctx, oscillators, created } = mockCtx();
    playChordVoice("rhodes", ctx, {} as AudioNode, events, 0.5);
    expect(ctx.createWaveShaper).not.toHaveBeenCalled();
    expect(ctx.createDelay).not.toHaveBeenCalled();
    // 3 notes * 3 partials = 9 note oscillators, and no extra (LFO) oscillator.
    expect(oscillators).toHaveLength(9);
    expect(created.waveShapers).toBe(0);
    expect(created.delays).toBe(0);
  });

  describe("metal-guitar distortion stage", () => {
    it("inserts a waveshaper and tears it down with the chain", () => {
      const { ctx, oscillators, disconnects, created } = mockCtx();
      playChordVoice("metal-guitar", ctx, {} as AudioNode, events, 0.5);
      // One shared waveshaper drive stage, no chorus delay.
      expect(created.waveShapers).toBe(1);
      expect(created.delays).toBe(0);
      // metal-guitar has 5 partials, 3 notes -> 15 note oscillators (no LFO).
      expect(oscillators).toHaveLength(15);

      // Nothing disconnects until the final note oscillator ends.
      for (let i = 0; i < oscillators.length - 1; i += 1) {
        oscillators[i].onended?.();
      }
      expect(disconnects.waveshapers).toBe(0);
      expect(disconnects.lowpass).toBe(0);

      oscillators[oscillators.length - 1].onended?.();
      expect(disconnects.waveshapers).toBe(1);
      expect(disconnects.lowpass).toBe(1);
      expect(disconnects.gains).toBe(1); // the master out gain
    });
  });

  describe("jazz-guitar chorus stage", () => {
    it("inserts an LFO-modulated delay and releases every node on teardown", () => {
      const { ctx, oscillators, disconnects, created } = mockCtx();
      playChordVoice("jazz-guitar", ctx, {} as AudioNode, events, 0.5);

      // One delay + a sine LFO oscillator drive the chorus; no distortion.
      expect(created.delays).toBe(1);
      expect(created.waveShapers).toBe(0);

      // jazz-guitar has 3 partials, 3 notes -> 9 note oscillators + 1 LFO = 10.
      // The chorus LFO is created before the note oscillators (index 0).
      expect(oscillators).toHaveLength(10);
      const lfo = oscillators[0];
      expect(lfo.type).toBe("sine");
      expect(lfo.start).toHaveBeenCalled();
      // The LFO is NOT counted in the note refcount, so its onended is unset.
      expect(lfo.onended).toBeNull();

      // The 9 note oscillators drive teardown; the LFO must be stopped/released.
      const noteOscs = oscillators.slice(1);
      for (let i = 0; i < noteOscs.length - 1; i += 1) {
        noteOscs[i].onended?.();
      }
      expect(disconnects.delays).toBe(0);
      noteOscs[noteOscs.length - 1].onended?.();

      expect(lfo.stop).toHaveBeenCalled();
      expect(disconnects.oscillators).toBe(1); // the LFO disconnects
      expect(disconnects.delays).toBe(1);
      expect(disconnects.lowpass).toBe(1);
      // out + dry + wet + lfoDepth gains all disconnect.
      expect(disconnects.gains).toBe(4);
    });
  });
});
