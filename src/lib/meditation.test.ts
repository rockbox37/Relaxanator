import { describe, expect, it } from "vitest";

import {
  JITTER_FRACTION,
  MAX_INTERVAL_MIN,
  MEDITATION_VOICES,
  MIN_INTERVAL_MIN,
  type VoiceSettings,
  clampIntervalMin,
  collectDueEvents,
  computeNextClockFire,
  computeNextFire,
  createDefaultMeditationSettings,
  initFireSchedule,
  nextClockFireMs,
} from "./meditation";

function voice(overrides: Partial<VoiceSettings> = {}): VoiceSettings {
  return {
    enabled: true,
    intervalMin: 1,
    jitter: false,
    syncToClock: false,
    volume: 0.5,
    ...overrides,
  };
}

/** Local-time epoch ms helper mirroring announce.test.ts (with ms precision). */
function localMs(h: number, m: number, s = 0, ms = 0): number {
  return new Date(2026, 5, 15, h, m, s, ms).getTime(); // Mon Jun 15 2026, local
}

describe("MEDITATION_VOICES", () => {
  it("registers all meditation voices with unique ids", () => {
    const ids = MEDITATION_VOICES.map((v) => v.id);
    expect(ids).toEqual([
      "bell",
      "doom-bell",
      "chime",
      "drone",
      "omm",
      "fog-horn",
      "fog-horn-2",
      "fog-horn-3",
      "fog-horn-4",
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

  it("documents fog horn 1 as B/E perfect fifth two-tone", () => {
    const fogHorn = MEDITATION_VOICES.find((v) => v.id === "fog-horn");
    expect(fogHorn?.description).toContain("perfect fifth");
    expect(fogHorn?.description).toMatch(/B then lower E/i);
  });

  it("documents fog horn 2 as D/G perfect fifth interval", () => {
    const fogHorn2 = MEDITATION_VOICES.find((v) => v.id === "fog-horn-2");
    expect(fogHorn2?.description).toContain("perfect fifth");
    expect(fogHorn2?.description).toMatch(/D then lower G/i);
    expect(fogHorn2?.description).not.toContain("minor sixth");
  });

  it("documents fog horn 3 as C/F perfect fifth (not F/D♭)", () => {
    const fogHorn3 = MEDITATION_VOICES.find((v) => v.id === "fog-horn-3");
    expect(fogHorn3?.description).toContain("perfect fifth");
    expect(fogHorn3?.description).toMatch(/C then lower F/i);
    expect(fogHorn3?.description).not.toMatch(/D[♭b]/i);
  });

  it("documents fog horn 4 as vintage film two-tone with perfect fifth", () => {
    const fogHorn4 = MEDITATION_VOICES.find((v) => v.id === "fog-horn-4");
    expect(fogHorn4?.description).toContain("Vintage film two-tone");
    expect(fogHorn4?.description).toContain("perfect fifth");
    expect(fogHorn4?.description).toMatch(/C then lower F/i);
    expect(fogHorn4?.description).not.toContain("perfect fourth");
  });
});

describe("createDefaultMeditationSettings", () => {
  it("enables only the bell by default", () => {
    const settings = createDefaultMeditationSettings();
    expect(Object.keys(settings)).toHaveLength(MEDITATION_VOICES.length);
    expect(settings.bell.enabled).toBe(true);
    expect(settings["doom-bell"].enabled).toBe(false);
    expect(settings.chime.enabled).toBe(false);
    expect(settings.drone.enabled).toBe(false);
    expect(settings.omm.enabled).toBe(false);
  });

  it("defaults every voice to clock-sync off (preserves free-running)", () => {
    const settings = createDefaultMeditationSettings();
    for (const voiceId of Object.keys(settings)) {
      expect(settings[voiceId].syncToClock).toBe(false);
    }
  });

  it("defaults every voice to vary (jitter) off", () => {
    const settings = createDefaultMeditationSettings();
    for (const voiceId of Object.keys(settings)) {
      expect(settings[voiceId].jitter).toBe(false);
    }
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

describe("nextClockFireMs", () => {
  it("anchors a 5-min interval to :00/:05/:10 from the top of the hour", () => {
    expect(nextClockFireMs(localMs(12, 2, 37), 5)).toBe(localMs(12, 5));
    expect(nextClockFireMs(localMs(12, 5), 5)).toBe(localMs(12, 10));
    expect(nextClockFireMs(localMs(12, 6), 5)).toBe(localMs(12, 10));
  });

  it("anchors a 15-min interval to the quarter hours", () => {
    expect(nextClockFireMs(localMs(9, 0), 15)).toBe(localMs(9, 15));
    expect(nextClockFireMs(localMs(9, 20), 15)).toBe(localMs(9, 30));
    expect(nextClockFireMs(localMs(9, 44, 59), 15)).toBe(localMs(9, 45));
  });

  it("is never immediate: enabling exactly on a boundary waits one step", () => {
    // Mirrors the time-announcement "strictly in the future" UX.
    expect(nextClockFireMs(localMs(12, 0), 5)).toBe(localMs(12, 5));
    expect(nextClockFireMs(localMs(12, 10), 10)).toBe(localMs(12, 20));
  });

  it("rolls a 5-min interval over the top of the next hour", () => {
    expect(nextClockFireMs(localMs(12, 57), 5)).toBe(localMs(13, 0));
    expect(nextClockFireMs(localMs(12, 59, 30), 5)).toBe(localMs(13, 0));
  });

  it("re-anchors intervals that do not divide 60 at each hour", () => {
    // 7-min interval: :00/:07/…/:56, then re-anchor to the next :00 (short slot).
    expect(nextClockFireMs(localMs(10, 0), 7)).toBe(localMs(10, 7));
    expect(nextClockFireMs(localMs(10, 50), 7)).toBe(localMs(10, 56));
    // After :56 the next multiple would be :63 → clamped to the next hour's :00.
    expect(nextClockFireMs(localMs(10, 56), 7)).toBe(localMs(11, 0));
    expect(nextClockFireMs(localMs(10, 59), 7)).toBe(localMs(11, 0));
  });

  it("handles sub-minute intervals (30-second bell) on the same anchor", () => {
    expect(nextClockFireMs(localMs(12, 0, 10), 0.5)).toBe(localMs(12, 0, 30));
    expect(nextClockFireMs(localMs(12, 0, 30), 0.5)).toBe(localMs(12, 1, 0));
  });

  it("rolls over midnight", () => {
    const late = new Date(2026, 5, 15, 23, 56).getTime();
    const midnight = new Date(2026, 5, 16, 0, 0).getTime();
    expect(nextClockFireMs(late, 5)).toBe(midnight);
  });

  it("clamps degenerate intervals into the legal range", () => {
    // clampIntervalMin(0) === MIN_INTERVAL_MIN (0.5), so it still advances.
    expect(nextClockFireMs(localMs(12, 0, 10), 0)).toBe(localMs(12, 0, 30));
  });

  it("stays strictly future and hour-bounded across a spring-forward instant", () => {
    // US spring-forward 2026 is Mar 8 (2:00 → 3:00 local). Timezone-agnostic
    // sanity: whatever the host TZ, the result must be strictly later than now
    // and never overshoot the DST-safe top-of-next-hour anchor (computed the
    // same way the implementation does, via setHours on a wall-clock Date).
    const beforeGap = new Date(2026, 2, 8, 1, 58).getTime();
    const fire = nextClockFireMs(beforeGap, 5);
    const hourTop = new Date(beforeGap);
    hourTop.setMinutes(0, 0, 0);
    const nextHourTop = new Date(hourTop.getTime());
    nextHourTop.setHours(nextHourTop.getHours() + 1);
    expect(fire).toBeGreaterThan(beforeGap);
    expect(fire).toBeLessThanOrEqual(nextHourTop.getTime());
  });

  it("never returns a time in the past for any minute of the hour", () => {
    for (let m = 0; m < 60; m += 1) {
      for (const interval of [1, 5, 7, 15, 20]) {
        const now = localMs(14, m, 30);
        expect(nextClockFireMs(now, interval)).toBeGreaterThan(now);
      }
    }
  });
});

describe("computeNextClockFire", () => {
  it("maps the wall-clock boundary onto the audio clock", () => {
    // At audio 100s / wall 12:02:37, the next :05 boundary is 2m23s away.
    const nowSec = 100;
    const nowMs = localMs(12, 2, 37);
    const fire = computeNextClockFire(nowSec, nowSec, nowMs, 5);
    const expectedMs = localMs(12, 5) - nowMs; // 143_000 ms
    expect(fire).toBeCloseTo(nowSec + expectedMs / 1000, 6);
  });

  it("advances to the following boundary when searching after a fire", () => {
    const nowSec = 100;
    const nowMs = localMs(12, 2, 37);
    const first = computeNextClockFire(nowSec, nowSec, nowMs, 5);
    const second = computeNextClockFire(first, nowSec, nowMs, 5);
    expect(second).toBeCloseTo(first + 300, 6); // exactly one 5-min step later
  });
});

describe("collectDueEvents (sync-to-clock)", () => {
  const nowMs = localMs(12, 4, 59); // 1s before the :05 boundary

  it("seeds a synced voice at the next wall-clock boundary, not one interval out", () => {
    const settings = { a: voice({ intervalMin: 5, syncToClock: true }) };
    const { events, schedule } = collectDueEvents({}, settings, 100, 0.6, nowMs);
    // Boundary is 1s away → inside the 0.6s lookahead? No — fires next pump.
    expect(events).toEqual([]);
    expect(schedule.a).toBeCloseTo(101, 6); // 1s from now on the audio clock
  });

  it("emits the boundary event once it enters the lookahead window", () => {
    const settings = { a: voice({ intervalMin: 5, syncToClock: true }) };
    const atBoundary = localMs(12, 4, 59, 700); // 0.3s before :05
    const { events, schedule } = collectDueEvents({}, settings, 100, 0.6, atBoundary);
    expect(events).toHaveLength(1);
    expect(events[0].voiceId).toBe("a");
    expect(events[0].whenSec).toBeCloseTo(100.3, 3);
    // Next boundary is a full interval (300s) after the one just fired.
    expect(schedule.a).toBeCloseTo(100.3 + 300, 3);
  });

  it("ignores jitter for synced voices even when jitter is on", () => {
    const settings = {
      a: voice({ intervalMin: 5, syncToClock: true, jitter: true }),
    };
    const alwaysMax = () => 1; // would skew a jittered interval if consulted
    const { schedule } = collectDueEvents({}, settings, 100, 0.6, localMs(12, 0), alwaysMax);
    // Deterministic: exactly the :05 boundary, 300s out — no jitter applied.
    expect(schedule.a).toBeCloseTo(400, 6);
  });

  it("fires a synced voice once after a long suspend, then re-aligns", () => {
    const settings = { a: voice({ intervalMin: 5, syncToClock: true }) };
    // Scheduled fire is far in the past on the audio clock (tab was suspended).
    const { events, schedule } = collectDueEvents(
      { a: 40 },
      settings,
      640,
      0.6,
      localMs(12, 4, 59, 700),
    );
    expect(events).toEqual([{ voiceId: "a", whenSec: 640 }]);
    // Resumes on the next real wall-clock boundary rather than burst-firing.
    expect(schedule.a).toBeGreaterThan(640);
  });

  it("keeps free-running voices unchanged when a synced voice is present", () => {
    const settings = {
      free: voice({ intervalMin: 2 }),
      synced: voice({ intervalMin: 5, syncToClock: true }),
    };
    const { schedule } = collectDueEvents({}, settings, 100, 0.6, localMs(12, 0));
    expect(schedule.free).toBe(100 + 120); // relative interval, untouched
  });
});

describe("initFireSchedule (sync-to-clock)", () => {
  it("seeds synced voices at the next boundary and free voices one interval out", () => {
    const settings = {
      free: voice({ intervalMin: 2 }),
      synced: voice({ intervalMin: 5, syncToClock: true }),
    };
    const schedule = initFireSchedule(settings, 100, localMs(12, 0));
    expect(schedule.free).toBe(100 + 120);
    expect(schedule.synced).toBeCloseTo(100 + 300, 6); // 12:00 → 12:05
  });
});
