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
    // No voice is enabled by default now, so enable c-major and give it a
    // 1-min interval to exercise the scheduler.
    settings["c-major"].enabled = true;
    settings["c-major"].intervalMin = 1;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    engine.start();
    // First fire is at 160; advance the audio clock into its lookahead window.
    now = 159.7;
    vi.advanceTimersByTime(250);
    expect(ctx.createOscillator).toHaveBeenCalled();
    engine.stop();
  });

  it("resync drops the fire missed while asleep and re-anchors to now (#135)", () => {
    vi.useFakeTimers();
    let now = 100;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });

    const settings = createDefaultChordSettings();
    settings["c-major"].enabled = true;
    settings["c-major"].intervalMin = 1;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    engine.start(); // first fire reserved for t=160

    // Slept past it, then woke 40s late.
    now = 200;
    engine.resync();
    vi.advanceTimersByTime(250);
    expect(ctx.createOscillator).not.toHaveBeenCalled();

    // Cadence resumes a full interval after the wake.
    now = 259.7;
    vi.advanceTimersByTime(250);
    expect(ctx.createOscillator).toHaveBeenCalled();

    engine.stop();
  });

  it("fires onFire immediately on preview (#104)", () => {
    const ctx = mockCtx(10);
    const engine = new ChordsEngine(ctx, {} as AudioNode, createDefaultChordSettings());
    const onFire = vi.fn();
    engine.setOnFire(onFire);
    engine.preview("c-major");
    expect(onFire).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: "c-major", whenSec: 10 }),
    );
    engine.stop();
  });

  it("defers onFire to the scheduled audio-heard time when pumped (#104)", () => {
    vi.useFakeTimers();
    let now = 100;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });
    const settings = createDefaultChordSettings();
    settings["c-major"].enabled = true;
    settings["c-major"].intervalMin = 1;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    const onFire = vi.fn();
    engine.setOnFire(onFire);
    engine.start();

    now = 159.7; // inside the lookahead window of the 160s fire
    vi.advanceTimersByTime(250); // pump schedules the chord + defers onFire
    expect(onFire).not.toHaveBeenCalled(); // not heard yet (~300ms out)

    vi.advanceTimersByTime(400); // reach the deferred audio-heard time
    expect(onFire).toHaveBeenCalledWith(
      expect.objectContaining({ voiceId: "c-major", whenSec: 160 }),
    );
    engine.stop();
  });

  it("stop() cancels pending fire callbacks (#104)", () => {
    vi.useFakeTimers();
    let now = 100;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });
    const settings = createDefaultChordSettings();
    settings["c-major"].intervalMin = 1;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    const onFire = vi.fn();
    engine.setOnFire(onFire);
    engine.start();

    now = 159.7;
    vi.advanceTimersByTime(250); // schedules a deferred onFire
    engine.stop(); // must cancel it
    vi.advanceTimersByTime(1000);
    expect(onFire).not.toHaveBeenCalled();
  });

  it("start is idempotent and updateSettings/stop do not throw", () => {
    const ctx = mockCtx(0);
    const engine = new ChordsEngine(ctx, {} as AudioNode, createDefaultChordSettings());
    engine.start();
    engine.start(); // no-op second call
    expect(() => engine.updateSettings(createDefaultChordSettings())).not.toThrow();
    expect(() => engine.stop()).not.toThrow();
  });

  it("reschedules a looping voice back-to-back on the BPM grid", () => {
    vi.useFakeTimers();
    let now = 0;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });

    const settings = createDefaultChordSettings();
    // c-major is a single 4-beat bar; at 60bpm that loops every 4 seconds.
    // The 5-minute one-shot interval would be 300s — never reached below —
    // so any second fire proves loop is driving the cadence, not minutes.
    settings["c-major"].enabled = true;
    settings["c-major"].loop = true;
    settings["c-major"].tempoBpm = 60;
    settings["c-major"].intervalMin = 5;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    engine.start(); // seeds first fire one bar out, at t=4

    // Pump into the first fire's lookahead window (~t=4).
    now = 3.8;
    vi.advanceTimersByTime(200);
    const afterFirst = (ctx.createOscillator as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Only ~4 more seconds of audio time later the voice fires AGAIN — a
    // continuous bar cadence, not the 5-minute one-shot interval.
    now = 7.8;
    vi.advanceTimersByTime(200);
    const afterSecond = (ctx.createOscillator as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(afterSecond).toBeGreaterThan(afterFirst);

    engine.stop();
  });

  it("stop() tears a looping voice down cleanly — no leaked timers or new oscillators", () => {
    vi.useFakeTimers();
    let now = 0;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });

    const settings = createDefaultChordSettings();
    settings["c-major"].enabled = true;
    settings["c-major"].loop = true;
    settings["c-major"].tempoBpm = 60;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    const onFire = vi.fn();
    engine.setOnFire(onFire);
    engine.start();

    now = 3.8;
    vi.advanceTimersByTime(200); // schedules the first loop iteration + onFire
    const scheduled = (ctx.createOscillator as ReturnType<typeof vi.fn>).mock
      .calls.length;
    expect(scheduled).toBeGreaterThan(0);

    engine.stop();
    // No pump interval and no deferred fire callbacks remain.
    expect(vi.getTimerCount()).toBe(0);

    // Advancing far past several would-be bar boundaries schedules nothing new
    // and fires no callbacks — no stacked/leaked scheduling survives teardown.
    now = 1000;
    vi.advanceTimersByTime(5000);
    expect(
      (ctx.createOscillator as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(scheduled);
    expect(onFire).not.toHaveBeenCalled();
  });
});
