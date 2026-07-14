/**
 * Shared daily goal for break tally progress bars (#72).
 * One global target applies to each category independently.
 * Persisted in localStorage across sessions (same pattern as tallies / NFR-1).
 */

export const BREAK_DAILY_GOAL_STORAGE_KEY = "relaxanator.breakDailyGoal";

export const MIN_BREAK_DAILY_GOAL = 1;
export const MAX_BREAK_DAILY_GOAL = 20;
export const DEFAULT_BREAK_DAILY_GOAL = 4;

const listeners = new Set<() => void>();
let memoryCache: number | null = null;

/** Clamp to the slider range; non-finite values fall back to the default. */
export function clampBreakDailyGoal(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_BREAK_DAILY_GOAL;
  return Math.min(
    MAX_BREAK_DAILY_GOAL,
    Math.max(MIN_BREAK_DAILY_GOAL, Math.round(value)),
  );
}

/** Count toward goal as 0–1, clamped at 100% when over goal. */
export function breakGoalProgressRatio(count: number, goal: number): number {
  const g = clampBreakDailyGoal(goal);
  const c = Number.isFinite(count) && count > 0 ? count : 0;
  return Math.min(1, c / g);
}

/** True when the category count meets or exceeds the daily goal. */
export function isBreakDailyGoalMet(count: number, goal: number): boolean {
  const g = clampBreakDailyGoal(goal);
  const c = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return c >= g;
}

/** Resolve localStorage when available; null in SSR / restricted contexts. */
export function getBreakDailyGoalStorage(): Pick<
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

export function loadBreakDailyGoal(
  storage: Pick<Storage, "getItem"> | null = getBreakDailyGoalStorage(),
): number {
  if (!storage) return DEFAULT_BREAK_DAILY_GOAL;
  try {
    const raw = storage.getItem(BREAK_DAILY_GOAL_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_BREAK_DAILY_GOAL;
    return clampBreakDailyGoal(Number(JSON.parse(raw)));
  } catch {
    return DEFAULT_BREAK_DAILY_GOAL;
  }
}

export function saveBreakDailyGoal(
  goal: number,
  storage: Pick<Storage, "setItem"> | null = getBreakDailyGoalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(
      BREAK_DAILY_GOAL_STORAGE_KEY,
      JSON.stringify(clampBreakDailyGoal(goal)),
    );
  } catch {
    // Quota / private mode — keep in-memory goal usable.
  }
}

function emitBreakDailyGoal(): void {
  for (const listener of listeners) listener();
}

/** useSyncExternalStore subscribe — notifies on in-app goal mutations. */
export function subscribeBreakDailyGoal(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Client snapshot: hydrate from storage once, then serve memory cache. */
export function getBreakDailyGoalSnapshot(): number {
  if (memoryCache === null) {
    memoryCache = loadBreakDailyGoal();
  }
  return memoryCache;
}

export function getBreakDailyGoalServerSnapshot(): number {
  return DEFAULT_BREAK_DAILY_GOAL;
}

export function setBreakDailyGoal(next: number): void {
  memoryCache = clampBreakDailyGoal(next);
  saveBreakDailyGoal(memoryCache);
  emitBreakDailyGoal();
}

/** Test helper — clears the in-memory cache between cases. */
export function resetBreakDailyGoalStore(): void {
  memoryCache = null;
}
