/**
 * Time-announcement model (#17): robot-voice registry, settings, wall-clock
 * boundary math, and the spoken-word vocabulary. Unlike the meditation
 * scheduler (relative intervals on the audio clock), announcements align to
 * wall-clock boundaries — enabling at 2:47 with an hourly interval speaks at
 * 3:00, never immediately. Pure and unit-tested; playback lives in
 * src/audio/announce-engine.ts.
 */

export type AnnounceVoiceEffect = "plain" | "hal";

export interface AnnounceVoiceDef {
  id: string;
  label: string;
  /** Directory under /audio/tts/ holding this voice's word sprites. */
  dir: string;
  /** Sample playback rate — below 1 deepens the voice. */
  playbackRate: number;
  /** Playback-time processing applied in announce-engine. */
  effect?: AnnounceVoiceEffect;
}

/** Robot voices; adding one = registry entry + a sprite set in public/. */
export const ANNOUNCE_VOICES: readonly AnnounceVoiceDef[] = [
  {
    id: "vocoder",
    label: "Vocoder (deep robot)",
    dir: "zarvox",
    playbackRate: 1.025, // 0.82 × 1.25 — 25% faster than pre-revert Zarvox rate
    effect: "plain",
  },
  {
    id: "speak-spell",
    label: "Speak & Spell",
    dir: "fred",
    playbackRate: 1,
    effect: "plain",
  },
  {
    id: "hal9000",
    label: "HAL 9000",
    dir: "hal",
    playbackRate: 0.88,
    effect: "hal",
  },
];

export const DEFAULT_ANNOUNCE_VOICE_ID = "vocoder";

/** Wall-clock-aligned interval choices, in minutes. */
export const ANNOUNCE_INTERVALS: readonly { minutes: number; label: string }[] = [
  { minutes: 15, label: "every quarter hour" },
  { minutes: 30, label: "every half hour" },
  { minutes: 60, label: "on the hour" },
  { minutes: 120, label: "every 2 hours" },
  { minutes: 180, label: "every 3 hours" },
];

export interface AnnounceSettings {
  enabled: boolean;
  intervalMin: number;
  voiceId: string;
  volume: number;
}

export function createDefaultAnnounceSettings(): AnnounceSettings {
  return {
    enabled: false,
    intervalMin: 60,
    voiceId: DEFAULT_ANNOUNCE_VOICE_ID,
    volume: 0.6,
  };
}

export function getAnnounceVoice(voiceId: string): AnnounceVoiceDef {
  return (
    ANNOUNCE_VOICES.find((v) => v.id === voiceId) ??
    (ANNOUNCE_VOICES.find((v) => v.id === DEFAULT_ANNOUNCE_VOICE_ID) as AnnounceVoiceDef)
  );
}

/**
 * Epoch ms of the next announcement boundary strictly after `nowMs`, in
 * local time. Sub-hour intervals land on minute marks divisible by the
 * interval (:00/:15/:30/:45…); multi-hour intervals land on hour marks
 * divisible by the hour count (from local midnight).
 */
export function nextBoundaryMs(nowMs: number, intervalMin: number): number {
  const candidate = new Date(nowMs);
  candidate.setSeconds(0, 0);

  if (intervalMin <= 60) {
    const step = Math.max(1, Math.floor(intervalMin));
    candidate.setMinutes(
      Math.floor(candidate.getMinutes() / step) * step,
    );
    while (candidate.getTime() <= nowMs) {
      candidate.setMinutes(candidate.getMinutes() + step);
    }
  } else {
    const stepHours = Math.max(1, Math.round(intervalMin / 60));
    candidate.setMinutes(0);
    candidate.setHours(
      Math.floor(candidate.getHours() / stepHours) * stepHours,
    );
    while (candidate.getTime() <= nowMs) {
      candidate.setHours(candidate.getHours() + stepHours);
    }
  }
  return candidate.getTime();
}

/** Hour words for 12-hour speech, indexed by `hour24 % 12` (0 -> "twelve"). */
const HOUR_WORDS = [
  "twelve", // hour 0
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
] as const;

/**
 * Hour words for 24-hour speech (#24), indexed by the literal 0–23 hour, so
 * 00:00 -> "zero", 15:00 -> "fifteen", 22:00 -> "twenty-two". Index 15 reuses
 * the "fifteen" minute sprite; the rest have their own sprites.
 */
const HOUR_WORDS_24 = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "twentyone",
  "twentytwo",
  "twentythree",
] as const;

const MINUTE_WORDS: Record<number, string> = {
  15: "fifteen",
  30: "thirty",
  45: "fortyfive",
};

const TOKEN_PHRASE: Record<string, string> = {
  its: "It's",
  oclock: "o'clock",
  fortyfive: "forty-five",
  twentyone: "twenty-one",
  twentytwo: "twenty-two",
  twentythree: "twenty-three",
};

export interface TimeTokenOptions {
  /**
   * Speak 12-hour hour words ("ten" for both 10:00 and 22:00) when true, or
   * 24-hour hour words ("twenty-two" for 22:00) when false. Defaults to true
   * to preserve the original #17 behavior for callers that omit it.
   */
  hour12?: boolean;
}

/**
 * Word-sprite ids that speak a time. In 12-hour mode (default) 10:00 ->
 * ["its", "ten", "oclock"] and 22:00 collapses to the same hour word; in
 * 24-hour mode (#24) 22:00 -> ["its", "twentytwo", "oclock"]. Boundaries only
 * land on quarter hours; any other minute rounds down to the nearest
 * supported word so a stray value degrades gracefully instead of going silent.
 */
export function timeTokens(
  hour24: number,
  minute: number,
  options: TimeTokenOptions = {},
): string[] {
  const { hour12 = true } = options;
  const hour = ((hour24 % 24) + 24) % 24;
  const hourWord = hour12 ? HOUR_WORDS[hour % 12] : HOUR_WORDS_24[hour];
  const quarter = Math.floor(minute / 15) * 15;
  if (quarter === 0) return ["its", hourWord, "oclock"];
  return ["its", hourWord, MINUTE_WORDS[quarter]];
}

/** Human-readable phrase for a spoken time (e.g. "It's ten o'clock"). */
export function formatAnnouncement(
  hour24: number,
  minute: number,
  options: TimeTokenOptions = {},
): string {
  return timeTokens(hour24, minute, options)
    .map((token) => TOKEN_PHRASE[token] ?? token)
    .join(" ");
}

/** On-the-hour announcement phrase from a Date (local time). */
export function formatHourAnnouncement(
  date: Date,
  options: TimeTokenOptions = {},
): string {
  return formatAnnouncement(date.getHours(), date.getMinutes(), options);
}

/**
 * True when the host's resolved locale formats time on a 24-hour clock,
 * following the OS preference where the platform exposes it. Reads
 * `Intl.DateTimeFormat`'s resolved `hour12` / `hourCycle`; falls back to
 * 12-hour when the environment reports neither (keeps the original phrasing).
 */
export function systemPrefers24Hour(): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
    }).resolvedOptions();
    if (typeof resolved.hour12 === "boolean") return !resolved.hour12;
    if (resolved.hourCycle) {
      return resolved.hourCycle === "h23" || resolved.hourCycle === "h24";
    }
  } catch {
    // Intl unavailable / throwing: fall through to the 12-hour default.
  }
  return false;
}

/** All word-sprite ids a voice needs preloaded (12- and 24-hour vocabulary). */
export const ANNOUNCE_WORDS: readonly string[] = [
  ...new Set<string>([
    "its",
    ...HOUR_WORDS,
    ...HOUR_WORDS_24,
    ...Object.values(MINUTE_WORDS),
    "oclock",
  ]),
];

/** Standard pause between spoken words (seconds). Used by announce-engine. */
export const WORD_GAP_SEC = 0.12;
/** Shorter pause after the "It's" prefix (50% of {@link WORD_GAP_SEC}). */
export const WORD_GAP_AFTER_ITS_SEC = 0.06;

/** Gap before the next word, given the token that just finished. */
export function wordGapAfterToken(token: string): number {
  return token === "its" ? WORD_GAP_AFTER_ITS_SEC : WORD_GAP_SEC;
}
