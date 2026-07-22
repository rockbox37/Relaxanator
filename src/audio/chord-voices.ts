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

/**
 * Optional LFO-modulated chorus: the shared lowpass fans out to a dry path and
 * a delayed "wet" path whose delay time is swept by a sine LFO, summing back at
 * the master gain. Only presets that set `chorus` build these extra nodes.
 */
interface ChorusConfig {
  /** LFO sweep rate (Hz) — slow for a lush shimmer. */
  rateHz: number;
  /** Peak delay-time deviation (seconds) the LFO adds/subtracts. */
  depthSec: number;
  /** Base delay time (seconds) the LFO sweeps around. */
  delaySec: number;
  /** Wet mix (0..1); dry is `1 - mix`. */
  mix: number;
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
  /**
   * Optional overdrive amount. When > 0, notes pass through a WaveShaperNode
   * (soft-clip curve) before the lowpass, adding harmonic grit for the metal
   * timbre. Presets that omit it build the exact original additive graph.
   */
  drive?: number;
  /** Optional LFO-modulated chorus stage (see {@link ChorusConfig}). */
  chorus?: ChorusConfig;
}

function clampVol(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

/**
 * Build a symmetric soft-clip overdrive curve for a WaveShaperNode. `drive`
 * sets how hard the curve bends (0 = linear/no distortion, higher = grittier).
 * The classic `((1 + k) * x) / (1 + k * |x|)` transfer keeps the output bounded
 * to [-1, 1] while adding progressively stronger harmonics.
 */
function makeDriveCurve(drive: number, samples = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(
    new ArrayBuffer(samples * Float32Array.BYTES_PER_ELEMENT),
  );
  const k = Math.max(0, drive);
  for (let i = 0; i < samples; i += 1) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
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
  // Nylon guitar: warm, soft classical pluck — few partials, mellow lowpass.
  "nylon-guitar": {
    kind: "percussive",
    oscType: "triangle",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.35 },
      { ratio: 3, gain: 0.12 },
    ],
    attackSec: 0.006,
    decaySec: 1.6,
    releaseSec: 0,
    lowpassHz: 2200,
    scale: 0.3,
  },
  // Steel-string acoustic: brighter, ringing pluck with more upper partials.
  "steel-guitar": {
    kind: "percussive",
    oscType: "sawtooth",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.3 },
      { ratio: 4, gain: 0.16 },
      { ratio: 5, gain: 0.09 },
    ],
    attackSec: 0.003,
    decaySec: 2.0,
    releaseSec: 0,
    lowpassHz: 4600,
    scale: 0.2,
  },
  // Clean electric: quacky, mid-focused single-coil pluck.
  "clean-electric": {
    kind: "percussive",
    oscType: "sawtooth",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.4 },
      { ratio: 3, gain: 0.24 },
      { ratio: 4, gain: 0.1 },
    ],
    attackSec: 0.004,
    decaySec: 2.2,
    releaseSec: 0,
    lowpassHz: 3200,
    scale: 0.22,
  },
  // Jazz archtop: warm, rounded body (low lowpass, mellow partials) with an
  // LFO-modulated chorus shimmer.
  "jazz-guitar": {
    kind: "percussive",
    oscType: "triangle",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.3 },
      { ratio: 3, gain: 0.1 },
    ],
    attackSec: 0.006,
    decaySec: 2.4,
    releaseSec: 0,
    lowpassHz: 1900,
    scale: 0.26,
    chorus: { rateHz: 0.8, depthSec: 0.0025, delaySec: 0.02, mix: 0.4 },
  },
  // Metal: distorted electric — sawtooth + strong upper partials driven through
  // a waveshaper, a presence-shaped lowpass to tame fizz, and a long power-chord
  // ring.
  "metal-guitar": {
    kind: "percussive",
    oscType: "sawtooth",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.5 },
      { ratio: 3, gain: 0.35 },
      { ratio: 4, gain: 0.2 },
      { ratio: 5, gain: 0.12 },
    ],
    attackSec: 0.004,
    decaySec: 3.2,
    releaseSec: 0,
    lowpassHz: 2600,
    scale: 0.14,
    drive: 12,
  },
  // 12-string: octave-doubled, lightly detuned layers for a shimmering jangle.
  "twelve-string": {
    kind: "percussive",
    oscType: "sawtooth",
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 1, gain: 0.7, detuneCents: 8 },
      { ratio: 2, gain: 0.6 },
      { ratio: 2, gain: 0.5, detuneCents: -8 },
      { ratio: 3, gain: 0.2 },
    ],
    attackSec: 0.003,
    decaySec: 2.2,
    releaseSec: 0,
    lowpassHz: 4800,
    scale: 0.17,
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
 * chain — optional waveshaper drive → lowpass → optional LFO-modulated chorus →
 * master-gain (so the voice's volume is applied once) — schedules every note
 * event, and disconnects the whole chain (including any drive/chorus nodes and
 * the chorus LFO) after the final note oscillator ends.
 *
 * The teardown is still driven purely by the note oscillators: `remaining`
 * counts one per partial per note exactly as before, so presets that opt into
 * no extra stages get the identical original graph and teardown. The chorus LFO
 * is deliberately NOT counted — it is a free-running modulator that is stopped
 * and disconnected inside the teardown, so the graph fully releases with no
 * leaked nodes.
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

  // Extra effect nodes to disconnect on teardown, plus the optional chorus LFO.
  const extraNodes: AudioNode[] = [];
  let lfo: OscillatorNode | null = null;

  if (preset.chorus) {
    // lp fans out to a dry path and an LFO-swept delayed wet path, both
    // summing into out.
    const { rateHz, depthSec, delaySec, mix } = preset.chorus;
    const dry = ctx.createGain();
    dry.gain.value = 1 - mix;
    const wet = ctx.createGain();
    wet.gain.value = mix;
    const delay = ctx.createDelay();
    delay.delayTime.value = delaySec;

    lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rateHz;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = depthSec;
    lfo.connect(lfoDepth).connect(delay.delayTime);

    lp.connect(dry).connect(out);
    lp.connect(delay).connect(wet).connect(out);
    extraNodes.push(dry, wet, delay, lfoDepth);
  } else {
    lp.connect(out);
  }

  // Notes feed the optional waveshaper drive stage (metal) or the lowpass.
  let noteDest: AudioNode = lp;
  if (preset.drive && preset.drive > 0) {
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDriveCurve(preset.drive);
    shaper.oversample = "4x";
    shaper.connect(lp);
    extraNodes.push(shaper);
    noteDest = shaper;
  }

  let remaining = events.length * preset.partials.length;
  const teardown = () => {
    if (lfo) {
      try {
        lfo.stop();
      } catch {
        // Already stopped; ignore.
      }
      lfo.disconnect();
    }
    for (const node of extraNodes) node.disconnect();
    lp.disconnect();
    out.disconnect();
  };
  const onOscEnded = () => {
    remaining -= 1;
    if (remaining <= 0) teardown();
  };

  // Run the chorus LFO for the life of the voice; teardown stops/disconnects it.
  if (lfo) {
    const firstWhen = Math.min(...events.map((e) => e.whenSec));
    lfo.start(firstWhen);
  }

  for (const event of events) {
    scheduleNote(
      ctx,
      noteDest,
      preset,
      event.hz,
      event.whenSec,
      event.gain,
      event.holdSec,
      onOscEnded,
    );
  }
}
