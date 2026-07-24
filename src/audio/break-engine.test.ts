import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultBreakSettings } from "@/lib/breaks";

import { BreakEngine } from "./break-engine";

function mockCtx(currentTime = 0): BaseAudioContext {
  return {
    currentTime,
    createOscillator: vi.fn(() => ({
      type: "sine",
      frequency: { value: 440 },
      connect: vi.fn(function connect(this: unknown, next: unknown) {
        return next;
      }),
      start: vi.fn(),
      stop: vi.fn(),
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
    })),
  } as unknown as BaseAudioContext;
}

describe("BreakEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("preview plays a cue without requiring start()", () => {
    const ctx = mockCtx(10);
    const dest = {} as AudioNode;
    const engine = new BreakEngine(ctx, dest, createDefaultBreakSettings());
    expect(() => engine.preview()).not.toThrow();
    engine.stop();
  });

  it("fires onFire when a due event is pumped", () => {
    vi.useFakeTimers();
    const ctx = mockCtx(100);
    Object.defineProperty(ctx, "currentTime", {
      get: () => 100,
      configurable: true,
    });
    const dest = {} as AudioNode;
    const settings = createDefaultBreakSettings();
    settings.types.stretch.enabled = true;
    settings.types.stretch.intervalMin = 1;
    settings.types.walk.enabled = false;
    settings.types.water.enabled = false;
    settings.types.custom.enabled = false;
    settings.notificationsEnabled = false;

    const engine = new BreakEngine(ctx, dest, settings);
    const onFire = vi.fn();
    engine.setOnFire(onFire);

    // Seed a schedule that is due immediately by starting then snoozing... 
    // Instead: start(), then updateSettings and manually exercise via
    // a tiny interval wait after forcing schedule through snooze offset.
    engine.start();
    // Push stretch into the past via snooze with a negative-equivalent:
    // apply snooze then overwrite by calling snooze with 0... use update +
    // private schedule isn't accessible. Pump with a due event by starting
    // at now and advancing currentTime past the first interval.
    engine.stop();

    // Re-create with currentTime such that init schedules at 160, then bump time.
    let now = 100;
    const liveCtx = mockCtx(now);
    Object.defineProperty(liveCtx, "currentTime", {
      get: () => now,
      configurable: true,
    });
    const live = new BreakEngine(liveCtx, dest, settings);
    live.setOnFire(onFire);
    live.start();
    // First fire is at 160; advance clock into lookahead of that fire.
    now = 159.7;
    vi.advanceTimersByTime(250);
    expect(onFire).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "stretch",
        message: "Time to stretch",
      }),
    );
    live.stop();
  });

  it("snooze delays the next fire without throwing", () => {
    const ctx = mockCtx(50);
    const engine = new BreakEngine(ctx, {} as AudioNode, createDefaultBreakSettings());
    engine.start();
    expect(() => engine.snooze("stretch")).not.toThrow();
    engine.stop();
  });

  it("resync drops the prompt missed while asleep and re-anchors to now (#135)", () => {
    vi.useFakeTimers();
    let now = 100;
    const ctx = mockCtx(now);
    Object.defineProperty(ctx, "currentTime", {
      get: () => now,
      configurable: true,
    });

    const settings = createDefaultBreakSettings();
    settings.types.stretch.enabled = true;
    settings.types.stretch.intervalMin = 1;
    settings.types.walk.enabled = false;
    settings.types.water.enabled = false;
    settings.types.custom.enabled = false;
    settings.notificationsEnabled = false;

    const engine = new BreakEngine(ctx, {} as AudioNode, settings);
    const onFire = vi.fn();
    engine.setOnFire(onFire);
    engine.start(); // first prompt reserved for t=160

    // Slept past it, then woke 40s late.
    now = 200;
    engine.resync();
    vi.advanceTimersByTime(250);
    expect(onFire).not.toHaveBeenCalled();

    // Cadence resumes a full interval after the wake.
    now = 259.7;
    vi.advanceTimersByTime(250);
    expect(onFire).toHaveBeenCalledTimes(1);

    engine.stop();
  });
});
