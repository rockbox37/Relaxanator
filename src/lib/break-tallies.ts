/**
 * Per-type break completion tallies (#59).
 * Counts increment when the user acknowledges a break via "I did."
 * Persisted in localStorage across sessions (LockedDecision NFR-1).
 */

import { BREAK_TYPES, type BreakKind } from "./breaks";

export const BREAK_TALLIES_STORAGE_KEY = "relaxanator.breakTallies";

export type BreakTallies = Record<BreakKind, number>;

const listeners = new Set<() => void>();
let memoryCache: BreakTallies | null = null;

/**
 * Stable, frozen empty tallies for the SSR/hydration snapshot. Returning a
 * module-level constant (rather than a fresh object each call) keeps the
 * `useSyncExternalStore` server snapshot referentially stable and avoids the
 * "getServerSnapshot should be cached to avoid an infinite loop" warning (#106).
 */
const EMPTY_BREAK_TALLIES: BreakTallies = createEmptyBreakTallies();
Object.freeze(EMPTY_BREAK_TALLIES);

export function createEmptyBreakTallies(): BreakTallies {
  const tallies = {} as BreakTallies;
  for (const def of BREAK_TYPES) {
    tallies[def.id] = 0;
  }
  return tallies;
}

export function incrementBreakTally(
  tallies: BreakTallies,
  kind: BreakKind,
): BreakTallies {
  return { ...tallies, [kind]: tallies[kind] + 1 };
}

export function clearBreakTally(
  tallies: BreakTallies,
  kind: BreakKind,
): BreakTallies {
  return { ...tallies, [kind]: 0 };
}

export function clearAllBreakTallies(): BreakTallies {
  return createEmptyBreakTallies();
}

function isBreakKind(value: string): value is BreakKind {
  return BREAK_TYPES.some((t) => t.id === value);
}

/**
 * Normalize a parsed object into a full BreakTallies map.
 * Unknown keys are ignored; missing kinds default to 0; non-finite
 * counts are clamped to 0.
 */
export function normalizeBreakTallies(raw: unknown): BreakTallies {
  const tallies = createEmptyBreakTallies();
  if (!raw || typeof raw !== "object") return tallies;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isBreakKind(key)) continue;
    const n = typeof value === "number" ? value : Number(value);
    tallies[key] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  return tallies;
}

/** Resolve localStorage when available; null in SSR / restricted contexts. */
export function getBreakTalliesStorage(): Pick<
  Storage,
  "getItem" | "setItem"
> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadBreakTallies(
  storage: Pick<Storage, "getItem"> | null = getBreakTalliesStorage(),
): BreakTallies {
  if (!storage) return createEmptyBreakTallies();
  try {
    const raw = storage.getItem(BREAK_TALLIES_STORAGE_KEY);
    if (!raw) return createEmptyBreakTallies();
    return normalizeBreakTallies(JSON.parse(raw));
  } catch {
    return createEmptyBreakTallies();
  }
}

export function saveBreakTallies(
  tallies: BreakTallies,
  storage: Pick<Storage, "setItem"> | null = getBreakTalliesStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      BREAK_TALLIES_STORAGE_KEY,
      JSON.stringify(normalizeBreakTallies(tallies)),
    );
  } catch {
    // Quota / private mode — keep in-memory tallies usable.
  }
}

function emitBreakTallies(): void {
  for (const listener of listeners) listener();
}

/** useSyncExternalStore subscribe — notifies on in-app tally mutations. */
export function subscribeBreakTallies(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Client snapshot: hydrate from storage once, then serve memory cache. */
export function getBreakTalliesSnapshot(): BreakTallies {
  if (!memoryCache) {
    memoryCache = loadBreakTallies();
  }
  return memoryCache;
}

export function getBreakTalliesServerSnapshot(): BreakTallies {
  return EMPTY_BREAK_TALLIES;
}

export function replaceBreakTallies(next: BreakTallies): void {
  memoryCache = normalizeBreakTallies(next);
  saveBreakTallies(memoryCache);
  emitBreakTallies();
}

export function updateBreakTallies(
  updater: (prev: BreakTallies) => BreakTallies,
): void {
  replaceBreakTallies(updater(getBreakTalliesSnapshot()));
}

/** Test helper — clears the in-memory cache between cases. */
export function resetBreakTalliesStore(): void {
  memoryCache = null;
}
