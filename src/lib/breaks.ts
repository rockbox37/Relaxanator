/**
 * Break-prompt model: typed prompts (stretch / walk / water / custom),
 * per-type schedule settings, and pure lookahead-scheduling math.
 * The Web Audio cue + pump loop live in src/audio/; everything here is
 * deterministic and unit-tested. Timing is audio-clock-driven (NFR-1).
 */

export type BreakKind = "stretch" | "walk" | "water" | "custom";

export interface BreakTypeDef {
  id: BreakKind;
  label: string;
  description: string;
  defaultIntervalMin: number;
  defaultEnabled: boolean;
}

export const BREAK_TYPES: readonly BreakTypeDef[] = [
  {
    id: "stretch",
    label: "Stretch",
    description: "Stand up and stretch",
    defaultIntervalMin: 30,
    defaultEnabled: true,
  },
  {
    id: "walk",
    label: "Walk",
    description: "Take a short walk",
    defaultIntervalMin: 60,
    defaultEnabled: false,
  },
  {
    id: "water",
    label: "Water",
    description: "Drink some water",
    defaultIntervalMin: 45,
    defaultEnabled: false,
  },
  {
    id: "custom",
    label: "Custom",
    description: "Your own break reminder",
    defaultIntervalMin: 20,
    defaultEnabled: false,
  },
];

export interface BreakTypeSettings {
  enabled: boolean;
  intervalMin: number;
  /** Label used when id === "custom"; ignored for built-in types. */
  customLabel: string;
}

export interface BreakSettings {
  types: Record<BreakKind, BreakTypeSettings>;
  /** Soft cue volume into the master mix bus (FR-2). */
  cueVolume: number;
  /** Minutes to delay the next fire when the user snoozes (FR-4). */
  snoozeMin: number;
  /** Opt-in Notification API alerts (FR-3). */
  notificationsEnabled: boolean;
}

export const MIN_BREAK_INTERVAL_MIN = 1;
export const MAX_BREAK_INTERVAL_MIN = 240;
export const MIN_SNOOZE_MIN = 1;
export const MAX_SNOOZE_MIN = 60;
export const DEFAULT_SNOOZE_MIN = 5;
export const DEFAULT_CUE_VOLUME = 0.55;

export function clampBreakIntervalMin(intervalMin: number): number {
  if (Number.isNaN(intervalMin)) return MIN_BREAK_INTERVAL_MIN;
  return Math.min(
    MAX_BREAK_INTERVAL_MIN,
    Math.max(MIN_BREAK_INTERVAL_MIN, intervalMin),
  );
}

export function clampSnoozeMin(snoozeMin: number): number {
  if (Number.isNaN(snoozeMin)) return DEFAULT_SNOOZE_MIN;
  return Math.min(MAX_SNOOZE_MIN, Math.max(MIN_SNOOZE_MIN, snoozeMin));
}

export function createDefaultBreakSettings(): BreakSettings {
  const types = {} as Record<BreakKind, BreakTypeSettings>;
  for (const def of BREAK_TYPES) {
    types[def.id] = {
      enabled: def.defaultEnabled,
      intervalMin: def.defaultIntervalMin,
      customLabel: def.id === "custom" ? "do a little dance" : "",
    };
  }
  return {
    types,
    cueVolume: DEFAULT_CUE_VOLUME,
    snoozeMin: DEFAULT_SNOOZE_MIN,
    notificationsEnabled: false,
  };
}

/** Display label for a break type, honoring the custom label when set. */
export function breakDisplayLabel(
  kind: BreakKind,
  settings: BreakTypeSettings,
): string {
  if (kind === "custom") {
    const trimmed = settings.customLabel.trim();
    return trimmed.length > 0 ? trimmed : "do a little dance";
  }
  return BREAK_TYPES.find((t) => t.id === kind)?.label ?? kind;
}

export function breakPromptMessage(
  kind: BreakKind,
  settings: BreakTypeSettings,
): string {
  const label = breakDisplayLabel(kind, settings);
  switch (kind) {
    case "stretch":
      return "Time to stretch";
    case "walk":
      return "Time for a short walk";
    case "water":
      return "Time to drink water";
    case "custom":
      return label;
  }
}

/**
 * Next fire time (seconds on the audio clock) for a break that last fired —
 * or was enabled — at `fromSec`.
 */
export function computeNextBreakFire(
  fromSec: number,
  settings: BreakTypeSettings,
): number {
  const intervalSec = clampBreakIntervalMin(settings.intervalMin) * 60;
  return fromSec + Math.max(1, intervalSec);
}

/** Map of breakKind -> next scheduled fire time (audio-clock seconds). */
export type BreakFireSchedule = Partial<Record<BreakKind, number>>;

export function initBreakFireSchedule(
  settings: BreakSettings,
  nowSec: number,
): BreakFireSchedule {
  const schedule: BreakFireSchedule = {};
  for (const def of BREAK_TYPES) {
    const type = settings.types[def.id];
    if (!type.enabled) continue;
    schedule[def.id] = computeNextBreakFire(nowSec, type);
  }
  return schedule;
}

export interface BreakDueEvent {
  kind: BreakKind;
  whenSec: number;
}

/**
 * Collect break events due within [nowSec, nowSec + lookaheadSec) and return
 * the advanced schedule. Disabled types are dropped; newly enabled types are
 * seeded one interval out. Stale schedules (long suspend) catch up once then
 * resume cadence — same contract as meditation collectDueEvents.
 */
export function collectDueBreakEvents(
  schedule: BreakFireSchedule,
  settings: BreakSettings,
  nowSec: number,
  lookaheadSec: number,
): { events: BreakDueEvent[]; schedule: BreakFireSchedule } {
  const events: BreakDueEvent[] = [];
  const next: BreakFireSchedule = {};

  for (const def of BREAK_TYPES) {
    const type = settings.types[def.id];
    if (!type.enabled) continue;

    let fireAt = schedule[def.id] ?? computeNextBreakFire(nowSec, type);
    if (fireAt < nowSec) {
      events.push({ kind: def.id, whenSec: nowSec });
      fireAt = computeNextBreakFire(nowSec, type);
      while (fireAt < nowSec + lookaheadSec) {
        fireAt = computeNextBreakFire(fireAt, type);
      }
    } else {
      while (fireAt < nowSec + lookaheadSec) {
        events.push({ kind: def.id, whenSec: fireAt });
        fireAt = computeNextBreakFire(fireAt, type);
      }
    }
    next[def.id] = fireAt;
  }

  return { events, schedule: next };
}

/**
 * Push the next fire for `kind` by the configured snooze duration from
 * `nowSec`. Returns an updated schedule (FR-4).
 */
export function applySnooze(
  schedule: BreakFireSchedule,
  settings: BreakSettings,
  kind: BreakKind,
  nowSec: number,
): BreakFireSchedule {
  const snoozeSec = clampSnoozeMin(settings.snoozeMin) * 60;
  return { ...schedule, [kind]: nowSec + snoozeSec };
}
