/**
 * Output mute model (#97). A 3-state gate over the audio graph so the two
 * top-transport buttons never fight each other:
 *
 * - "off"          — everything audible
 * - "all"          — everything silenced (latching Mute All)
 * - "except-todo"  — everything silenced *except* ToDo reminder cues
 *
 * Pure mapping only; the Web Audio wiring that applies these gains lives in
 * src/audio/noise-engine.ts. Muting gates a dedicated output stage rather than
 * touching per-layer volumes, so unmuting restores the prior levels exactly.
 */

export type MuteState = "off" | "all" | "except-todo";

export interface MuteGains {
  /** Final output gate — 0 silences the whole graph (ToDo cues included). */
  output: number;
  /** Muted-group gate — 0 silences noise/meditation/breaks/announcements. */
  mainGroup: number;
}

/** Gains for each mute state. ToDo cues bypass the main group, so only the
 * output gate silences them. */
export function muteGains(state: MuteState): MuteGains {
  switch (state) {
    case "all":
      return { output: 0, mainGroup: 1 };
    case "except-todo":
      return { output: 1, mainGroup: 0 };
    case "off":
    default:
      return { output: 1, mainGroup: 1 };
  }
}

/** Mute All / Unmute All toggle: flips in and out of full mute. */
export function toggleMuteAll(state: MuteState): MuteState {
  return state === "all" ? "off" : "all";
}

/** Mute-all-but-ToDo toggle: flips in and out of the ToDo-exempt mute. */
export function toggleMuteExceptTodo(state: MuteState): MuteState {
  return state === "except-todo" ? "off" : "except-todo";
}

export function isMuteAllActive(state: MuteState): boolean {
  return state === "all";
}

export function isExceptTodoActive(state: MuteState): boolean {
  return state === "except-todo";
}
