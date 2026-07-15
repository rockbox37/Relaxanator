import { describe, expect, it } from "vitest";

import {
  BREAK_TYPES,
  DEFAULT_SNOOZE_MIN,
  MAX_BREAK_INTERVAL_MIN,
  MIN_BREAK_INTERVAL_MIN,
  applySnooze,
  breakDisplayLabel,
  breakPromptMessage,
  clampBreakIntervalMin,
  clampSnoozeMin,
  collectDueBreakEvents,
  computeNextBreakFire,
  createDefaultBreakSettings,
  initBreakFireSchedule,
  type BreakTypeSettings,
} from "./breaks";

function type(overrides: Partial<BreakTypeSettings> = {}): BreakTypeSettings {
  return {
    enabled: true,
    intervalMin: 1,
    customLabel: "",
    ...overrides,
  };
}

describe("BREAK_TYPES", () => {
  it("registers stretch, walk, water, and custom with unique ids", () => {
    const ids = BREAK_TYPES.map((t) => t.id);
    expect(ids).toEqual(["stretch", "walk", "water", "custom"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has sane default intervals", () => {
    for (const t of BREAK_TYPES) {
      expect(t.defaultIntervalMin).toBeGreaterThanOrEqual(MIN_BREAK_INTERVAL_MIN);
      expect(t.defaultIntervalMin).toBeLessThanOrEqual(MAX_BREAK_INTERVAL_MIN);
    }
  });
});

describe("createDefaultBreakSettings", () => {
  it("enables only stretch by default", () => {
    const settings = createDefaultBreakSettings();
    expect(settings.types.stretch.enabled).toBe(true);
    expect(settings.types.walk.enabled).toBe(false);
    expect(settings.types.water.enabled).toBe(false);
    expect(settings.types.custom.enabled).toBe(false);
  });

  it("defaults notifications off and snooze to 5 min", () => {
    const settings = createDefaultBreakSettings();
    expect(settings.notificationsEnabled).toBe(false);
    expect(settings.snoozeMin).toBe(DEFAULT_SNOOZE_MIN);
  });

  it("defaults the custom break label to 'do a little dance'", () => {
    const settings = createDefaultBreakSettings();
    expect(settings.types.custom.customLabel).toBe("do a little dance");
    expect(settings.types.stretch.customLabel).toBe("");
  });
});

describe("clampBreakIntervalMin / clampSnoozeMin", () => {
  it("clamps interval to [1, 240]", () => {
    expect(clampBreakIntervalMin(0)).toBe(1);
    expect(clampBreakIntervalMin(999)).toBe(240);
    expect(clampBreakIntervalMin(Number.NaN)).toBe(1);
  });

  it("clamps snooze to [1, 60]", () => {
    expect(clampSnoozeMin(0)).toBe(1);
    expect(clampSnoozeMin(120)).toBe(60);
    expect(clampSnoozeMin(Number.NaN)).toBe(DEFAULT_SNOOZE_MIN);
  });
});

describe("breakDisplayLabel / breakPromptMessage", () => {
  it("uses built-in labels for stretch/walk/water", () => {
    expect(breakDisplayLabel("stretch", type())).toBe("Stretch");
    expect(breakPromptMessage("water", type())).toBe("Time to drink water");
  });

  it("uses custom label when set, falling back to 'do a little dance'", () => {
    expect(breakDisplayLabel("custom", type({ customLabel: "Tea" }))).toBe("Tea");
    expect(breakDisplayLabel("custom", type({ customLabel: "  " }))).toBe(
      "do a little dance",
    );
    expect(breakPromptMessage("custom", type({ customLabel: "Tea" }))).toBe("Tea");
  });
});

describe("computeNextBreakFire", () => {
  it("adds the clamped interval in seconds", () => {
    expect(computeNextBreakFire(10, type({ intervalMin: 1 }))).toBe(70);
    expect(computeNextBreakFire(0, type({ intervalMin: 0.1 }))).toBe(60);
  });
});

describe("initBreakFireSchedule / collectDueBreakEvents", () => {
  it("schedules only enabled types one interval out", () => {
    const settings = createDefaultBreakSettings();
    settings.types.stretch.enabled = true;
    settings.types.stretch.intervalMin = 1;
    settings.types.walk.enabled = false;
    const schedule = initBreakFireSchedule(settings, 100);
    expect(schedule.stretch).toBe(160);
    expect(schedule.walk).toBeUndefined();
  });

  it("collects due events inside the lookahead window", () => {
    const settings = createDefaultBreakSettings();
    settings.types.stretch.enabled = true;
    settings.types.stretch.intervalMin = 1;
    settings.types.walk.enabled = false;
    settings.types.water.enabled = false;
    settings.types.custom.enabled = false;

    const { events, schedule } = collectDueBreakEvents(
      { stretch: 105 },
      settings,
      100,
      10,
    );
    expect(events).toEqual([{ kind: "stretch", whenSec: 105 }]);
    expect(schedule.stretch).toBe(165);
  });

  it("catch-up fires once after a long suspend, then resumes cadence", () => {
    const settings = createDefaultBreakSettings();
    settings.types.stretch.enabled = true;
    settings.types.stretch.intervalMin = 1;
    settings.types.walk.enabled = false;
    settings.types.water.enabled = false;
    settings.types.custom.enabled = false;

    const { events, schedule } = collectDueBreakEvents(
      { stretch: 10 },
      settings,
      1000,
      0.6,
    );
    expect(events).toEqual([{ kind: "stretch", whenSec: 1000 }]);
    expect(schedule.stretch).toBe(1060);
  });

  it("drops disabled types from the advanced schedule", () => {
    const settings = createDefaultBreakSettings();
    settings.types.stretch.enabled = false;
    const { events, schedule } = collectDueBreakEvents(
      { stretch: 105 },
      settings,
      100,
      10,
    );
    expect(events).toEqual([]);
    expect(schedule.stretch).toBeUndefined();
  });
});

describe("applySnooze", () => {
  it("pushes the next fire by snoozeMin from now", () => {
    const settings = createDefaultBreakSettings();
    settings.snoozeMin = 5;
    const next = applySnooze({ stretch: 200 }, settings, "stretch", 100);
    expect(next.stretch).toBe(400);
  });
});
