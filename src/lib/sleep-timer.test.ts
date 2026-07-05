import { describe, expect, it } from "vitest";

import {
  MAX_SLEEP_MINUTES,
  MIN_SLEEP_MINUTES,
  SLEEP_FADE_SEC,
  SLEEP_TIMER_OFF,
  SLEEP_TIMER_PRESETS,
  armSleepTimer,
  clampSleepMinutes,
  fadeRemainingSec,
  formatCountdown,
  isElapsed,
  isFading,
  isSleepPreset,
  sleepRemainingSec,
} from "./sleep-timer";

describe("SLEEP_TIMER_PRESETS", () => {
  it("starts with Off and lists ascending unique durations", () => {
    expect(SLEEP_TIMER_PRESETS[0]).toEqual({ minutes: SLEEP_TIMER_OFF, label: "Off" });
    const minutes = SLEEP_TIMER_PRESETS.map((p) => p.minutes);
    expect(new Set(minutes).size).toBe(minutes.length);
    expect([...minutes]).toEqual([...minutes].sort((a, b) => a - b));
  });
});

describe("clampSleepMinutes", () => {
  it("treats non-positive values and NaN as off", () => {
    expect(clampSleepMinutes(0)).toBe(SLEEP_TIMER_OFF);
    expect(clampSleepMinutes(-5)).toBe(SLEEP_TIMER_OFF);
    expect(clampSleepMinutes(Number.NaN)).toBe(SLEEP_TIMER_OFF);
  });

  it("rounds to whole minutes and clamps to the legal range", () => {
    expect(clampSleepMinutes(15)).toBe(15);
    expect(clampSleepMinutes(15.4)).toBe(15);
    expect(clampSleepMinutes(0.4)).toBe(MIN_SLEEP_MINUTES);
    expect(clampSleepMinutes(99_999)).toBe(MAX_SLEEP_MINUTES);
  });
});

describe("isSleepPreset", () => {
  it("recognizes preset durations and rejects custom ones", () => {
    expect(isSleepPreset(30)).toBe(true);
    expect(isSleepPreset(SLEEP_TIMER_OFF)).toBe(true);
    expect(isSleepPreset(23)).toBe(false);
  });
});

describe("armSleepTimer", () => {
  it("sets the stop one duration out and the fade a fade-window before it", () => {
    const timer = armSleepTimer(100, 30);
    expect(timer.startSec).toBe(100);
    expect(timer.endSec).toBe(100 + 30 * 60);
    expect(timer.fadeStartSec).toBe(timer.endSec - SLEEP_FADE_SEC);
  });

  it("caps the fade to half the duration for very short timers", () => {
    const timer = armSleepTimer(0, 1, 120); // 60s duration, 120s requested fade
    expect(timer.endSec).toBe(60);
    expect(timer.fadeStartSec).toBe(30);
  });

  it("clamps degenerate durations to at least one minute", () => {
    const timer = armSleepTimer(0, 0);
    expect(timer.endSec).toBe(MIN_SLEEP_MINUTES * 60);
  });
});

describe("countdown + phase helpers", () => {
  const timer = armSleepTimer(0, 10); // ends at 600, fades at 592

  it("reports whole seconds remaining, never negative", () => {
    expect(sleepRemainingSec(timer, 0)).toBe(600);
    expect(sleepRemainingSec(timer, 599.2)).toBe(1);
    expect(sleepRemainingSec(timer, 900)).toBe(0);
  });

  it("marks the fade window and elapsed state on the audio clock", () => {
    expect(isFading(timer, 100)).toBe(false);
    expect(isFading(timer, 595)).toBe(true);
    expect(isFading(timer, 600)).toBe(false);
    expect(isElapsed(timer, 599)).toBe(false);
    expect(isElapsed(timer, 600)).toBe(true);
  });

  it("returns the remaining fade duration with a small floor", () => {
    expect(fadeRemainingSec(timer, 595)).toBe(5);
    expect(fadeRemainingSec(timer, 600)).toBe(0.01);
    expect(fadeRemainingSec(timer, 700)).toBe(0.01);
  });
});

describe("formatCountdown", () => {
  it("renders mm:ss under an hour and h:mm:ss beyond", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(3661)).toBe("1:01:01");
  });

  it("floors fractional seconds and never goes negative", () => {
    expect(formatCountdown(59.9)).toBe("0:59");
    expect(formatCountdown(-5)).toBe("0:00");
  });
});
