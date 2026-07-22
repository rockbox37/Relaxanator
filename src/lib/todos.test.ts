import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TODOS_STORAGE_KEY,
  TODO_SNOOZE_MIN,
  addTodo,
  createTodoItem,
  dismissTodo,
  dismissTodoReminder,
  effectiveTodoDueAt,
  formatReminderLabel,
  getActiveTodoReminder,
  getTodosServerSnapshot,
  getTodosSnapshot,
  getTodosStorage,
  isTodoReminderActive,
  listActiveTodoReminders,
  loadTodos,
  localDateKey,
  normalizeReminderTime,
  normalizeTodoText,
  normalizeTodos,
  patchTodo,
  reminderDueAtToday,
  removeTodo,
  resetTodosStore,
  saveTodos,
  snoozeTodo,
  snoozeTodoItem,
  subscribeTodos,
  todoUrgencyFromOverdueMs,
  updateTodoItem,
} from "./todos";

function mockLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });
  return storage;
}

describe("normalizeTodoText / reminder time", () => {
  it("trims and caps text length", () => {
    expect(normalizeTodoText("  hello  ")).toBe("hello");
    expect(normalizeTodoText("x".repeat(300)).length).toBe(200);
  });

  it("normalizes HH:MM reminder times", () => {
    expect(normalizeReminderTime("9:05")).toBe("09:05");
    expect(normalizeReminderTime("10:00")).toBe("10:00");
    expect(normalizeReminderTime("")).toBeNull();
    expect(normalizeReminderTime("25:00")).toBeNull();
    expect(normalizeReminderTime("10:60")).toBeNull();
  });

  it("formats reminder labels in 12h", () => {
    expect(formatReminderLabel("10:00")).toBe("10:00 AM");
    expect(formatReminderLabel("14:30")).toBe("2:30 PM");
    expect(formatReminderLabel("00:15")).toBe("12:15 AM");
    expect(formatReminderLabel(null)).toBe("");
  });
});

describe("reminder due / urgency", () => {
  it("computes today's due instant from HH:MM", () => {
    const now = new Date(2026, 6, 14, 9, 0, 0);
    expect(reminderDueAtToday("10:00", now)).toBe(
      new Date(2026, 6, 14, 10, 0, 0).getTime(),
    );
  });

  it("maps overdue duration to urgency tiers", () => {
    expect(todoUrgencyFromOverdueMs(0)).toBe("due");
    expect(todoUrgencyFromOverdueMs(4 * 60_000)).toBe("due");
    expect(todoUrgencyFromOverdueMs(5 * 60_000)).toBe("overdue");
    expect(todoUrgencyFromOverdueMs(30 * 60_000)).toBe("urgent");
    expect(todoUrgencyFromOverdueMs(60 * 60_000)).toBe("critical");
  });

  it("activates after reminder time and escalates prominence", () => {
    const item = createTodoItem(
      "Call doctor",
      "10:00",
      new Date(2026, 6, 14, 8, 0).getTime(),
    )!;
    const before = new Date(2026, 6, 14, 9, 59).getTime();
    const justDue = new Date(2026, 6, 14, 10, 0).getTime();
    const overdue = new Date(2026, 6, 14, 10, 10).getTime();
    const urgent = new Date(2026, 6, 14, 10, 35).getTime();
    const critical = new Date(2026, 6, 14, 11, 5).getTime();

    expect(isTodoReminderActive(item, before)).toBe(false);
    expect(getActiveTodoReminder(item, justDue)?.urgency).toBe("due");
    expect(getActiveTodoReminder(item, overdue)?.urgency).toBe("overdue");
    expect(getActiveTodoReminder(item, urgent)?.urgency).toBe("urgent");
    expect(getActiveTodoReminder(item, critical)?.urgency).toBe("critical");
  });

  it("respects snoozeUntil and dismissedDate", () => {
    const base = createTodoItem(
      "Call doctor",
      "10:00",
      new Date(2026, 6, 14, 8, 0).getTime(),
    )!;
    const now = new Date(2026, 6, 14, 10, 5);
    const snoozed = snoozeTodoItem(base, 5, now.getTime());
    expect(isTodoReminderActive(snoozed, now.getTime())).toBe(false);
    expect(
      isTodoReminderActive(snoozed, now.getTime() + 5 * 60_000),
    ).toBe(true);

    const dismissed = dismissTodoReminder(base, now);
    expect(dismissed.dismissedDate).toBe(localDateKey(now));
    expect(effectiveTodoDueAt(dismissed, now)).toBeNull();
    expect(isTodoReminderActive(dismissed, now.getTime())).toBe(false);
  });

  it("lists active reminders most overdue first", () => {
    const a = createTodoItem("A", "09:00", 1)!;
    const b = createTodoItem("B", "10:00", 2)!;
    const now = new Date(2026, 6, 14, 10, 30).getTime();
    const list = listActiveTodoReminders([a, b], now);
    expect(list.map((r) => r.item.text)).toEqual(["A", "B"]);
    expect(list[0].overdueMs).toBeGreaterThan(list[1].overdueMs);
  });
});

describe("create / update helpers", () => {
  it("rejects empty text on create and update", () => {
    expect(createTodoItem("   ")).toBeNull();
    const item = createTodoItem("Keep")!;
    expect(updateTodoItem(item, { text: "  " })).toBeNull();
  });

  it("clears snooze when reminder time changes", () => {
    const item = snoozeTodoItem(createTodoItem("X", "10:00")!, 5, 1000);
    const updated = updateTodoItem(item, { reminderTime: "11:00" }, 2000)!;
    expect(updated.reminderTime).toBe("11:00");
    expect(updated.snoozeUntil).toBeNull();
    expect(updated.dismissedDate).toBeNull();
  });
});

describe("persistence store", () => {
  beforeEach(() => {
    mockLocalStorage();
    resetTodosStore();
  });

  afterEach(() => {
    resetTodosStore();
    Reflect.deleteProperty(globalThis, "localStorage");
  });

  it("round-trips todos through localStorage", () => {
    const item = createTodoItem("Buy tea", "15:30", 42)!;
    saveTodos([item]);
    expect(loadTodos()).toEqual([item]);
    expect(JSON.parse(localStorage.getItem(TODOS_STORAGE_KEY)!)).toEqual([
      item,
    ]);
  });

  it("normalizes corrupt payloads", () => {
    expect(normalizeTodos(null)).toEqual([]);
    expect(normalizeTodos([{ id: "a" }])).toEqual([]);
    expect(
      normalizeTodos([
        { id: "a", text: "ok", reminderTime: "bad", createdAt: 1, updatedAt: 1 },
      ])[0].reminderTime,
    ).toBeNull();
    expect(
      normalizeTodos([
        {
          id: "a",
          text: "ok",
          createdAt: "x",
          updatedAt: "y",
          snoozeUntil: "nope",
          dismissedDate: "not-a-date",
        },
      ])[0],
    ).toMatchObject({
      text: "ok",
      snoozeUntil: null,
      dismissedDate: null,
    });
    // Duplicate ids are dropped after the first
    expect(
      normalizeTodos([
        { id: "dup", text: "first", createdAt: 1, updatedAt: 1 },
        { id: "dup", text: "second", createdAt: 2, updatedAt: 2 },
      ]),
    ).toHaveLength(1);
  });

  it("load/save tolerate null storage and thrown setItem", () => {
    expect(loadTodos(null)).toEqual([]);
    saveTodos([createTodoItem("x")!], null);
    const throwing = {
      getItem: () => {
        throw new Error("boom");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadTodos(throwing)).toEqual([]);
    saveTodos([createTodoItem("y")!], throwing);
  });

  it("loadTodos returns empty for missing key", () => {
    expect(loadTodos()).toEqual([]);
  });

  it("subscribeTodos notifies listeners and unsubscribe stops", () => {
    const seen: number[] = [];
    const unsub = subscribeTodos(() => seen.push(1));
    addTodo("Notify me");
    expect(seen).toEqual([1]);
    unsub();
    addTodo("Silent");
    expect(seen).toEqual([1]);
  });

  it("add / patch / remove / snooze / dismiss via store API", () => {
    expect(addTodo("   ")).toBeNull();
    const created = addTodo("Schedule appointment", "10:00", 100)!;
    expect(getTodosSnapshot()).toHaveLength(1);
    expect(patchTodo(created.id, { text: "Call clinic" }, 200)).toBe(true);
    expect(patchTodo(created.id, { text: "   " }, 201)).toBe(false);
    expect(patchTodo("missing", { text: "Nope" }, 202)).toBe(false);
    expect(getTodosSnapshot()[0].text).toBe("Call clinic");

    const dueNow = new Date(2026, 6, 14, 10, 1).getTime();
    const dueItem = {
      ...getTodosSnapshot()[0],
      reminderTime: "10:00" as string | null,
      snoozeUntil: null,
      dismissedDate: null,
    };
    saveTodos([dueItem]);
    resetTodosStore();
    expect(isTodoReminderActive(getTodosSnapshot()[0], dueNow)).toBe(true);
    snoozeTodo(dueItem.id, TODO_SNOOZE_MIN, dueNow);
    expect(isTodoReminderActive(getTodosSnapshot()[0], dueNow)).toBe(false);

    // Invalid snooze minutes fall back to default
    const again = snoozeTodoItem(getTodosSnapshot()[0], 0, dueNow);
    expect(again.snoozeUntil).toBe(dueNow + TODO_SNOOZE_MIN * 60_000);

    dismissTodo(dueItem.id, new Date(dueNow));
    expect(getTodosSnapshot()[0].dismissedDate).toBe(
      localDateKey(new Date(dueNow)),
    );

    removeTodo(dueItem.id);
    expect(getTodosSnapshot()).toEqual([]);
  });

  it("returns localStorage when available and empty server snapshot", () => {
    expect(getTodosStorage()).toBe(localStorage);
    expect(getTodosServerSnapshot()).toEqual([]);
  });

  it("server snapshot is a stable, frozen reference across calls (#106)", () => {
    const a = getTodosServerSnapshot();
    const b = getTodosServerSnapshot();
    expect(a).toBe(b);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("client snapshot is stable until a mutation, then a fresh reference (#106)", () => {
    const first = getTodosSnapshot();
    // Repeated reads without mutation return the identical reference.
    expect(getTodosSnapshot()).toBe(first);
    addTodo("Ship the fix", null, 500);
    const afterMutation = getTodosSnapshot();
    // A mutation swaps the cached reference…
    expect(afterMutation).not.toBe(first);
    // …and subsequent reads are stable again.
    expect(getTodosSnapshot()).toBe(afterMutation);
  });

  it("returns null when localStorage access throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("denied");
      },
      configurable: true,
    });
    expect(getTodosStorage()).toBeNull();
  });

  it("treats non-finite snoozeUntil as unset for due calculation", () => {
    const item = {
      ...createTodoItem("Z", "10:00")!,
      snoozeUntil: Number.NaN,
    };
    const now = new Date(2026, 6, 14, 10, 5);
    expect(effectiveTodoDueAt(item, now)).toBe(reminderDueAtToday("10:00", now));
  });
});
