/**
 * Personal ToDo list with optional local-clock reminders (#76).
 * Persisted in localStorage (same offline-first pattern as break tallies).
 */

export const TODOS_STORAGE_KEY = "relaxanator.todos";

/** Fixed snooze interval for v1 (matches default break snooze). */
export const TODO_SNOOZE_MIN = 5;

export const MAX_TODO_TEXT_LEN = 200;

/** Reminder prominence tiers by overdue duration. */
export type TodoUrgency = "due" | "overdue" | "urgent" | "critical";

export interface TodoItem {
  id: string;
  text: string;
  /** Local clock time "HH:MM" (24h), or null when no reminder. */
  reminderTime: string | null;
  /** Epoch ms — reminder hidden until this instant (snooze). */
  snoozeUntil: number | null;
  /** Local calendar date YYYY-MM-DD when reminder was dismissed for the day. */
  dismissedDate: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ActiveTodoReminder {
  item: TodoItem;
  /** Epoch ms when the reminder became due (after snooze if any). */
  dueAt: number;
  overdueMs: number;
  urgency: TodoUrgency;
}

const listeners = new Set<() => void>();
let memoryCache: TodoItem[] | null = null;

export function createTodoId(now: number = Date.now()): string {
  return `todo-${now}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Normalize free text; empty after trim is invalid for create/update. */
export function normalizeTodoText(text: string): string {
  return text.trim().slice(0, MAX_TODO_TEXT_LEN);
}

/**
 * Accept "HH:MM" (24h) or empty/null. Invalid shapes become null.
 */
export function normalizeReminderTime(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(trimmed);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatReminderLabel(reminderTime: string | null): string {
  if (!reminderTime) return "";
  const [hRaw, m] = reminderTime.split(":");
  const h = Number(hRaw);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m} ${suffix}`;
}

export function localDateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Today's local reminder instant for HH:MM, or null if unset/invalid. */
export function reminderDueAtToday(
  reminderTime: string | null,
  now: Date = new Date(),
): number | null {
  const normalized = normalizeReminderTime(reminderTime);
  if (!normalized) return null;
  const [h, m] = normalized.split(":").map(Number);
  const due = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    h,
    m,
    0,
    0,
  );
  return due.getTime();
}

export function todoUrgencyFromOverdueMs(overdueMs: number): TodoUrgency {
  if (overdueMs >= 60 * 60_000) return "critical";
  if (overdueMs >= 30 * 60_000) return "urgent";
  if (overdueMs >= 5 * 60_000) return "overdue";
  return "due";
}

/**
 * Effective due instant: snoozeUntil when set, otherwise today's reminder time.
 * Returns null when there is no reminder or it was dismissed for today.
 */
export function effectiveTodoDueAt(
  item: TodoItem,
  now: Date = new Date(),
): number | null {
  if (!item.reminderTime) return null;
  if (item.dismissedDate === localDateKey(now)) return null;
  if (item.snoozeUntil != null && Number.isFinite(item.snoozeUntil)) {
    return item.snoozeUntil;
  }
  return reminderDueAtToday(item.reminderTime, now);
}

export function isTodoReminderActive(
  item: TodoItem,
  nowMs: number = Date.now(),
): boolean {
  const dueAt = effectiveTodoDueAt(item, new Date(nowMs));
  if (dueAt == null) return false;
  return nowMs >= dueAt;
}

export function getActiveTodoReminder(
  item: TodoItem,
  nowMs: number = Date.now(),
): ActiveTodoReminder | null {
  const dueAt = effectiveTodoDueAt(item, new Date(nowMs));
  if (dueAt == null || nowMs < dueAt) return null;
  const overdueMs = Math.max(0, nowMs - dueAt);
  return {
    item,
    dueAt,
    overdueMs,
    urgency: todoUrgencyFromOverdueMs(overdueMs),
  };
}

export function listActiveTodoReminders(
  items: readonly TodoItem[],
  nowMs: number = Date.now(),
): ActiveTodoReminder[] {
  return items
    .map((item) => getActiveTodoReminder(item, nowMs))
    .filter((r): r is ActiveTodoReminder => r != null)
    .sort((a, b) => b.overdueMs - a.overdueMs);
}

export function createTodoItem(
  text: string,
  reminderTime: string | null = null,
  nowMs: number = Date.now(),
): TodoItem | null {
  const normalized = normalizeTodoText(text);
  if (!normalized) return null;
  return {
    id: createTodoId(nowMs),
    text: normalized,
    reminderTime: normalizeReminderTime(reminderTime),
    snoozeUntil: null,
    dismissedDate: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

export function updateTodoItem(
  item: TodoItem,
  update: { text?: string; reminderTime?: string | null },
  nowMs: number = Date.now(),
): TodoItem | null {
  const nextText =
    update.text !== undefined ? normalizeTodoText(update.text) : item.text;
  if (!nextText) return null;
  const nextReminder =
    update.reminderTime !== undefined
      ? normalizeReminderTime(update.reminderTime)
      : item.reminderTime;
  const reminderChanged = nextReminder !== item.reminderTime;
  return {
    ...item,
    text: nextText,
    reminderTime: nextReminder,
    // Editing the reminder clears snooze / same-day dismiss so the new time applies.
    snoozeUntil: reminderChanged ? null : item.snoozeUntil,
    dismissedDate: reminderChanged ? null : item.dismissedDate,
    updatedAt: nowMs,
  };
}

export function snoozeTodoItem(
  item: TodoItem,
  snoozeMin: number = TODO_SNOOZE_MIN,
  nowMs: number = Date.now(),
): TodoItem {
  const minutes = Number.isFinite(snoozeMin) && snoozeMin > 0 ? snoozeMin : TODO_SNOOZE_MIN;
  return {
    ...item,
    snoozeUntil: nowMs + minutes * 60_000,
    dismissedDate: null,
    updatedAt: nowMs,
  };
}

export function dismissTodoReminder(
  item: TodoItem,
  now: Date = new Date(),
): TodoItem {
  return {
    ...item,
    snoozeUntil: null,
    dismissedDate: localDateKey(now),
    updatedAt: now.getTime(),
  };
}

export function normalizeTodoItem(raw: unknown): TodoItem | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" && obj.id ? obj.id : null;
  const text = typeof obj.text === "string" ? normalizeTodoText(obj.text) : "";
  if (!id || !text) return null;
  const createdAt =
    typeof obj.createdAt === "number" && Number.isFinite(obj.createdAt)
      ? obj.createdAt
      : Date.now();
  const updatedAt =
    typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt)
      ? obj.updatedAt
      : createdAt;
  const snoozeUntil =
    typeof obj.snoozeUntil === "number" && Number.isFinite(obj.snoozeUntil)
      ? obj.snoozeUntil
      : null;
  const dismissedDate =
    typeof obj.dismissedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.dismissedDate)
      ? obj.dismissedDate
      : null;
  return {
    id,
    text,
    reminderTime: normalizeReminderTime(
      typeof obj.reminderTime === "string" ? obj.reminderTime : null,
    ),
    snoozeUntil,
    dismissedDate,
    createdAt,
    updatedAt,
  };
}

export function normalizeTodos(raw: unknown): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  const items: TodoItem[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const item = normalizeTodoItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return items;
}

/** Resolve localStorage when available; null in SSR / restricted contexts. */
export function getTodosStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadTodos(
  storage: Pick<Storage, "getItem"> | null = getTodosStorage(),
): TodoItem[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(TODOS_STORAGE_KEY);
    if (!raw) return [];
    return normalizeTodos(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function saveTodos(
  items: readonly TodoItem[],
  storage: Pick<Storage, "setItem"> | null = getTodosStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(TODOS_STORAGE_KEY, JSON.stringify(normalizeTodos(items)));
  } catch {
    // Quota / private mode — keep in-memory list usable.
  }
}

function emitTodos(): void {
  for (const listener of listeners) listener();
}

export function subscribeTodos(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTodosSnapshot(): TodoItem[] {
  if (!memoryCache) {
    memoryCache = loadTodos();
  }
  return memoryCache;
}

export function getTodosServerSnapshot(): TodoItem[] {
  return [];
}

export function replaceTodos(next: TodoItem[]): void {
  memoryCache = normalizeTodos(next);
  saveTodos(memoryCache);
  emitTodos();
}

export function updateTodos(updater: (prev: TodoItem[]) => TodoItem[]): void {
  replaceTodos(updater(getTodosSnapshot()));
}

export function addTodo(
  text: string,
  reminderTime: string | null = null,
  nowMs: number = Date.now(),
): TodoItem | null {
  const item = createTodoItem(text, reminderTime, nowMs);
  if (!item) return null;
  updateTodos((prev) => [...prev, item]);
  return item;
}

export function patchTodo(
  id: string,
  update: { text?: string; reminderTime?: string | null },
  nowMs: number = Date.now(),
): boolean {
  let ok = false;
  updateTodos((prev) =>
    prev.map((item) => {
      if (item.id !== id) return item;
      const next = updateTodoItem(item, update, nowMs);
      if (!next) return item;
      ok = true;
      return next;
    }),
  );
  return ok;
}

export function removeTodo(id: string): void {
  updateTodos((prev) => prev.filter((item) => item.id !== id));
}

export function snoozeTodo(
  id: string,
  snoozeMin: number = TODO_SNOOZE_MIN,
  nowMs: number = Date.now(),
): void {
  updateTodos((prev) =>
    prev.map((item) =>
      item.id === id ? snoozeTodoItem(item, snoozeMin, nowMs) : item,
    ),
  );
}

export function dismissTodo(id: string, now: Date = new Date()): void {
  updateTodos((prev) =>
    prev.map((item) => (item.id === id ? dismissTodoReminder(item, now) : item)),
  );
}

/** Test helper — clears the in-memory cache between cases. */
export function resetTodosStore(): void {
  memoryCache = null;
}
