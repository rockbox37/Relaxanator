/**
 * Shared notification-cue registry (#95). Both break prompts and ToDo
 * reminders pick a cue from this list. Pure metadata + settings helpers live
 * here (unit-tested); the Web Audio synths keyed by `id` live in
 * src/audio/cue-sounds.ts — mirrors the meditation voice registry split.
 */

export type CueSoundId =
  | "chime"
  | "marimba"
  | "bell-ding"
  | "glass-tap"
  | "rising-triad"
  | "soft-pluck";

export interface CueSoundDef {
  id: CueSoundId;
  label: string;
  description: string;
}

/** Curated pleasant notification sounds. Add one = entry here + a synth. */
export const CUE_SOUNDS: readonly CueSoundDef[] = [
  {
    id: "chime",
    label: "Chime",
    description: "Soft ascending two-tone chime (C5 → E5)",
  },
  {
    id: "marimba",
    label: "Marimba",
    description: "Warm wooden mallet with a quick, rounded decay",
  },
  {
    id: "bell-ding",
    label: "Bell ding",
    description: "Single bright struck bell with a gentle shimmer",
  },
  {
    id: "glass-tap",
    label: "Glass tap",
    description: "Light, crystalline ping with a short sparkle",
  },
  {
    id: "rising-triad",
    label: "Rising triad",
    description: "Three ascending notes (C → E → G)",
  },
  {
    id: "soft-pluck",
    label: "Soft pluck",
    description: "Mellow plucked-string note with a soft attack",
  },
];

export const DEFAULT_BREAK_CUE_SOUND_ID: CueSoundId = "chime";
/** Different default so a ToDo reminder is audibly distinct from a break. */
export const DEFAULT_TODO_CUE_SOUND_ID: CueSoundId = "marimba";

export const DEFAULT_CUE_VOLUME = 0.55;

export function isCueSoundId(id: string): id is CueSoundId {
  return CUE_SOUNDS.some((s) => s.id === id);
}

/** Resolve a cue sound by id, falling back to the break default. */
export function getCueSound(id: string): CueSoundDef {
  return (
    CUE_SOUNDS.find((s) => s.id === id) ??
    (CUE_SOUNDS.find(
      (s) => s.id === DEFAULT_BREAK_CUE_SOUND_ID,
    ) as CueSoundDef)
  );
}

export function clampCueVolume(volume: number): number {
  if (Number.isNaN(volume)) return DEFAULT_CUE_VOLUME;
  return Math.min(1, Math.max(0, volume));
}

/** ToDo-reminder cue preferences (in-memory, like other app settings). */
export interface TodoCueSettings {
  /** Play a sound when a ToDo reminder comes due (only while audio runs). */
  enabled: boolean;
  soundId: CueSoundId;
  volume: number;
}

export function createDefaultTodoCueSettings(): TodoCueSettings {
  return {
    enabled: true,
    soundId: DEFAULT_TODO_CUE_SOUND_ID,
    volume: DEFAULT_CUE_VOLUME,
  };
}
