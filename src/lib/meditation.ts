/**
 * Meditation-sound model: voice registry, per-voice schedule settings, and
 * the pure lookahead-scheduling math. The Web Audio synthesis and pump loop
 * live in src/audio/; everything here is deterministic and unit-tested.
 */

export interface MeditationVoiceDef {
  id: string;
  label: string;
  description: string;
  /** Key into the synth implementations in src/audio/voices.ts. */
  synth: "bell" | "doomBell" | "chime" | "darkChime" | "drone" | "omm" | "fogHorn" | "fogHorn2" | "fogHorn3" | "fogHorn4" | "shipHorn" | "shipHorn2" | "trainHorn";
  defaultIntervalMin: number;
  defaultVolume: number;
  /**
   * Anchor this voice to the wall clock by default (#33). Omitted/false keeps
   * the original free-running default; only voices that opt in start clock-synced
   * in a fresh session. Persisted/customized settings are unaffected.
   */
  defaultSyncToClock?: boolean;
}

/**
 * Extensible registry — future voices (e.g. deep tones inspired by Manding
 * music from Mali and Guinea) are added here plus one synth (or sample)
 * implementation, with no scheduler changes.
 */
export const MEDITATION_VOICES: readonly MeditationVoiceDef[] = [
  {
    id: "bell",
    label: "Bell",
    description: "Struck meditation bell with slow decay",
    synth: "bell",
    defaultIntervalMin: 30,
    defaultVolume: 0.5,
    defaultSyncToClock: true,
  },
  {
    id: "doom-bell",
    label: "doom bell",
    description: "Church-bell strike at F3 with a minor-third shimmer and long decay",
    synth: "doomBell",
    defaultIntervalMin: 20,
    defaultVolume: 0.5,
  },
  {
    id: "chime",
    label: "Chime",
    description: "Low, ringing chime with a minor-third shimmer",
    synth: "chime",
    defaultIntervalMin: 7.5,
    defaultVolume: 0.4,
  },
  {
    id: "dark-chime",
    label: "Dark Chime",
    description: "Lower A3 chime with a darker minor-third shimmer",
    synth: "darkChime",
    defaultIntervalMin: 7.5,
    defaultVolume: 0.4,
  },
  {
    id: "drone",
    label: "Drone",
    description: "Low sustained drone swell",
    synth: "drone",
    defaultIntervalMin: 10,
    defaultVolume: 0.45,
  },
  {
    id: "omm",
    label: "Omm",
    description: "Deep vocal-like omm tone",
    synth: "omm",
    defaultIntervalMin: 5,
    defaultVolume: 0.45,
  },
  {
    id: "fog-horn",
    label: "fog horn",
    description: "Two-tone fog signal — B2 then lower E2 (1 s + 2 s blasts, perfect fifth) with heavy reverb",
    synth: "fogHorn",
    defaultIntervalMin: 25,
    defaultVolume: 0.45,
  },
  {
    id: "fog-horn-2",
    label: "fog horn 2",
    description: "Two-tone fog signal — D then lower G (1 s + 2 s blasts, perfect fifth) with heavy reverb",
    synth: "fogHorn2",
    defaultIntervalMin: 23,
    defaultVolume: 0.45,
  },
  {
    id: "fog-horn-3",
    label: "fog horn 3",
    description: "Two-tone fog signal — C3 then lower F2 (1 s + 2 s blasts, perfect fifth) with heavy reverb",
    synth: "fogHorn3",
    defaultIntervalMin: 28,
    defaultVolume: 0.45,
  },
  {
    id: "fog-horn-4",
    label: "fog horn 4",
    description: "Vintage film two-tone boat horn — C then lower F (0.85 s + 2.15 s blasts, perfect fifth) with vast reverb",
    synth: "fogHorn4",
    defaultIntervalMin: 26,
    defaultVolume: 0.45,
  },
  {
    id: "ship-horn",
    label: "ship's horn",
    description: "Brassy ship's horn — F2 maritime blast with sharp attack and long decay",
    synth: "shipHorn",
    defaultIntervalMin: 22,
    defaultVolume: 0.55,
  },
  {
    id: "ship-horn-2",
    label: "ship's horn 2",
    description: "Higher brassy ship's horn with sharp attack and massive reverb",
    synth: "shipHorn2",
    defaultIntervalMin: 20,
    defaultVolume: 0.55,
  },
  {
    id: "train-horn",
    label: "train horn",
    description: "Multi-chime freight train horn with sharp attack and vast reverb",
    synth: "trainHorn",
    defaultIntervalMin: 18,
    defaultVolume: 0.45,
  },
];

export interface VoiceSettings {
  enabled: boolean;
  intervalMin: number;
  /** Randomize each interval by up to ±15% so the rhythm feels organic. */
  jitter: boolean;
  /**
   * Anchor ringing to the wall clock (#33): fire at multiples of the interval
   * measured from the top of the local hour (e.g. a 5-min interval rings at
   * :00, :05, :10, …) instead of free-running from when playback started.
   * Jitter is ignored while this is on. Default false preserves the original
   * relative-interval behavior.
   */
  syncToClock: boolean;
  volume: number;
}

export type MeditationSettings = Record<string, VoiceSettings>;

export const MIN_INTERVAL_MIN = 0.5;
export const MAX_INTERVAL_MIN = 120;
export const JITTER_FRACTION = 0.15;

export function clampIntervalMin(intervalMin: number): number {
  if (Number.isNaN(intervalMin)) return MIN_INTERVAL_MIN;
  return Math.min(MAX_INTERVAL_MIN, Math.max(MIN_INTERVAL_MIN, intervalMin));
}

export function createDefaultMeditationSettings(): MeditationSettings {
  const settings: MeditationSettings = {};
  for (const voice of MEDITATION_VOICES) {
    settings[voice.id] = {
      enabled: voice.id === "bell",
      intervalMin: voice.defaultIntervalMin,
      jitter: false,
      syncToClock: voice.defaultSyncToClock ?? false,
      volume: voice.defaultVolume,
    };
  }
  return settings;
}

/**
 * Next fire time (seconds on the audio clock) for a voice that last fired —
 * or was enabled — at `fromSec`. Jitter draws from ±JITTER_FRACTION of the
 * interval using the injected rng.
 */
export function computeNextFire(
  fromSec: number,
  settings: VoiceSettings,
  rng: () => number = Math.random,
): number {
  const intervalSec = clampIntervalMin(settings.intervalMin) * 60;
  const jitterSec = settings.jitter
    ? (rng() * 2 - 1) * JITTER_FRACTION * intervalSec
    : 0;
  return fromSec + Math.max(1, intervalSec + jitterSec);
}

/**
 * Epoch-ms of the next clock-aligned fire strictly after `nowMs`, for a
 * sync-to-clock voice (#33). Fires land on multiples of the interval measured
 * from the top of the local hour: a 5-min interval → :00/:05/:10/…, a 15-min
 * interval → :00/:15/:30/:45.
 *
 * Anchoring is re-established at the top of every hour, so intervals that do
 * not evenly divide 60 min degrade gracefully: e.g. a 7-min interval fires at
 * :00/:07/…/:56 and then re-anchors to the next :00 (the final slot before the
 * hour is short) rather than drifting across hours. Uses local-time Date math
 * for the hour anchor so it stays correct across DST transitions.
 */
export function nextClockFireMs(nowMs: number, intervalMin: number): number {
  const intervalMs = clampIntervalMin(intervalMin) * 60_000;

  const hourStart = new Date(nowMs);
  hourStart.setMinutes(0, 0, 0);
  const hourStartMs = hourStart.getTime();

  // Top of the next local hour (DST-safe: adds a wall-clock hour, not 3.6e6ms).
  const nextHour = new Date(hourStartMs);
  nextHour.setHours(nextHour.getHours() + 1);
  const nextHourMs = nextHour.getTime();

  // Smallest multiple of the interval strictly after now, within this hour.
  const step = Math.floor((nowMs - hourStartMs) / intervalMs) + 1;
  const candidate = hourStartMs + step * intervalMs;

  // Re-anchor at the top of the hour when the interval overshoots it.
  return Math.min(candidate, nextHourMs);
}

/**
 * Next clock-aligned fire as an audio-clock time (seconds), given the current
 * audio clock `nowSec` and the wall clock `nowMs` that samples it. Mirrors the
 * wall-clock→audio-clock mapping in AnnounceEngine so scheduling stays
 * sample-accurate in throttled background tabs. `fromSec` is the audio-clock
 * instant to search after (now, or the time a voice just fired).
 */
export function computeNextClockFire(
  fromSec: number,
  nowSec: number,
  nowMs: number,
  intervalMin: number,
): number {
  const fromMs = nowMs + (fromSec - nowSec) * 1000;
  const boundaryMs = nextClockFireMs(fromMs, intervalMin);
  return nowSec + (boundaryMs - nowMs) / 1000;
}

/** Map of voiceId -> next scheduled fire time (audio-clock seconds). */
export type FireSchedule = Record<string, number>;

/**
 * Initial schedule: free-running voices wait one full interval from now;
 * sync-to-clock voices (#33) wait for the next wall-clock boundary. `nowMs`
 * samples the wall clock alongside the audio clock `nowSec` for the mapping.
 */
export function initFireSchedule(
  settings: MeditationSettings,
  nowSec: number,
  nowMs: number = Date.now(),
  rng: () => number = Math.random,
): FireSchedule {
  const schedule: FireSchedule = {};
  for (const [voiceId, voice] of Object.entries(settings)) {
    if (!voice.enabled) continue;
    schedule[voiceId] = voice.syncToClock
      ? computeNextClockFire(nowSec, nowSec, nowMs, voice.intervalMin)
      : computeNextFire(nowSec, voice, rng);
  }
  return schedule;
}

export interface DueEvent {
  voiceId: string;
  /** Exact audio-clock time the voice should start. */
  whenSec: number;
}

/**
 * Collect events due within [nowSec, nowSec + lookaheadSec) and return the
 * advanced schedule. Disabled voices are dropped; newly enabled voices are
 * seeded one interval out (free-running) or at the next wall-clock boundary
 * (sync-to-clock, #33). `nowMs` samples the wall clock alongside the audio
 * clock `nowSec`. Pure — the pump loop feeds it both clocks.
 */
export function collectDueEvents(
  schedule: FireSchedule,
  settings: MeditationSettings,
  nowSec: number,
  lookaheadSec: number,
  nowMs: number = Date.now(),
  rng: () => number = Math.random,
): { events: DueEvent[]; schedule: FireSchedule } {
  const events: DueEvent[] = [];
  const next: FireSchedule = {};

  for (const [voiceId, voice] of Object.entries(settings)) {
    if (!voice.enabled) continue;
    const nextFire = (fromSec: number): number =>
      voice.syncToClock
        ? computeNextClockFire(fromSec, nowSec, nowMs, voice.intervalMin)
        : computeNextFire(fromSec, voice, rng);

    let fireAt = schedule[voiceId] ?? nextFire(nowSec);
    if (fireAt < nowSec) {
      // A long suspend left the schedule stale. Ring once now as a catch-up,
      // then resume the cadence at the next fire beyond this lookahead window
      // rather than burst-firing every missed step. For a synced voice this
      // also skips a boundary that is imminent on resume (e.g. resuming 0.3s
      // before :05), so the catch-up ring and that boundary don't double up.
      events.push({ voiceId, whenSec: nowSec });
      fireAt = nextFire(nowSec);
      while (fireAt < nowSec + lookaheadSec) fireAt = nextFire(fireAt);
    } else {
      while (fireAt < nowSec + lookaheadSec) {
        events.push({ voiceId, whenSec: fireAt });
        fireAt = nextFire(fireAt);
      }
    }
    next[voiceId] = fireAt;
  }

  return { events, schedule: next };
}
