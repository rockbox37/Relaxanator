/**
 * Web Audio synths for the notification cues (#95). One player per id in the
 * src/lib/cue-sounds.ts registry. Each schedules a short one-shot into `dest`
 * and disconnects itself. `volume` is the user cue volume (0..1); each player
 * applies its own headroom scalar so the set sits at a comparable loudness.
 */
import type { CueSoundId } from "@/lib/cue-sounds";

type CueSoundPlayer = (
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
) => void;

function clampVol(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

/** Soft ascending two-tone chime: C5 → E5 (the original break cue). */
const chime: CueSoundPlayer = (ctx, dest, when, volume) => {
  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * 0.45;
  out.connect(dest);

  const tones: Array<[hz: number, delay: number, gain: number]> = [
    [523.25, 0, 1],
    [659.25, 0.12, 0.75],
  ];

  let remaining = tones.length;
  for (const [hz, delay, gain] of tones) {
    const start = when + delay;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);

    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + 1);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }
};

/** Warm wooden mallet: fundamental + soft octave, fast rounded decay. */
const marimba: CueSoundPlayer = (ctx, dest, when, volume) => {
  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * 0.7;
  out.connect(dest);

  const f0 = 523.25; // C5
  const partials: Array<[ratio: number, gain: number, decay: number]> = [
    [1, 1, 0.55],
    [2, 0.35, 0.4],
    [4.2, 0.12, 0.22],
  ];

  let remaining = partials.length;
  for (const [ratio, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f0 * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(env).connect(out);
    osc.start(when);
    osc.stop(when + decay + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }
};

/** Single bright struck bell with an inharmonic shimmer and long ring. */
const bellDing: CueSoundPlayer = (ctx, dest, when, volume) => {
  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * 0.42;
  out.connect(dest);

  const f0 = 880; // A5
  const partials: Array<[ratio: number, gain: number]> = [
    [1, 1],
    [2.76, 0.4],
    [5.4, 0.16],
    [8.9, 0.07],
  ];
  const decay = 2.4;

  let remaining = partials.length;
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f0 * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(env).connect(out);
    osc.start(when);
    osc.stop(when + decay + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }
};

/** Light crystalline ping: high fundamental + brief sparkle overtone. */
const glassTap: CueSoundPlayer = (ctx, dest, when, volume) => {
  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * 0.4;
  out.connect(dest);

  const partials: Array<[hz: number, gain: number, decay: number]> = [
    [1174.66, 1, 0.6], // D6
    [2349.32, 0.3, 0.35], // D7 sparkle
  ];

  let remaining = partials.length;
  for (const [hz, gain, decay] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(env).connect(out);
    osc.start(when);
    osc.stop(when + decay + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }
};

/** Three ascending notes: C5 → E5 → G5, each a short rounded ping. */
const risingTriad: CueSoundPlayer = (ctx, dest, when, volume) => {
  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * 0.5;
  out.connect(dest);

  const notes: Array<[hz: number, step: number]> = [
    [523.25, 0],
    [659.25, 1],
    [783.99, 2],
  ];
  const gap = 0.11;
  const decay = 0.5;

  let remaining = notes.length;
  for (const [hz, step] of notes) {
    const start = when + step * gap;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(0.9, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(env).connect(out);
    osc.start(start);
    osc.stop(start + decay + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }
};

/** Mellow plucked-string note: soft attack, lowpass-warmed medium decay. */
const softPluck: CueSoundPlayer = (ctx, dest, when, volume) => {
  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * 0.6;
  out.connect(dest);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  lp.Q.value = 0.6;
  lp.connect(out);

  const f0 = 440; // A4
  const partials: Array<[ratio: number, gain: number]> = [
    [1, 1],
    [2, 0.5],
    [3, 0.22],
  ];
  const decay = 0.8;

  let remaining = partials.length;
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = f0 * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(env).connect(lp);
    osc.start(when);
    osc.stop(when + decay + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        lp.disconnect();
        out.disconnect();
      }
    };
  }
};

/**
 * Gentle sustained chord/pad (#98): each note swells in and fades out through
 * a shared lowpass for warmth. Soft attack + long release = a calm, new-age
 * feel rather than a sharp transient.
 */
function softChord(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
  notes: Array<[hz: number, gain: number]>,
  opts: {
    attackSec: number;
    holdSec: number;
    releaseSec: number;
    lowpassHz: number;
    scale: number;
    oscType?: OscillatorType;
  },
): void {
  const { attackSec, holdSec, releaseSec, lowpassHz, scale, oscType = "sine" } =
    opts;
  const endSec = when + attackSec + holdSec + releaseSec;

  const out = ctx.createGain();
  out.gain.value = clampVol(volume) * scale;
  out.connect(dest);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = lowpassHz;
  lp.Q.value = 0.5;
  lp.connect(out);

  let remaining = notes.length;
  for (const [hz, gain] of notes) {
    const osc = ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.value = hz;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + attackSec);
    env.gain.setValueAtTime(gain, when + attackSec + holdSec);
    env.gain.exponentialRampToValueAtTime(0.0001, endSec);
    osc.connect(env).connect(lp);
    osc.start(when);
    osc.stop(endSec + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        lp.disconnect();
        out.disconnect();
      }
    };
  }
}

/** Soft major-add9 pad (C–E–G–D) that swells in and fades. */
const warmChord: CueSoundPlayer = (ctx, dest, when, volume) => {
  softChord(
    ctx,
    dest,
    when,
    volume,
    [
      [261.63, 1], // C4
      [329.63, 0.85], // E4
      [392.0, 0.85], // G4
      [587.33, 0.6], // D5 (the add9 shimmer)
    ],
    { attackSec: 0.08, holdSec: 0.5, releaseSec: 1.6, lowpassHz: 2200, scale: 0.32 },
  );
};

/** Gentle major triad with an airy octave shimmer on top. */
const crystal: CueSoundPlayer = (ctx, dest, when, volume) => {
  softChord(
    ctx,
    dest,
    when,
    volume,
    [
      [523.25, 1], // C5
      [659.25, 0.7], // E5
      [783.99, 0.7], // G5
      [1046.5, 0.28], // C6 shimmer
    ],
    { attackSec: 0.05, holdSec: 0.4, releaseSec: 1.4, lowpassHz: 3600, scale: 0.3 },
  );
};

/** Singing-bowl tone: near-detuned fundamentals beat slowly under soft partials. */
const zenBowl: CueSoundPlayer = (ctx, dest, when, volume) => {
  const f0 = 432;
  softChord(
    ctx,
    dest,
    when,
    volume,
    [
      [f0, 1],
      [f0 * 1.0035, 0.6], // slight detune -> slow shimmer/beating
      [f0 * 2.76, 0.22], // inharmonic bowl partial
      [f0 * 5.4, 0.07],
    ],
    { attackSec: 0.03, holdSec: 0.15, releaseSec: 3.2, lowpassHz: 2600, scale: 0.36 },
  );
};

/** Airy open sus2 chord (C–D–G) with a soft triangle swell. */
const dream: CueSoundPlayer = (ctx, dest, when, volume) => {
  softChord(
    ctx,
    dest,
    when,
    volume,
    [
      [261.63, 1], // C4
      [293.66, 0.8], // D4
      [392.0, 0.85], // G4
      [523.25, 0.5], // C5
    ],
    {
      attackSec: 0.1,
      holdSec: 0.5,
      releaseSec: 1.8,
      lowpassHz: 2600,
      scale: 0.3,
      oscType: "triangle",
    },
  );
};

const CUE_SOUND_PLAYERS: Record<CueSoundId, CueSoundPlayer> = {
  chime,
  marimba,
  "bell-ding": bellDing,
  "glass-tap": glassTap,
  "rising-triad": risingTriad,
  "soft-pluck": softPluck,
  "warm-chord": warmChord,
  crystal,
  "zen-bowl": zenBowl,
  dream,
};

/** Play a cue by id, falling back to the chime for an unknown id. */
export function playCueSound(
  id: CueSoundId,
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
): void {
  const player = CUE_SOUND_PLAYERS[id] ?? chime;
  player(ctx, dest, when, volume);
}
