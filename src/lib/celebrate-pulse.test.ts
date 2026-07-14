import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CELEBRATE_PULSE_REPLAY_MAX_MS,
  CELEBRATE_PULSE_REPLAY_MIN_MS,
  createCelebratePulseScheduler,
  nextCelebratePulseDelayMs,
} from "./celebrate-pulse";

afterEach(() => {
  vi.useRealTimers();
});

describe("nextCelebratePulseDelayMs", () => {
  it("returns the min bound when random is 0", () => {
    expect(nextCelebratePulseDelayMs(() => 0)).toBe(CELEBRATE_PULSE_REPLAY_MIN_MS);
  });

  it("returns the max bound when random is 1", () => {
    expect(nextCelebratePulseDelayMs(() => 1)).toBe(CELEBRATE_PULSE_REPLAY_MAX_MS);
  });

  it("clamps out-of-range random values into the replay window", () => {
    expect(nextCelebratePulseDelayMs(() => -1)).toBe(CELEBRATE_PULSE_REPLAY_MIN_MS);
    expect(nextCelebratePulseDelayMs(() => 2)).toBe(CELEBRATE_PULSE_REPLAY_MAX_MS);
  });

  it("returns a mid-window delay for a mid random draw", () => {
    const mid = nextCelebratePulseDelayMs(() => 0.5);
    expect(mid).toBeGreaterThan(CELEBRATE_PULSE_REPLAY_MIN_MS);
    expect(mid).toBeLessThan(CELEBRATE_PULSE_REPLAY_MAX_MS);
  });
});

describe("createCelebratePulseScheduler", () => {
  it("does nothing when prefers-reduced-motion is set", () => {
    const onPulse = vi.fn();
    const schedule = vi.fn();
    const scheduler = createCelebratePulseScheduler({
      onPulse,
      prefersReducedMotion: true,
      schedule,
    });
    scheduler.start();
    expect(onPulse).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("pulses immediately on start then arms a replay", () => {
    vi.useFakeTimers();
    const onPulse = vi.fn();
    const scheduler = createCelebratePulseScheduler({
      onPulse,
      prefersReducedMotion: false,
      random: () => 0,
    });
    scheduler.start();
    expect(onPulse).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(CELEBRATE_PULSE_REPLAY_MIN_MS - 1);
    expect(onPulse).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(onPulse).toHaveBeenCalledTimes(2);
    scheduler.stop();
  });

  it("skips the immediate pulse when pulseOnStart is false", () => {
    vi.useFakeTimers();
    const onPulse = vi.fn();
    const scheduler = createCelebratePulseScheduler({
      onPulse,
      prefersReducedMotion: false,
      pulseOnStart: false,
      random: () => 0,
    });
    scheduler.start();
    expect(onPulse).not.toHaveBeenCalled();

    vi.advanceTimersByTime(CELEBRATE_PULSE_REPLAY_MIN_MS);
    expect(onPulse).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("stop() cancels further replays", () => {
    vi.useFakeTimers();
    const onPulse = vi.fn();
    const scheduler = createCelebratePulseScheduler({
      onPulse,
      prefersReducedMotion: false,
      random: () => 0,
    });
    scheduler.start();
    expect(onPulse).toHaveBeenCalledTimes(1);
    scheduler.stop();

    vi.advanceTimersByTime(CELEBRATE_PULSE_REPLAY_MAX_MS);
    expect(onPulse).toHaveBeenCalledTimes(1);
  });

  it("ignores a second start() while already running", () => {
    const onPulse = vi.fn();
    const schedule = vi.fn(() => 1);
    const scheduler = createCelebratePulseScheduler({
      onPulse,
      prefersReducedMotion: false,
      schedule,
      clear: vi.fn(),
      random: () => 0,
    });
    scheduler.start();
    scheduler.start();
    expect(onPulse).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledTimes(1);
    scheduler.stop();
  });

  it("ignores a late timer callback after stop()", () => {
    const onPulse = vi.fn();
    let queued: (() => void) | null = null;
    const scheduler = createCelebratePulseScheduler({
      onPulse,
      prefersReducedMotion: false,
      pulseOnStart: false,
      random: () => 0,
      schedule: (fn) => {
        queued = fn;
        return 1;
      },
      clear: vi.fn(),
    });
    scheduler.start();
    expect(queued).not.toBeNull();
    scheduler.stop();
    queued!();
    expect(onPulse).not.toHaveBeenCalled();
  });
});
