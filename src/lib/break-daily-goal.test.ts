import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BREAK_DAILY_GOAL_STORAGE_KEY,
  DEFAULT_BREAK_DAILY_GOAL,
  MAX_BREAK_DAILY_GOAL,
  MIN_BREAK_DAILY_GOAL,
  breakGoalProgressRatio,
  clampBreakDailyGoal,
  getBreakDailyGoalServerSnapshot,
  getBreakDailyGoalSnapshot,
  getBreakDailyGoalStorage,
  isBreakDailyGoalMet,
  loadBreakDailyGoal,
  resetBreakDailyGoalStore,
  saveBreakDailyGoal,
  setBreakDailyGoal,
  subscribeBreakDailyGoal,
} from "./break-daily-goal";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial };
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
}

function installLocalStorage(storage: Storage = memoryStorage()): Storage {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  return storage;
}

function removeLocalStorage(): void {
  Reflect.deleteProperty(globalThis, "localStorage");
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  resetBreakDailyGoalStore();
  vi.restoreAllMocks();
  removeLocalStorage();
});

describe("clampBreakDailyGoal", () => {
  it("clamps to the 1–20 range and rounds", () => {
    expect(clampBreakDailyGoal(0)).toBe(MIN_BREAK_DAILY_GOAL);
    expect(clampBreakDailyGoal(21)).toBe(MAX_BREAK_DAILY_GOAL);
    expect(clampBreakDailyGoal(3.6)).toBe(4);
    expect(clampBreakDailyGoal(Number.NaN)).toBe(DEFAULT_BREAK_DAILY_GOAL);
  });
});

describe("breakGoalProgressRatio / isBreakDailyGoalMet", () => {
  it("fills left to right and clamps at 100%", () => {
    expect(breakGoalProgressRatio(0, 4)).toBe(0);
    expect(breakGoalProgressRatio(2, 4)).toBe(0.5);
    expect(breakGoalProgressRatio(4, 4)).toBe(1);
    expect(breakGoalProgressRatio(9, 4)).toBe(1);
  });

  it("treats non-finite or negative counts as empty", () => {
    expect(breakGoalProgressRatio(-1, 4)).toBe(0);
    expect(breakGoalProgressRatio(Number.NaN, 4)).toBe(0);
  });

  it("reports goal met at or above the target", () => {
    expect(isBreakDailyGoalMet(3, 4)).toBe(false);
    expect(isBreakDailyGoalMet(4, 4)).toBe(true);
    expect(isBreakDailyGoalMet(5, 4)).toBe(true);
    expect(isBreakDailyGoalMet(0, 1)).toBe(false);
  });
});

describe("loadBreakDailyGoal / saveBreakDailyGoal", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    saveBreakDailyGoal(7, storage);
    expect(storage.getItem(BREAK_DAILY_GOAL_STORAGE_KEY)).toBe("7");
    expect(loadBreakDailyGoal(storage)).toBe(7);
  });

  it("returns the default when storage is missing or corrupt", () => {
    expect(loadBreakDailyGoal(null)).toBe(DEFAULT_BREAK_DAILY_GOAL);
    expect(
      loadBreakDailyGoal(
        memoryStorage({ [BREAK_DAILY_GOAL_STORAGE_KEY]: "{bad" }),
      ),
    ).toBe(DEFAULT_BREAK_DAILY_GOAL);
  });

  it("returns the default when the key is absent", () => {
    expect(loadBreakDailyGoal(memoryStorage())).toBe(DEFAULT_BREAK_DAILY_GOAL);
  });

  it("clamps values loaded from storage", () => {
    const storage = memoryStorage({
      [BREAK_DAILY_GOAL_STORAGE_KEY]: "99",
    });
    expect(loadBreakDailyGoal(storage)).toBe(MAX_BREAK_DAILY_GOAL);
  });

  it("swallows setItem failures", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveBreakDailyGoal(5, storage)).not.toThrow();
  });

  it("no-ops save when storage is null", () => {
    expect(() => saveBreakDailyGoal(5, null)).not.toThrow();
  });

  it("uses the default storage helper when omitted", () => {
    localStorage.setItem(BREAK_DAILY_GOAL_STORAGE_KEY, "6");
    expect(loadBreakDailyGoal()).toBe(6);
    saveBreakDailyGoal(8);
    expect(localStorage.getItem(BREAK_DAILY_GOAL_STORAGE_KEY)).toBe("8");
  });
});

describe("getBreakDailyGoalStorage", () => {
  it("returns localStorage when available", () => {
    expect(getBreakDailyGoalStorage()).toBe(localStorage);
  });

  it("returns null when localStorage is undefined", () => {
    removeLocalStorage();
    expect(getBreakDailyGoalStorage()).toBeNull();
  });

  it("returns null when localStorage access throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    expect(getBreakDailyGoalStorage()).toBeNull();
  });
});

describe("break daily goal store", () => {
  it("hydrates snapshot from storage and notifies subscribers", () => {
    localStorage.setItem(BREAK_DAILY_GOAL_STORAGE_KEY, "5");
    expect(getBreakDailyGoalSnapshot()).toBe(5);
    expect(getBreakDailyGoalServerSnapshot()).toBe(DEFAULT_BREAK_DAILY_GOAL);

    const listener = vi.fn();
    const unsubscribe = subscribeBreakDailyGoal(listener);
    setBreakDailyGoal(9);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBreakDailyGoalSnapshot()).toBe(9);
    unsubscribe();
    setBreakDailyGoal(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBreakDailyGoalSnapshot()).toBe(2);
  });
});
