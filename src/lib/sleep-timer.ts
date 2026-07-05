/**
 * Sleep-timer model (#19): duration presets, the gentle fade window, and the
 * pure countdown / fire math on the audio clock. Follows the meditation
 * scheduler pattern (src/lib/meditation.ts) — deterministic and unit-tested;
 * the fade + suspend wiring lives in src/audio/noise-engine.ts and the pump
 * loop in src/components/NoisePlayer.tsx.
 */

/** No auto-stop. */
export const SLEEP_TIMER_OFF = 0;

/** Quick-pick durations in minutes (0 = off). */
export const SLEEP_TIMER_PRESETS: readonly { minutes: number; label: string }[] = [
  { minutes: SLEEP_TIMER_OFF, label: "Off" },
  { minutes: 5, label: "5 min" },
  { minutes: 10, label: "10 min" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 45, label: "45 min" },
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
];

export const MIN_SLEEP_MINUTES = 1;
/** 10 hours — a generous ceiling for an overnight custom value. */
export const MAX_SLEEP_MINUTES = 600;

/**
 * Seconds to fade the mix down before the hard stop. A few seconds is gentle
 * enough for falling asleep without dragging the silence out.
 */
export const SLEEP_FADE_SEC = 8;

/**
 * Normalize a chosen duration. Non-positive values (and NaN) mean "off";
 * anything else is rounded to whole minutes and clamped to the legal range so
 * a stray custom entry never arms a zero-length or absurd timer.
 */
export function clampSleepMinutes(minutes: number): number {
  if (Number.isNaN(minutes) || minutes <= 0) return SLEEP_TIMER_OFF;
  return Math.min(MAX_SLEEP_MINUTES, Math.max(MIN_SLEEP_MINUTES, Math.round(minutes)));
}

/** True when a duration corresponds to one of the quick-pick presets. */
export function isSleepPreset(minutes: number): boolean {
  return SLEEP_TIMER_PRESETS.some((preset) => preset.minutes === minutes);
}

export interface SleepTimer {
  /** Audio-clock second the timer was armed. */
  startSec: number;
  /** Audio-clock second the fade-out begins. */
  fadeStartSec: number;
  /** Audio-clock second the fade completes and playback stops. */
  endSec: number;
}

/**
 * Arm a timer at `nowSec` for `durationMin`, fading over `fadeSec` before the
 * stop. The duration is clamped to at least one minute; the fade is capped to
 * half the duration so even a short timer plays audibly before it fades.
 */
export function armSleepTimer(
  nowSec: number,
  durationMin: number,
  fadeSec: number = SLEEP_FADE_SEC,
): SleepTimer {
  const minutes = Math.min(
    MAX_SLEEP_MINUTES,
    Math.max(MIN_SLEEP_MINUTES, Math.round(durationMin)),
  );
  const durationSec = minutes * 60;
  const fade = Math.min(Math.max(0, fadeSec), durationSec / 2);
  const endSec = nowSec + durationSec;
  return { startSec: nowSec, fadeStartSec: endSec - fade, endSec };
}

/** Whole seconds remaining until the hard stop (never negative). */
export function sleepRemainingSec(timer: SleepTimer, nowSec: number): number {
  return Math.max(0, Math.ceil(timer.endSec - nowSec));
}

/** True while the fade-out should be in progress but the stop has not fired. */
export function isFading(timer: SleepTimer, nowSec: number): boolean {
  return nowSec >= timer.fadeStartSec && nowSec < timer.endSec;
}

/** True once the timer has fully elapsed and playback should stop. */
export function isElapsed(timer: SleepTimer, nowSec: number): boolean {
  return nowSec >= timer.endSec;
}

/**
 * Seconds of fade left from `nowSec` to the stop — the ramp duration to hand
 * the audio engine when the fade begins (clamped to a small floor so a late
 * pump tick still schedules a valid, click-free ramp).
 */
export function fadeRemainingSec(timer: SleepTimer, nowSec: number): number {
  return Math.max(0.01, timer.endSec - nowSec);
}

/** mm:ss, or h:mm:ss past an hour, for the countdown readout. */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const mm = hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
