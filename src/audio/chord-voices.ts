/**
 * Web Audio timbre synths for the chord section (#chords). One preset per id in
 * the CHORD_TIMBRES registry (src/lib/chords.ts). The pure layer decides *which
 * notes play when* (block vs arpeggiated, tempo) and hands us a list of
 * ChordNoteEvents; this module only decides *how each note sounds*.
 *
 * Each preset is additive: a few detuned partials through a shared lowpass,
 * with either a percussive attack→decay envelope (pianos, harpsichord, EPs) or
 * a pad attack→hold→release envelope (the airy synth pads). `volume` is the
 * user's per-voice volume (0..1); each preset applies its own headroom scalar
 * so the set sits at a comparable loudness over the noise bed.
 */
import type { ChordNoteEvent, ChordTimbreId } from "@/lib/chords";

type TimbreKind = "percussive" | "pad";

interface TimbrePartial {
  /** Frequency ratio relative to the note fundamental. */
  ratio: number;
  /** Relative amplitude of this partial. */
  gain: number;
  /** Detune in cents for gentle chorusing/warmth (optional). */
  detuneCents?: number;
}

interface TimbrePreset {
  kind: TimbreKind;
  oscType: OscillatorType;
  partials: TimbrePartial[];
  /** Attack time to peak (seconds). */
  attackSec: number;
  /** Percussive: exponential decay length. Ignored for pads. */
  decaySec: number;
  /** Pad: release length after the hold. Ignored for percussive. */
  releaseSec: number;
  lowpassHz: number;
  /** Headroom scalar so presets are loudness-matched. */
  scale: number;
}

function clampVol(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

const PRESETS: Record<ChordTimbreId, TimbrePreset> = {
  // Rhodes: sine fundamental + soft bell octave "tine", round attack.
  rhodes: {
    kind: "percussive",
    oscType: "sine",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.32 },
      { ratio: 4.01, gain: 0.08 },
    ],
    attackSec: 0.008,
    decaySec: 2.4,
    releaseSec: 0,
    lowpassHz: 3200,
    scale: 0.3,
  },
  // Wurlitzer: reedier, a touch of odd harmonic bark via triangle + fifth.
  wurlitzer: {
    kind: "percussive",
    oscType: "triangle",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 3, gain: 0.18 },
      { ratio: 5, gain: 0.08 },
    ],
    attackSec: 0.006,
    decaySec: 1.9,
    releaseSec: 0,
    lowpassHz: 3000,
    scale: 0.28,
  },
  // FM electric piano: bright bell edge (high inharmonic partial), quick bloom.
  "fm-piano": {
    kind: "percussive",
    oscType: "sine",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.28 },
      { ratio: 7, gain: 0.14 },
      { ratio: 14, gain: 0.05 },
    ],
    attackSec: 0.004,
    decaySec: 2.2,
    releaseSec: 0,
    lowpassHz: 4200,
    scale: 0.26,
  },
  // Harpsichord: bright plucked sawtooth, quick decay, octave doubling.
  harpsichord: {
    kind: "percussive",
    oscType: "sawtooth",
    partials: [
      { ratio: 1, gain: 0.8 },
      { ratio: 2, gain: 0.6 },
      { ratio: 3, gain: 0.22 },
    ],
    attackSec: 0.002,
    decaySec: 1.1,
    releaseSec: 0,
    lowpassHz: 5000,
    scale: 0.2,
  },
  // Grand piano: struck string with mild inharmonic partials, natural decay.
  "grand-piano": {
    kind: "percussive",
    oscType: "triangle",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2.003, gain: 0.4 },
      { ratio: 3.01, gain: 0.18 },
      { ratio: 4.02, gain: 0.08 },
    ],
    attackSec: 0.004,
    decaySec: 2.8,
    releaseSec: 0,
    lowpassHz: 3600,
    scale: 0.26,
  },
  // Bright piano: forward upright with extra top end and a crisper attack.
  "bright-piano": {
    kind: "percussive",
    oscType: "triangle",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2.003, gain: 0.5 },
      { ratio: 3.01, gain: 0.28 },
      { ratio: 5.04, gain: 0.12 },
    ],
    attackSec: 0.003,
    decaySec: 2.4,
    releaseSec: 0,
    lowpassHz: 5200,
    scale: 0.24,
  },
  // Glass pad: airy shimmer, detuned sine layers, slow swell + long release.
  "glass-pad": {
    kind: "pad",
    oscType: "sine",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 1, gain: 0.6, detuneCents: 7 },
      { ratio: 2, gain: 0.4 },
      { ratio: 3, gain: 0.14 },
    ],
    attackSec: 0.5,
    decaySec: 0,
    releaseSec: 2.6,
    lowpassHz: 4200,
    scale: 0.22,
  },
  // Warm pad: round triangle body, gentle detune, soft top.
  "warm-pad": {
    kind: "pad",
    oscType: "triangle",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 1, gain: 0.7, detuneCents: -6 },
      { ratio: 2, gain: 0.28 },
    ],
    attackSec: 0.7,
    decaySec: 0,
    releaseSec: 2.8,
    lowpassHz: 2400,
    scale: 0.26,
  },
  // Airy choir: breathy vowel-ish stack of sines, distant and soft.
  "air-choir": {
    kind: "pad",
    oscType: "sine",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.3 },
      { ratio: 4, gain: 0.16 },
      { ratio: 5, gain: 0.08 },
    ],
    attackSec: 0.9,
    decaySec: 0,
    releaseSec: 3.2,
    lowpassHz: 3000,
    scale: 0.22,
  },
  // Vapor pad: detuned dreamy wash, sawtooth softened hard by the lowpass.
  "vapor-pad": {
    kind: "pad",
    oscType: "sawtooth",
    partials: [
      { ratio: 1, gain: 0.9 },
      { ratio: 1, gain: 0.7, detuneCents: 10 },
      { ratio: 1, gain: 0.7, detuneCents: -10 },
      { ratio: 2, gain: 0.2 },
    ],
    attackSec: 1.0,
    decaySec: 0,
    releaseSec: 3.6,
    lowpassHz: 1800,
    scale: 0.18,
  },
  // Crystal synth: bright bell-synth with an airy octave sparkle, medium swell.
  "crystal-synth": {
    kind: "pad",
    oscType: "sine",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.5 },
      { ratio: 4, gain: 0.28 },
      { ratio: 8, gain: 0.1 },
    ],
    attackSec: 0.35,
    decaySec: 0,
    releaseSec: 2.4,
    lowpassHz: 6000,
    scale: 0.2,
  },
};

/* ------------------------------------------------------------------ *
 * Playback
 * ------------------------------------------------------------------ */

/**
 * Schedule one note (all of its partials) into `dest` starting at `when`. Uses
 * a percussive attack→exponential-decay envelope, or a pad
 * attack→hold→release envelope, per the preset. Calls `onDone` once the last
 * partial for the note has ended so the caller can tear the shared graph down.
 */
function scheduleNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  preset: TimbrePreset,
  hz: number,
  when: number,
  noteGain: number,
  holdSec: number,
  onOscEnded: () => void,
): void {
  for (const partial of preset.partials) {
    const osc = ctx.createOscillator();
    osc.type = preset.oscType;
    osc.frequency.value = hz * partial.ratio;
    if (partial.detuneCents) osc.detune.value = partial.detuneCents;

    const env = ctx.createGain();
    const peak = noteGain * partial.gain;

    let endSec: number;
    if (preset.kind === "pad") {
      const attackEnd = when + preset.attackSec;
      const holdEnd = attackEnd + Math.max(0, holdSec);
      endSec = holdEnd + preset.releaseSec;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(peak, attackEnd);
      env.gain.setValueAtTime(peak, holdEnd);
      env.gain.exponentialRampToValueAtTime(0.0001, endSec);
    } else {
      // Percussive: sharp attack then exponential decay. The decay length is
      // fixed by the timbre (its natural ring), independent of holdSec.
      endSec = when + preset.attackSec + preset.decaySec;
      env.gain.setValueAtTime(0, when);
      env.gain.linearRampToValueAtTime(peak, when + preset.attackSec);
      env.gain.exponentialRampToValueAtTime(0.0001, endSec);
    }

    osc.connect(env).connect(dest);
    osc.start(when);
    osc.stop(endSec + 0.05);
    osc.onended = onOscEnded;
  }
}

/**
 * Play a whole chord/progression play-plan through one timbre. Builds a shared
 * lowpass → master-gain chain (so the voice's volume is applied once), schedules
 * every note event, and disconnects the chain after the final oscillator ends.
 */
export function playChordVoice(
  timbreId: ChordTimbreId,
  ctx: BaseAudioContext,
  dest: AudioNode,
  events: ChordNoteEvent[],
  volume: number,
): void {
  if (events.length === 0) return;
  const preset = PRESETS[timbreId] ?? PRESETS.rhodes;

  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * preset.scale;
  out.connect(dest);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = preset.lowpassHz;
  lp.Q.value = 0.5;
  lp.connect(out);

  let remaining = events.length * preset.partials.length;
  const onOscEnded = () => {
    remaining -= 1;
    if (remaining <= 0) {
      lp.disconnect();
      out.disconnect();
    }
  };

  for (const event of events) {
    scheduleNote(
      ctx,
      lp,
      preset,
      event.hz,
      event.whenSec,
      event.gain,
      event.holdSec,
      onOscEnded,
    );
  }
}
