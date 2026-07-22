/**
 * Chord-sound model (#chords): the timbre picklist, the chord/progression
 * voice registry, small music-theory helpers, per-voice settings, and the
 * pure play-plan + lookahead-scheduling math.
 *
 * A "chord" voice plays one sustained chord; a "progression" voice plays a
 * short sequence of chords. Either can be voiced as a *block* (all notes at
 * once) or *arpeggiated* (spread out); a tempo (BPM) sets the arpeggio note
 * spacing and how long each chord in a progression is held. The timbre is
 * chosen per voice from CHORD_TIMBRES.
 *
 * As with meditation sounds, the Web Audio synthesis + pump loop live in
 * src/audio/ (chord-voices.ts / chords-engine.ts); everything here is
 * deterministic and unit-tested.
 */

/* ------------------------------------------------------------------ *
 * Timbres (the per-voice instrument picklist)
 * ------------------------------------------------------------------ */

export type ChordTimbreId =
  | "rhodes"
  | "wurlitzer"
  | "fm-piano"
  | "harpsichord"
  | "grand-piano"
  | "bright-piano"
  | "glass-pad"
  | "warm-pad"
  | "air-choir"
  | "vapor-pad"
  | "crystal-synth"
  | "nylon-guitar"
  | "steel-guitar"
  | "clean-electric"
  | "jazz-guitar"
  | "metal-guitar"
  | "twelve-string";

export type ChordTimbreCategory =
  | "electric-piano"
  | "harpsichord"
  | "piano"
  | "synth-pad"
  | "guitar";

export interface ChordTimbreDef {
  id: ChordTimbreId;
  label: string;
  description: string;
  /** Grouping for the picklist (rendered as <optgroup>s). */
  category: ChordTimbreCategory;
}

/**
 * The instrument picklist. Add one = an entry here plus a synth preset keyed
 * by the same id in src/audio/chord-voices.ts. Ordered by category so the UI
 * can group them.
 */
export const CHORD_TIMBRES: readonly ChordTimbreDef[] = [
  {
    id: "rhodes",
    label: "Electric piano — Rhodes",
    description: "Bell-like tine electric piano with a soft, round attack",
    category: "electric-piano",
  },
  {
    id: "wurlitzer",
    label: "Electric piano — Wurlitzer",
    description: "Reedy vintage electric piano with a gentle bark",
    category: "electric-piano",
  },
  {
    id: "fm-piano",
    label: "Electric piano — FM",
    description: "Glassy DX-style FM electric piano with a crisp bell edge",
    category: "electric-piano",
  },
  {
    id: "harpsichord",
    label: "Harpsichord",
    description: "Bright plucked baroque harpsichord with a quick decay",
    category: "harpsichord",
  },
  {
    id: "grand-piano",
    label: "Grand piano",
    description: "Warm struck-string acoustic grand with a natural decay",
    category: "piano",
  },
  {
    id: "bright-piano",
    label: "Bright piano",
    description: "Forward, sparkling upright piano with extra top end",
    category: "piano",
  },
  {
    id: "glass-pad",
    label: "Glass pad",
    description: "Airy, shimmering synth pad with a slow swell",
    category: "synth-pad",
  },
  {
    id: "warm-pad",
    label: "Warm pad",
    description: "Soft, round analog-style pad that blooms slowly",
    category: "synth-pad",
  },
  {
    id: "air-choir",
    label: "Airy choir",
    description: "Breathy vowel-like choir pad, distant and soft",
    category: "synth-pad",
  },
  {
    id: "vapor-pad",
    label: "Vapor pad",
    description: "Detuned, dreamy wash with a long, slow release",
    category: "synth-pad",
  },
  {
    id: "crystal-synth",
    label: "Crystal synth",
    description: "Bright bell-synth with an airy octave sparkle",
    category: "synth-pad",
  },
  {
    id: "nylon-guitar",
    label: "Guitar — Nylon (classical)",
    description: "Warm, soft-plucked nylon-string classical guitar",
    category: "guitar",
  },
  {
    id: "steel-guitar",
    label: "Guitar — Steel-string acoustic",
    description: "Bright, ringing steel-string acoustic pluck",
    category: "guitar",
  },
  {
    id: "clean-electric",
    label: "Guitar — Clean electric",
    description: "Quacky, mid-focused clean electric guitar",
    category: "guitar",
  },
  {
    id: "jazz-guitar",
    label: "Guitar — Jazz (archtop)",
    description: "Mellow, rounded archtop with a chorus shimmer",
    category: "guitar",
  },
  {
    id: "metal-guitar",
    label: "Guitar — Metal (distorted)",
    description: "Distorted electric with a ringing power-chord sustain",
    category: "guitar",
  },
  {
    id: "twelve-string",
    label: "Guitar — 12-string",
    description: "Shimmering octave-doubled, detuned 12-string jangle",
    category: "guitar",
  },
];

const CHORD_TIMBRE_IDS = new Set<ChordTimbreId>(CHORD_TIMBRES.map((t) => t.id));

export function isChordTimbreId(value: string): value is ChordTimbreId {
  return CHORD_TIMBRE_IDS.has(value as ChordTimbreId);
}

/* ------------------------------------------------------------------ *
 * Music-theory helpers
 * ------------------------------------------------------------------ */

/** Equal-tempered frequency (Hz) of a MIDI note number (A4 = 69 = 440 Hz). */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * A single chord: semitone offsets from the voice root plus how many beats it
 * is held. A single-chord voice has exactly one of these; a progression has
 * several played back to back.
 */
export interface Chord {
  /** Semitone offsets from the voice `rootMidi`, low to high. */
  intervals: number[];
  /** How long this chord sounds, in beats (at the voice tempo). */
  beats: number;
}

export type ChordVoiceKind = "chord" | "progression";
export type ChordMode = "block" | "arpeggiated";

export interface ChordVoiceDef {
  id: string;
  label: string;
  description: string;
  kind: ChordVoiceKind;
  /** MIDI note the chord/progression is built on. */
  rootMidi: number;
  /** One chord (single) or an ordered sequence (progression). */
  chords: Chord[];
  defaultTimbreId: ChordTimbreId;
  defaultMode: ChordMode;
  defaultTempoBpm: number;
  defaultIntervalMin: number;
  defaultVolume: number;
}

/* ------------------------------------------------------------------ *
 * Voice registry
 * ------------------------------------------------------------------ */

// Root anchors (MIDI). C4 = 60, A3 = 57, etc.
const C4 = 60;
const A3 = 57;
const D4 = 62;
const F3 = 53;
const G3 = 55;

/**
 * Extensible registry of chord + progression voices. Intervals are semitone
 * offsets from `rootMidi`. Progressions build every chord relative to the same
 * root so transposing the whole voice is a one-line change.
 */
export const CHORD_VOICES: readonly ChordVoiceDef[] = [
  // --- Single chords -------------------------------------------------
  {
    id: "c-major",
    label: "C major",
    description: "Bright, open major triad (C–E–G)",
    kind: "chord",
    rootMidi: C4,
    chords: [{ intervals: [0, 4, 7], beats: 4 }],
    defaultTimbreId: "rhodes",
    defaultMode: "block",
    defaultTempoBpm: 72,
    defaultIntervalMin: 2,
    defaultVolume: 0.5,
  },
  {
    id: "a-minor",
    label: "A minor",
    description: "Soft, wistful minor triad (A–C–E)",
    kind: "chord",
    rootMidi: A3,
    chords: [{ intervals: [0, 3, 7], beats: 4 }],
    defaultTimbreId: "warm-pad",
    defaultMode: "block",
    defaultTempoBpm: 72,
    defaultIntervalMin: 2,
    defaultVolume: 0.5,
  },
  {
    id: "cmaj7",
    label: "C major 7",
    description: "Dreamy, jazzy major-seventh chord (C–E–G–B)",
    kind: "chord",
    rootMidi: C4,
    chords: [{ intervals: [0, 4, 7, 11], beats: 4 }],
    defaultTimbreId: "fm-piano",
    defaultMode: "arpeggiated",
    defaultTempoBpm: 80,
    defaultIntervalMin: 2,
    defaultVolume: 0.5,
  },
  {
    id: "dm9",
    label: "D minor 9",
    description: "Lush, brooding minor-ninth voicing (D–F–A–C–E)",
    kind: "chord",
    rootMidi: D4,
    chords: [{ intervals: [0, 3, 7, 10, 14], beats: 4 }],
    defaultTimbreId: "glass-pad",
    defaultMode: "arpeggiated",
    defaultTempoBpm: 66,
    defaultIntervalMin: 2.5,
    defaultVolume: 0.45,
  },
  {
    id: "gsus2",
    label: "G sus2",
    description: "Airy, unresolved suspended chord (G–A–D)",
    kind: "chord",
    rootMidi: G3,
    chords: [{ intervals: [0, 2, 7], beats: 4 }],
    defaultTimbreId: "air-choir",
    defaultMode: "block",
    defaultTempoBpm: 60,
    defaultIntervalMin: 3,
    defaultVolume: 0.45,
  },
  {
    id: "fmaj9",
    label: "F major 9",
    description: "Warm, cinematic major-ninth spread (F–A–C–E–G)",
    kind: "chord",
    rootMidi: F3,
    chords: [{ intervals: [0, 4, 7, 11, 16], beats: 4 }],
    defaultTimbreId: "vapor-pad",
    defaultMode: "arpeggiated",
    defaultTempoBpm: 70,
    defaultIntervalMin: 2.5,
    defaultVolume: 0.45,
  },

  // --- Progressions --------------------------------------------------
  {
    id: "pop-I-V-vi-IV",
    label: "Pop (I–V–vi–IV)",
    description: "The classic four-chord pop loop in C (C–G–Am–F)",
    kind: "progression",
    rootMidi: C4,
    chords: [
      { intervals: [0, 4, 7], beats: 2 }, // C
      { intervals: [7, 11, 14], beats: 2 }, // G
      { intervals: [9, 12, 16], beats: 2 }, // Am
      { intervals: [5, 9, 12], beats: 2 }, // F
    ],
    defaultTimbreId: "rhodes",
    defaultMode: "block",
    defaultTempoBpm: 84,
    defaultIntervalMin: 3,
    defaultVolume: 0.5,
  },
  {
    id: "melancholy-vi-IV-I-V",
    label: "Melancholy (vi–IV–I–V)",
    description: "Bittersweet loop in C (Am–F–C–G)",
    kind: "progression",
    rootMidi: C4,
    chords: [
      { intervals: [9, 12, 16], beats: 2 }, // Am
      { intervals: [5, 9, 12], beats: 2 }, // F
      { intervals: [0, 4, 7], beats: 2 }, // C
      { intervals: [7, 11, 14], beats: 2 }, // G
    ],
    defaultTimbreId: "warm-pad",
    defaultMode: "block",
    defaultTempoBpm: 76,
    defaultIntervalMin: 3,
    defaultVolume: 0.5,
  },
  {
    id: "jazz-ii-V-I",
    label: "Jazz 2–5–1 (Dm7–G7–Cmaj7)",
    description: "Smooth jazz cadence in C (Dm7–G7–Cmaj7)",
    kind: "progression",
    rootMidi: C4,
    chords: [
      { intervals: [2, 5, 9, 12], beats: 2 }, // Dm7
      { intervals: [7, 11, 14, 17], beats: 2 }, // G7
      { intervals: [0, 4, 7, 11], beats: 4 }, // Cmaj7 (resolves, held)
    ],
    defaultTimbreId: "fm-piano",
    defaultMode: "arpeggiated",
    defaultTempoBpm: 96,
    defaultIntervalMin: 3,
    defaultVolume: 0.45,
  },
  {
    id: "lofi-turnaround",
    label: "Lo-fi turnaround (I–vi–ii–V)",
    description: "Mellow seventh-chord turnaround (Cmaj7–Am7–Dm7–G7)",
    kind: "progression",
    rootMidi: C4,
    chords: [
      { intervals: [0, 4, 7, 11], beats: 2 }, // Cmaj7
      { intervals: [9, 12, 16, 19], beats: 2 }, // Am7
      { intervals: [2, 5, 9, 12], beats: 2 }, // Dm7
      { intervals: [7, 11, 14, 17], beats: 2 }, // G7
    ],
    defaultTimbreId: "wurlitzer",
    defaultMode: "arpeggiated",
    defaultTempoBpm: 72,
    defaultIntervalMin: 3,
    defaultVolume: 0.45,
  },
  {
    id: "canon-in-d",
    label: "Canon in D (Pachelbel)",
    description: "The eight-chord Pachelbel sequence (D–A–Bm–F♯m–G–D–G–A)",
    kind: "progression",
    rootMidi: D4,
    chords: [
      { intervals: [0, 4, 7], beats: 2 }, // D
      { intervals: [7, 11, 14], beats: 2 }, // A
      { intervals: [9, 12, 16], beats: 2 }, // Bm
      { intervals: [4, 7, 11], beats: 2 }, // F#m
      { intervals: [5, 9, 12], beats: 2 }, // G
      { intervals: [0, 4, 7], beats: 2 }, // D
      { intervals: [5, 9, 12], beats: 2 }, // G
      { intervals: [7, 11, 14], beats: 2 }, // A
    ],
    defaultTimbreId: "grand-piano",
    defaultMode: "arpeggiated",
    defaultTempoBpm: 90,
    defaultIntervalMin: 4,
    defaultVolume: 0.45,
  },
];

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

export interface ChordVoiceSettings {
  enabled: boolean;
  /** Play the chord all at once (block) or spread out (arpeggiated). */
  mode: ChordMode;
  /** Tempo in beats per minute — sets arpeggio spacing + progression pace. */
  tempoBpm: number;
  /** Which instrument in CHORD_TIMBRES voices the notes. */
  timbreId: ChordTimbreId;
  /** How often the chord/progression repeats, in minutes. */
  intervalMin: number;
  volume: number;
}

export type ChordSettings = Record<string, ChordVoiceSettings>;

export const MIN_TEMPO_BPM = 30;
export const MAX_TEMPO_BPM = 240;
export const DEFAULT_TEMPO_BPM = 72;

export const CHORD_MIN_INTERVAL_MIN = 0.5;
export const CHORD_MAX_INTERVAL_MIN = 120;

/** Beats between successive notes when arpeggiating (an eighth note). */
export const ARP_STEP_BEATS = 0.5;

export function clampTempoBpm(bpm: number): number {
  if (Number.isNaN(bpm)) return DEFAULT_TEMPO_BPM;
  return Math.min(MAX_TEMPO_BPM, Math.max(MIN_TEMPO_BPM, bpm));
}

export function clampChordIntervalMin(intervalMin: number): number {
  if (Number.isNaN(intervalMin)) return CHORD_MIN_INTERVAL_MIN;
  return Math.min(
    CHORD_MAX_INTERVAL_MIN,
    Math.max(CHORD_MIN_INTERVAL_MIN, intervalMin),
  );
}

export function createDefaultChordSettings(): ChordSettings {
  const settings: ChordSettings = {};
  for (const voice of CHORD_VOICES) {
    settings[voice.id] = {
      // Enable just one voice by default so the section is audible but calm.
      enabled: voice.id === "c-major",
      mode: voice.defaultMode,
      tempoBpm: voice.defaultTempoBpm,
      timbreId: voice.defaultTimbreId,
      intervalMin: voice.defaultIntervalMin,
      volume: voice.defaultVolume,
    };
  }
  return settings;
}

/* ------------------------------------------------------------------ *
 * Play plan (pure): a voice + its settings -> timed note events
 * ------------------------------------------------------------------ */

export interface ChordNoteEvent {
  /** Frequency of this note (Hz). */
  hz: number;
  /** Audio-clock start time (seconds). */
  whenSec: number;
  /** Relative loudness of the note within the chord (0..1). */
  gain: number;
  /** How long the note should sustain before releasing (seconds). */
  holdSec: number;
}

/** Bass/root note sits a touch louder than the upper voices. */
export function noteGain(index: number): number {
  return index === 0 ? 1 : 0.8;
}

/**
 * Expand a voice into the exact note events to schedule, starting at
 * `startSec` on the audio clock. Block mode stacks each chord's notes at the
 * chord's start; arpeggiated mode spreads them by ARP_STEP_BEATS and sustains
 * each note through the rest of the chord. Pure and deterministic.
 */
export function buildChordPlan(
  voice: ChordVoiceDef,
  settings: ChordVoiceSettings,
  startSec: number,
): ChordNoteEvent[] {
  const beatSec = 60 / clampTempoBpm(settings.tempoBpm);
  const stepSec = ARP_STEP_BEATS * beatSec;
  const events: ChordNoteEvent[] = [];

  let cursor = startSec;
  for (const chord of voice.chords) {
    const chordDurSec = Math.max(beatSec, chord.beats * beatSec);
    chord.intervals.forEach((semitone, index) => {
      const hz = midiToHz(voice.rootMidi + semitone);
      const gain = noteGain(index);
      if (settings.mode === "arpeggiated") {
        const offsetSec = index * stepSec;
        events.push({
          hz,
          whenSec: cursor + offsetSec,
          gain,
          // Sustain to the end of the chord (at least one beat) so late arp
          // notes still ring rather than being clipped short.
          holdSec: Math.max(beatSec, chordDurSec - offsetSec),
        });
      } else {
        events.push({ hz, whenSec: cursor, gain, holdSec: chordDurSec });
      }
    });
    cursor += chordDurSec;
  }

  return events;
}

/**
 * Total wall-length of one play-through of a voice (seconds). Handy for the UI
 * and for keeping the repeat interval sensibly longer than the phrase.
 */
export function chordPlanDurationSec(
  voice: ChordVoiceDef,
  settings: ChordVoiceSettings,
): number {
  const beatSec = 60 / clampTempoBpm(settings.tempoBpm);
  let total = 0;
  for (const chord of voice.chords) {
    total += Math.max(beatSec, chord.beats * beatSec);
  }
  return total;
}

/* ------------------------------------------------------------------ *
 * Scheduling (pure): free-running interval lookahead, mirroring meditation
 * ------------------------------------------------------------------ */

/** Map of voiceId -> next scheduled fire time (audio-clock seconds). */
export type ChordFireSchedule = Record<string, number>;

/** Next fire time (audio-clock seconds) one full interval after `fromSec`. */
export function computeNextChordFire(
  fromSec: number,
  settings: ChordVoiceSettings,
): number {
  const intervalSec = clampChordIntervalMin(settings.intervalMin) * 60;
  return fromSec + Math.max(1, intervalSec);
}

/** Seed the schedule: each enabled voice waits one full interval from now. */
export function initChordSchedule(
  settings: ChordSettings,
  nowSec: number,
): ChordFireSchedule {
  const schedule: ChordFireSchedule = {};
  for (const [voiceId, voice] of Object.entries(settings)) {
    if (!voice.enabled) continue;
    schedule[voiceId] = computeNextChordFire(nowSec, voice);
  }
  return schedule;
}

export interface ChordDueEvent {
  voiceId: string;
  /** Exact audio-clock time the voice should begin playing. */
  whenSec: number;
}

/**
 * Collect voices due within [nowSec, nowSec + lookaheadSec) and return the
 * advanced schedule. Disabled voices are dropped; newly enabled voices are
 * seeded one interval out. After a long suspend (schedule stale in the past)
 * the voice fires once as a catch-up rather than burst-firing every missed
 * step — mirrors the meditation scheduler.
 */
export function collectDueChordEvents(
  schedule: ChordFireSchedule,
  settings: ChordSettings,
  nowSec: number,
  lookaheadSec: number,
): { events: ChordDueEvent[]; schedule: ChordFireSchedule } {
  const events: ChordDueEvent[] = [];
  const next: ChordFireSchedule = {};

  for (const [voiceId, voice] of Object.entries(settings)) {
    if (!voice.enabled) continue;

    let fireAt = schedule[voiceId] ?? computeNextChordFire(nowSec, voice);
    if (fireAt < nowSec) {
      events.push({ voiceId, whenSec: nowSec });
      fireAt = computeNextChordFire(nowSec, voice);
      while (fireAt < nowSec + lookaheadSec) {
        fireAt = computeNextChordFire(fireAt, voice);
      }
    } else {
      while (fireAt < nowSec + lookaheadSec) {
        events.push({ voiceId, whenSec: fireAt });
        fireAt = computeNextChordFire(fireAt, voice);
      }
    }
    next[voiceId] = fireAt;
  }

  return { events, schedule: next };
}
