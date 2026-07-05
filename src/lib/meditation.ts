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
  synth: "bell" | "deepBell" | "chime" | "drone" | "omm" | "fogHorn" | "fogHorn2" | "fogHorn3" | "shipHorn" | "shipHorn2" | "trainHorn";
  defaultIntervalMin: number;
  defaultVolume: number;
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
    defaultIntervalMin: 15,
    defaultVolume: 0.5,
  },
  {
    id: "deep-bell",
    label: "Deep Bell",
    description: "Very low bell with a minor-third shimmer and long decay",
    synth: "deepBell",
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
    description: "Distant, deep fog horn with a long slow decay",
    synth: "fogHorn",
    defaultIntervalMin: 25,
    defaultVolume: 0.45,
  },
  {
    id: "fog-horn-2",
    label: "fog horn 2",
    description: "Higher fog horn with a sharper attack and long slow decay",
    synth: "fogHorn2",
    defaultIntervalMin: 23,
    defaultVolume: 0.45,
  },
  {
    id: "fog-horn-3",
    label: "fog horn 3",
    description: "Classic two-tone fog signal with heavy reverb",
    synth: "fogHorn3",
    defaultIntervalMin: 28,
    defaultVolume: 0.45,
  },
  {
    id: "ship-horn",
    label: "ship's horn",
    description: "Distant ship's horn with brassy low tones and long decay",
    synth: "shipHorn",
    defaultIntervalMin: 22,
    defaultVolume: 0.55,
  },
  {
    id: "ship-horn-2",
    label: "ship's horn 2",
    description: "Higher ship's horn with sharper attack and brassy maritime tone",
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
      jitter: true,
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

/** Map of voiceId -> next scheduled fire time (audio-clock seconds). */
export type FireSchedule = Record<string, number>;

/** Initial schedule: every enabled voice waits one full interval from now. */
export function initFireSchedule(
  settings: MeditationSettings,
  nowSec: number,
  rng: () => number = Math.random,
): FireSchedule {
  const schedule: FireSchedule = {};
  for (const [voiceId, voice] of Object.entries(settings)) {
    if (voice.enabled) schedule[voiceId] = computeNextFire(nowSec, voice, rng);
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
 * seeded one interval out. Pure — the pump loop feeds it the audio clock.
 */
export function collectDueEvents(
  schedule: FireSchedule,
  settings: MeditationSettings,
  nowSec: number,
  lookaheadSec: number,
  rng: () => number = Math.random,
): { events: DueEvent[]; schedule: FireSchedule } {
  const events: DueEvent[] = [];
  const next: FireSchedule = {};

  for (const [voiceId, voice] of Object.entries(settings)) {
    if (!voice.enabled) continue;
    let fireAt = schedule[voiceId];
    if (fireAt === undefined) {
      fireAt = computeNextFire(nowSec, voice, rng);
    }
    // A long suspend can leave fireAt far in the past; fire once, then
    // resume the normal cadence rather than burst-firing to catch up.
    while (fireAt < nowSec + lookaheadSec) {
      events.push({ voiceId, whenSec: Math.max(fireAt, nowSec) });
      fireAt = computeNextFire(Math.max(fireAt, nowSec), voice, rng);
    }
    next[voiceId] = fireAt;
  }

  return { events, schedule: next };
}
