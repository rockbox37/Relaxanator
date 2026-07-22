import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BREAK_TALLIES_STORAGE_KEY,
  clearAllBreakTallies,
  clearBreakTally,
  createEmptyBreakTallies,
  getBreakTalliesServerSnapshot,
  getBreakTalliesSnapshot,
  getBreakTalliesStorage,
  incrementBreakTally,
  loadBreakTallies,
  normalizeBreakTallies,
  replaceBreakTallies,
  resetBreakTalliesStore,
  saveBreakTallies,
  subscribeBreakTallies,
  updateBreakTallies,
} from "./break-tallies";

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
  resetBreakTalliesStore();
  vi.restoreAllMocks();
  removeLocalStorage();
});

describe("createEmptyBreakTallies", () => {
  it("starts every break kind at zero", () => {
    expect(createEmptyBreakTallies()).toEqual({
      stretch: 0,
      walk: 0,
      water: 0,
      custom: 0,
    });
  });
});

describe("increment / clear", () => {
  it("increments one kind without touching others", () => {
    const next = incrementBreakTally(createEmptyBreakTallies(), "walk");
    expect(next).toEqual({ stretch: 0, walk: 1, water: 0, custom: 0 });
  });

  it("clears one kind", () => {
    const tallies = { stretch: 2, walk: 5, water: 1, custom: 0 };
    expect(clearBreakTally(tallies, "walk")).toEqual({
      stretch: 2,
      walk: 0,
      water: 1,
      custom: 0,
    });
  });

  it("clearAll resets every kind", () => {
    expect(clearAllBreakTallies()).toEqual(createEmptyBreakTallies());
  });
});

describe("normalizeBreakTallies", () => {
  it("fills missing kinds and ignores unknown keys", () => {
    expect(normalizeBreakTallies({ stretch: 3, bogus: 9 })).toEqual({
      stretch: 3,
      walk: 0,
      water: 0,
      custom: 0,
    });
  });

  it("clamps non-finite and negative counts to zero", () => {
    expect(
      normalizeBreakTallies({
        stretch: -1,
        walk: Number.NaN,
        water: 2.9,
        custom: "4",
      }),
    ).toEqual({ stretch: 0, walk: 0, water: 2, custom: 4 });
  });

  it("returns empty tallies for non-objects", () => {
    expect(normalizeBreakTallies(null)).toEqual(createEmptyBreakTallies());
    expect(normalizeBreakTallies("nope")).toEqual(createEmptyBreakTallies());
  });
});

describe("loadBreakTallies / saveBreakTallies", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const tallies = { stretch: 1, walk: 2, water: 3, custom: 4 };
    saveBreakTallies(tallies, storage);
    expect(storage.getItem(BREAK_TALLIES_STORAGE_KEY)).toBe(
      JSON.stringify(tallies),
    );
    expect(loadBreakTallies(storage)).toEqual(tallies);
  });

  it("returns empty tallies when storage is missing or corrupt", () => {
    expect(loadBreakTallies(null)).toEqual(createEmptyBreakTallies());
    expect(
      loadBreakTallies(memoryStorage({ [BREAK_TALLIES_STORAGE_KEY]: "{bad" })),
    ).toEqual(createEmptyBreakTallies());
  });

  it("returns empty tallies when the key is absent", () => {
    expect(loadBreakTallies(memoryStorage())).toEqual(createEmptyBreakTallies());
  });

  it("swallows setItem failures", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() =>
      saveBreakTallies(createEmptyBreakTallies(), storage),
    ).not.toThrow();
  });

  it("no-ops save when storage is null", () => {
    expect(() => saveBreakTallies(createEmptyBreakTallies(), null)).not.toThrow();
  });

  it("uses the default storage helper when omitted", () => {
    localStorage.setItem(
      BREAK_TALLIES_STORAGE_KEY,
      JSON.stringify({ stretch: 7, walk: 0, water: 0, custom: 0 }),
    );
    expect(loadBreakTallies()).toEqual({
      stretch: 7,
      walk: 0,
      water: 0,
      custom: 0,
    });
    saveBreakTallies({ stretch: 1, walk: 0, water: 0, custom: 0 });
    expect(JSON.parse(localStorage.getItem(BREAK_TALLIES_STORAGE_KEY)!)).toEqual(
      {
        stretch: 1,
        walk: 0,
        water: 0,
        custom: 0,
      },
    );
  });
});

describe("getBreakTalliesStorage", () => {
  it("returns localStorage when available", () => {
    expect(getBreakTalliesStorage()).toBe(localStorage);
  });

  it("returns null when localStorage is undefined", () => {
    removeLocalStorage();
    expect(getBreakTalliesStorage()).toBeNull();
  });

  it("returns null when localStorage access throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    expect(getBreakTalliesStorage()).toBeNull();
  });
});

describe("break tallies store", () => {
  it("hydrates snapshot from storage and notifies subscribers", () => {
    localStorage.setItem(
      BREAK_TALLIES_STORAGE_KEY,
      JSON.stringify({ stretch: 2, walk: 0, water: 0, custom: 0 }),
    );
    expect(getBreakTalliesSnapshot()).toEqual({
      stretch: 2,
      walk: 0,
      water: 0,
      custom: 0,
    });
    expect(getBreakTalliesServerSnapshot()).toEqual(createEmptyBreakTallies());

    const listener = vi.fn();
    const unsubscribe = subscribeBreakTallies(listener);
    updateBreakTallies((prev) => incrementBreakTally(prev, "water"));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getBreakTalliesSnapshot().water).toBe(1);
    replaceBreakTallies(clearAllBreakTallies());
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getBreakTalliesSnapshot()).toEqual(createEmptyBreakTallies());
    unsubscribe();
    updateBreakTallies((prev) => incrementBreakTally(prev, "custom"));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("server snapshot is a stable, frozen reference across calls (#106)", () => {
    const a = getBreakTalliesServerSnapshot();
    const b = getBreakTalliesServerSnapshot();
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("client snapshot is stable until a mutation, then a fresh reference (#106)", () => {
    const first = getBreakTalliesSnapshot();
    // Repeated reads without mutation return the identical reference.
    expect(getBreakTalliesSnapshot()).toBe(first);
    updateBreakTallies((prev) => incrementBreakTally(prev, "walk"));
    const afterMutation = getBreakTalliesSnapshot();
    // A mutation swaps the cached reference…
    expect(afterMutation).not.toBe(first);
    // …and subsequent reads are stable again.
    expect(getBreakTalliesSnapshot()).toBe(afterMutation);
  });
});
