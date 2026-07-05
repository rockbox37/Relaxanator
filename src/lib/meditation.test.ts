import { describe, expect, it } from "vitest";

import {
  JITTER_FRACTION,
  MAX_INTERVAL_MIN,
  MEDITATION_VOICES,
  MIN_INTERVAL_MIN,
  type VoiceSettings,
  clampIntervalMin,
  collectDueEvents,
  computeNextFire,
  createDefaultMeditationSettings,
  initFireSchedule,
} from "./meditation";

function voice(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return { enabled: true, intervalMin: 1, jitter: false, volume: 0.5, ...overrides };
}

describe("MEDITATION_VOICES", () => {
  it("registers all meditation voices with unique ids", () => {
    const ids = MEDITATION_VOICES.map((v) => v.id);
    expect(ids).toEqual([
      "bell",
      "deep-bell",
      "chime",
      "drone",
      "omm",
      "fog-horn",
      "fog-horn-2",
      "ship-horn",
      "ship-horn-2",
      "train-horn",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has sane defaults", () => {
    for (const v of MEDITATION_VOICES) {
      expect(v.defaultIntervalMin).toBeGreaterThanOrEqual(MIN_INTERVAL_MIN);
      expect(v.defaultVolume).toBeGreaterThan(0);
      expect(v.defaultVolume).toBeLessThanOrEqual(1);
    }
  });
});

describe("createDefaultMeditationSettings", () => {
  it("enables only the bell by default", () => {
    const settings = createDefaultMeditationSettings();
    expect(Object.keys(settings)).toHaveLength(MEDITATION_VOICES.length);
    expect(settings.bell.enabled).toBe(true);
    expect(settings["deep-bell"].enabled).toBe(false);
    expect(settings.chime.enabled).toBe(false);
    expect(settings.drone.enabled).toBe(false);
    expect(settings.omm.enabled).toBe(false);
  });
});

describe("clampIntervalMin", () => {
  it("clamps to the legal range and fails safe on NaN", () => {
    expect(clampIntervalMin(5)).toBe(5);
    expect(clampIntervalMin(0)).toBe(MIN_INTERVAL_MIN);
    expect(clampIntervalMin(999)).toBe(MAX_INTERVAL_MIN);
    expect(clampIntervalMin(Number.NaN)).toBe(MIN_INTERVAL_MIN);
  });
});

describe("computeNextFire", () => {
  it("advances exactly one interval without jitter", () => {
    expect(computeNextFire(100, voice({ intervalMin: 2 }))).toBe(100 + 120);
  });

  it("stays within ±15% of the interval with jitter", () => {
    const v = voice({ intervalMin: 10, jitter: true });
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const next = computeNextFire(0, v, () => r);
      expect(next).toBeGreaterThanOrEqual(600 * (1 - JITTER_FRACTION));
      expect(next).toBeLessThanOrEqual(600 * (1 + JITTER_FRACTION));
    }
  });

  it("never schedules in the past even for degenerate intervals", () => {
    const v = voice({ intervalMin: -100, jitter: true });
    expect(computeNextFire(50, v, () => 0)).toBeGreaterThan(50);
  });
});

describe("initFireSchedule", () => {
  it("seeds only enabled voices, one interval out", () => {
    const settings = {
      a: voice({ intervalMin: 1 }),
      b: voice({ enabled: false }),
    };
    const schedule = initFireSchedule(settings, 10);
    expect(schedule.a).toBe(70);
    expect(schedule.b).toBeUndefined();
  });
});

describe("collectDueEvents", () => {
  it("emits events inside the lookahead window and advances the schedule", () => {
    const settings = { a: voice({ intervalMin: 1 }) };
    const { events, schedule } = collectDueEvents({ a: 100.2 }, settings, 100, 0.5);
    expect(events).toEqual([{ voiceId: "a", whenSec: 100.2 }]);
    expect(schedule.a).toBe(100.2 + 60);
  });

  it("emits nothing when the next fire is beyond the lookahead", () => {
    const settings = { a: voice() };
    const { events, schedule } = collectDueEvents({ a: 105 }, settings, 100, 0.5);
    expect(events).toEqual([]);
    expect(schedule.a).toBe(105);
  });

  it("drops disabled voices and seeds newly enabled ones", () => {
    const settings = {
      gone: voice({ enabled: false }),
      fresh: voice({ intervalMin: 2 }),
    };
    const { events, schedule } = collectDueEvents({ gone: 101 }, settings, 100, 0.5);
    expect(events).toEqual([]);
    expect(schedule.gone).toBeUndefined();
    expect(schedule.fresh).toBe(100 + 120);
  });

  it("fires once after a long suspend instead of burst-firing to catch up", () => {
    const settings = { a: voice({ intervalMin: 1 }) };
    // Last fire was scheduled 10 minutes ago (audio clock paused meanwhile).
    const { events, schedule } = collectDueEvents({ a: 40 }, settings, 640, 0.5);
    expect(events).toEqual([{ voiceId: "a", whenSec: 640 }]);
    expect(schedule.a).toBe(640 + 60);
  });
});
