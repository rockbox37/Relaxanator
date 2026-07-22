import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultChordSettings } from "@/lib/chords";

import { ChordsEngine } from "./chords-engine";

function mockCtx(currentTime = 0): BaseAudioContext {
  return {
    currentTime,
    createOscillator: vi.fn(() => ({
      type: "sine",
      frequency: { value: 440 },
      detune: { value: 0 },
      connect: vi.fn(function connect(this: unknown, next: unknown) {
        return next;
      }),
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    })),
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
      disconnect: vi.fn(),
    })),
    createBiquadFilter: vi.fn(() => ({
      type: "lowpass",
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(function connect(this: unknown, next: unknown) {
        return next;
      }),
      disconnect: vi.fn(),
    })),
  } as unknown as BaseAudioContext;
}

describe("ChordsEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preview plays a voice without requiring start()", () => {
    const ctx = mockCtx(10);
    const engine = new ChordsEngine(ctx, {} as AudioNode, createDefaultChordSettings());
    expect(() => engine.preview("c-major")).not.toThrow();
    expect(ctx.createOscillator).toHaveBeenCalled();
    engine.stop();
  });

  it("ignores preview for an unknown voice id", () => {
    const ctx = mockCtx(10);
    const engine = new ChordsEngine(ctx, {} as AudioNode, createDefaultChordSettings());
    expect(() => engine.preview("nope")).not.toThrow();
    expect(ctx.createOscillator).not.toHaveBeenCalled();
  });

  it("schedules a chord when a due voice is pumped", () => {
    vi.useFakeTimers();
    let now = 100;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });

    const settings = createDefaultChordSettings();
    // Only c-major enabled by default; give it a 1-min interval.
    settings["c-major"].intervalMin = 1;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    engine.start();
    // First fire is at 160; advance the audio clock into its lookahead window.
    now = 159.7;
    vi.advanceTimersByTime(250);
    expect(ctx.createOscillator).toHaveBeenCalled();
    engine.stop();
  });

  it("start is idempotent and updateSettings/stop do not throw", () => {
    const ctx = mockCtx(0);
    const engine = new ChordsEngine(ctx, {} as AudioNode, createDefaultChordSettings());
    engine.start();
    engine.start(); // no-op second call
    expect(() => engine.updateSettings(createDefaultChordSettings())).not.toThrow();
    expect(() => engine.stop()).not.toThrow();
  });
});
