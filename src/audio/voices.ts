/**
 * Synthesized meditation voices. Each function schedules a one-shot sound at
 * `when` (audio-clock seconds) into `dest` and cleans itself up. Bell and
 * chime are additive struck tones; drone and omm are sustained swells.
 *
 * All voices are synthesized for now — recorded samples (and the planned
 * Manding-inspired deep tones) plug in as new registry entries later.
 */
import type { MeditationVoiceDef } from "@/lib/meditation";


/** Disconnect nodes after `when + graceSec` on the audio timeline (not wall clock). */
function scheduleAudioTimelineCleanup(
  ctx: BaseAudioContext,
  when: number,
  nodes: AudioNode[],
  graceSec: number,
): void {
  const end = when + graceSec;
  const tick = ctx.createOscillator();
  tick.frequency.value = 440;
  const silent = ctx.createGain();
  silent.gain.value = 0;
  tick.connect(silent).connect(ctx.destination);
  tick.start(end);
  tick.stop(end + 1 / ctx.sampleRate);
  tick.onended = () => {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    tick.disconnect();
    silent.disconnect();
  };
}

type VoicePlayer = (
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
) => void;

/** Distant low horn: struck partials through a lowpass with soft attack. */
function distantHorn(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
  f0: number,
  partials: Array<[ratio: number, gain: number]>,
  decaySec: number,
  lowpassHz: number,
  attackSec = 0.12,
  holdSec = 0,
  outputScale = 0.6,
): void {
  const out = ctx.createGain();
  out.gain.value = volume * outputScale;
  out.connect(dest);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = lowpassHz;
  lp.Q.value = 0.7;
  lp.connect(out);

  let remaining = partials.length;
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f0 * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + attackSec);
    if (holdSec > 0) {
      env.gain.setValueAtTime(gain, when + attackSec + holdSec);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, when + decaySec);
    osc.connect(env).connect(lp);
    osc.start(when);
    osc.stop(when + decaySec + 0.1);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        lp.disconnect();
        out.disconnect();
      }
    };
  }
}

interface FeedbackReverbOptions {
  /** Multiplier applied to each tap's dampHz (default 1). */
  dampScale?: number;
  /** Route wet taps through the per-tap damp filter instead of raw delay out. */
  wetFromDamp?: boolean;
}

/** Multi-tap feedback delay for long reverb tails (train / ship horns). */
function feedbackReverb(
  ctx: BaseAudioContext,
  source: AudioNode,
  wet: GainNode,
  feedbackBoost = 0,
  options: FeedbackReverbOptions = {},
): AudioNode[] {
  const dampScale = options.dampScale ?? 1;
  const wetFromDamp = options.wetFromDamp ?? false;
  const nodes: AudioNode[] = [];
  const taps = [
    { delaySec: 0.067, feedback: 0.78, dampHz: 3400 },
    { delaySec: 0.089, feedback: 0.74, dampHz: 3000 },
    { delaySec: 0.113, feedback: 0.71, dampHz: 2600 },
    { delaySec: 0.149, feedback: 0.68, dampHz: 2200 },
    { delaySec: 0.197, feedback: 0.64, dampHz: 1800 },
  ];
  for (const tap of taps) {
    const delay = ctx.createDelay(3);
    delay.delayTime.value = tap.delaySec;
    const fb = ctx.createGain();
    fb.gain.value = Math.min(0.92, tap.feedback + feedbackBoost);
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = tap.dampHz * dampScale;
    damp.Q.value = 0.4;
    source.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    (wetFromDamp ? damp : delay).connect(wet);
    nodes.push(delay, fb, damp);
  }
  return nodes;
}

/** Additive struck tone: enharmonic partials with exponential decay. */
function struck(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
  f0: number,
  partials: Array<[ratio: number, gain: number]>,
  decaySec: number,
): void {
  const out = ctx.createGain();
  out.gain.value = volume;
  out.connect(dest);

  let remaining = partials.length;
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f0 * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, when + decaySec);
    osc.connect(env).connect(out);
    osc.start(when);
    osc.stop(when + decaySec + 0.1);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) out.disconnect();
    };
  }
}

/** Sustained tone with attack/release envelope around a hold. */
function swellEnvelope(
  ctx: BaseAudioContext,
  when: number,
  peak: number,
  attackSec: number,
  holdSec: number,
  releaseSec: number,
): GainNode {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(peak, when + attackSec);
  env.gain.setValueAtTime(peak, when + attackSec + holdSec);
  env.gain.linearRampToValueAtTime(0, when + attackSec + holdSec + releaseSec);
  return env;
}

const bell: VoicePlayer = (ctx, dest, when, volume) => {
  // Deep temple-bell voicing (#14): low C3-ish fundamental, strong low
  // partials, soft shimmer on top, and a longer decay to match the pitch.
  struck(ctx, dest, when, volume * 0.85, 130.81, [
    [1, 1],
    [2.0, 0.55],
    [2.76, 0.32],
    [5.4, 0.16],
    [8.93, 0.07],
  ], 9.5);
};

/** F3 — doom bell fundamental (#65); one octave above prior F2. */
export const DOOM_BELL_FUNDAMENTAL_HZ = 174.61;

const doomBell: VoicePlayer = (ctx, dest, when, volume) => {
  // Church-bell voicing raised one octave (#65): F3 fundamental
  // with hum (0.5), prime (1), tierce (1.2 — the minor third that gives big
  // bells their character), quint (1.5), and nominal (2.0), ringing ~16s.
  struck(ctx, dest, when, volume * 0.9, DOOM_BELL_FUNDAMENTAL_HZ, [
    [0.5, 0.5],
    [1, 1],
    [1.2, 0.55],
    [1.5, 0.28],
    [2.0, 0.22],
    [2.67, 0.08],
  ], 16);
};

const chime: VoicePlayer = (ctx, dest, when, volume) => {
  // Re-voiced much lower with a minor-third tierce and longer ring (#18):
  // C4 fundamental keeps it a lighter strike than Bell (C3) and doom bell
  // (F3) while sharing the same bittersweet minor-third character.
  struck(ctx, dest, when, volume * 0.65, 261.63, [
    [1, 1],
    [1.2, 0.5],
    [2.0, 0.28],
    [2.76, 0.16],
    [5.4, 0.06],
  ], 8);
};

/** A3 — Dark Chime fundamental (#66); 3 semitones below Chime C4. */
export const DARK_CHIME_FUNDAMENTAL_HZ = 220.0;

const darkChime: VoicePlayer = (ctx, dest, when, volume) => {
  // Darker sibling of Chime (#66 LockedDecision): A3 fundamental (3 st below
  // C4), soft hum + stronger minor-third tierce, quieter high shimmer, ~9 s.
  struck(ctx, dest, when, volume * 0.65, DARK_CHIME_FUNDAMENTAL_HZ, [
    [0.5, 0.28],
    [1, 1],
    [1.2, 0.62],
    [2.0, 0.22],
    [2.76, 0.12],
    [5.4, 0.04],
  ], 9);
};

const drone: VoicePlayer = (ctx, dest, when, volume) => {
  const attack = 2.5;
  const hold = 8;
  const release = 3.5;
  const env = swellEnvelope(ctx, when, volume * 0.5, attack, hold, release);
  env.connect(dest);

  const stopAt = when + attack + hold + release + 0.1;
  const oscs = [110, 110.7, 55].map((frequency, i) => {
    const osc = ctx.createOscillator();
    osc.type = i === 2 ? "sawtooth" : "sine";
    osc.frequency.value = frequency;
    return osc;
  });
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 320;
  for (const osc of oscs) {
    osc.connect(lowpass);
    osc.start(when);
    osc.stop(stopAt);
  }
  lowpass.connect(env);
  oscs[0].onended = () => env.disconnect();
};

const omm: VoicePlayer = (ctx, dest, when, volume) => {
  const attack = 1.5;
  const hold = 4.5;
  const release = 2;
  const env = swellEnvelope(ctx, when, volume * 0.55, attack, hold, release);
  env.connect(dest);

  const stopAt = when + attack + hold + release + 0.1;
  const fundamental = ctx.createOscillator();
  fundamental.type = "sine";
  fundamental.frequency.value = 110;

  const formantSource = ctx.createOscillator();
  formantSource.type = "sawtooth";
  formantSource.frequency.value = 110;
  const formant = ctx.createBiquadFilter();
  formant.type = "bandpass";
  formant.frequency.value = 300;
  formant.Q.value = 4;
  const formantGain = ctx.createGain();
  formantGain.gain.value = 0.35;

  fundamental.connect(env);
  formantSource.connect(formant).connect(formantGain).connect(env);
  fundamental.start(when);
  formantSource.start(when);
  fundamental.stop(stopAt);
  formantSource.stop(stopAt);
  fundamental.onended = () => env.disconnect();
};

/** B2 — fog horn 1 first blast (1 s). */
export const FOG_HORN_1_TONE1_HZ = 123.47;
/** E2 — fog horn 1 second blast (2 s); perfect fifth (7 semitones) below tone 1. */
export const FOG_HORN_1_TONE2_HZ = 82.41;
export const FOG_HORN_1_INTERVAL_SEMITONES = 7;

const fogHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Two-tone fog signal (#54 / #58): B2 (1 s) then E2 (2 s), hard-gated sequential
  // blasts — perfect fifth down (7 semitones), one octave above prior B1→E1.
  gatedTwoBlastHorn(
    ctx,
    dest,
    when,
    volume,
    FOG_HORN_1_TONE1_HZ,
    FOG_HORN_1_TONE2_HZ,
    480,
    420,
  );
};

/** Hard-gated horn blast: fixed duration, no decay tail (fog horns 1–4). */
function gatedHornBlast(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
  f0: number,
  partials: Array<[ratio: number, gain: number]>,
  durationSec: number,
  lowpassHz: number,
  attackSec: number,
  outputScale: number,
  oscType: OscillatorType = "sine",
): void {
  const stopAt = when + durationSec;
  const out = ctx.createGain();
  out.gain.value = volume * outputScale;
  out.connect(dest);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = lowpassHz;
  lp.Q.value = 0.7;
  lp.connect(out);

  let remaining = partials.length;
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.value = f0 * ratio;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + attackSec);
    env.gain.setValueAtTime(gain, stopAt);
    env.gain.setValueAtTime(0, stopAt);
    osc.connect(env).connect(lp);
    osc.start(when);
    osc.stop(stopAt + 0.05);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        lp.disconnect();
        out.disconnect();
      }
    };
  }
}

interface GatedTwoBlastOptions {
  attackSec?: number;
  tone1DurSec?: number;
  tone2DurSec?: number;
  dryGain?: number;
  wetGain?: number;
  feedbackBoost?: number;
  reverbTailSec?: number;
  reverbSendFadeSec?: number;
  reverbDampScale?: number;
  reverbWetFromDamp?: boolean;
  wetHighCutHz?: number;
  outputScale?: number;
  oscType?: OscillatorType;
  tone1Partials?: Array<[ratio: number, gain: number]>;
  tone2Partials?: Array<[ratio: number, gain: number]>;
}

/** Two hard-gated sequential horn blasts with heavy feedback-delay reverb. */
function gatedTwoBlastHorn(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
  tone1F0: number,
  tone2F0: number,
  tone1LowpassHz: number,
  tone2LowpassHz: number,
  options: GatedTwoBlastOptions = {},
): void {
  const attackSec = options.attackSec ?? 0.07;
  const tone1DurSec = options.tone1DurSec ?? 1.0;
  const tone2DurSec = options.tone2DurSec ?? 2.0;
  const dryGain = options.dryGain ?? 0.22;
  const wetGain = options.wetGain ?? 0.78;
  const feedbackBoost = options.feedbackBoost ?? 0;
  const reverbTailSec = options.reverbTailSec ?? 18;
  const reverbSendFadeSec = options.reverbSendFadeSec ?? 3;
  const outputScale = options.outputScale ?? 0.62;
  const oscType = options.oscType ?? "sine";
  const tone1Partials = options.tone1Partials ?? [
    [1, 1],
    [1.5, 0.44],
    [2, 0.5],
    [3, 0.12],
  ];
  const tone2Partials = options.tone2Partials ?? [
    [1, 1],
    [1.5, 0.42],
    [2, 0.48],
    [3, 0.1],
  ];

  const tone1When = when;
  const tone2When = when + tone1DurSec;
  const sequenceEnd = tone2When + tone2DurSec + reverbTailSec + 0.1;

  const out = ctx.createGain();
  out.gain.value = volume * outputScale;
  out.connect(dest);

  const dry = ctx.createGain();
  dry.gain.value = dryGain;
  const wet = ctx.createGain();
  wet.gain.value = wetGain;

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(dry);

  const reverbSend = ctx.createGain();
  reverbSend.gain.setValueAtTime(1, when);
  reverbSend.gain.setValueAtTime(1, tone2When + tone2DurSec);
  reverbSend.gain.exponentialRampToValueAtTime(
    0.0001,
    tone2When + tone2DurSec + reverbSendFadeSec,
  );
  bus.connect(reverbSend);

  let wetOut: AudioNode = wet;
  const cleanupNodes: AudioNode[] = [out, dry, wet, bus, reverbSend];
  if (options.wetHighCutHz != null) {
    const wetCut = ctx.createBiquadFilter();
    wetCut.type = "lowpass";
    wetCut.frequency.value = options.wetHighCutHz;
    wetCut.Q.value = 0.5;
    wet.connect(wetCut);
    wetOut = wetCut;
    cleanupNodes.push(wetCut);
  }

  const reverbNodes = feedbackReverb(ctx, reverbSend, wet, feedbackBoost, {
    dampScale: options.reverbDampScale,
    wetFromDamp: options.reverbWetFromDamp,
  });
  wetOut.connect(out);
  dry.connect(out);
  cleanupNodes.push(...reverbNodes);

  gatedHornBlast(
    ctx,
    bus,
    tone1When,
    1,
    tone1F0,
    tone1Partials,
    tone1DurSec,
    tone1LowpassHz,
    attackSec,
    0.9,
    oscType,
  );

  gatedHornBlast(
    ctx,
    bus,
    tone2When,
    1,
    tone2F0,
    tone2Partials,
    tone2DurSec,
    tone2LowpassHz,
    attackSec,
    0.9,
    oscType,
  );

  scheduleAudioTimelineCleanup(ctx, when, cleanupNodes, sequenceEnd - when + 5);
}

/** D3 — fog horn 2 first blast (1 s). */
export const FOG_HORN_2_TONE1_HZ = 146.83;
/** G2 — fog horn 2 second blast (2 s); perfect fifth (7 semitones) below tone 1. */
export const FOG_HORN_2_TONE2_HZ = 98.0;
export const FOG_HORN_2_INTERVAL_SEMITONES = 7;

const fogHorn2: VoicePlayer = (ctx, dest, when, volume) => {
  // Two-tone fog signal (#54): D3 (1 s) then G2 (2 s), hard-gated sequential
  // blasts — perfect fifth down (7 semitones), aligned with fog horn 3.
  gatedTwoBlastHorn(
    ctx,
    dest,
    when,
    volume,
    FOG_HORN_2_TONE1_HZ,
    FOG_HORN_2_TONE2_HZ,
    560,
    480,
  );
};

/** C3 — fog horn 3 first blast (1 s). */
export const FOG_HORN_3_TONE1_HZ = 130.81;
/** F2 — fog horn 3 second blast (2 s); perfect fifth (7 semitones) below tone 1. */
export const FOG_HORN_3_TONE2_HZ = 87.31;
export const FOG_HORN_3_INTERVAL_SEMITONES = 7;

const fogHorn3: VoicePlayer = (ctx, dest, when, volume) => {
  // Two-tone fog signal (#50 / #58): C3 (1 s) then F2 (2 s), hard-gated sequential
  // blasts through heavy feedback-delay reverb — perfect fifth down (7
  // semitones), one octave above prior C2→F1; interval still canonical (#54).
  gatedTwoBlastHorn(
    ctx,
    dest,
    when,
    volume,
    FOG_HORN_3_TONE1_HZ,
    FOG_HORN_3_TONE2_HZ,
    480,
    420,
  );
};

/** C3 — fog horn 4 first blast (0.85 s); vintage film tugboat horn. */
export const FOG_HORN_4_TONE1_HZ = 130.81;
/** F2 — fog horn 4 second blast (2.15 s); perfect fifth (7 semitones) below tone 1. */
export const FOG_HORN_4_TONE2_HZ = 87.31;
export const FOG_HORN_4_INTERVAL_SEMITONES = 7;

const fogHorn4: VoicePlayer = (ctx, dest, when, volume) => {
  // Vintage two-tone boat horn (#54, ref 5KwjDwt5m3w): C3 short blast then
  // lower F2 long blast — perfect fifth down (7 semitones), aligned with fog
  // horn 3; classic 60s Cinesound tug/film character retained. Triangle
  // partials for warm vinyl; much wetter reverb than fog horns 2/3.
  gatedTwoBlastHorn(ctx, dest, when, volume, FOG_HORN_4_TONE1_HZ, FOG_HORN_4_TONE2_HZ, 480, 400, {
    attackSec: 0.05,
    tone1DurSec: 0.85,
    tone2DurSec: 2.15,
    dryGain: 0.08,
    wetGain: 0.92,
    feedbackBoost: 0.06,
    reverbTailSec: 24,
    reverbSendFadeSec: 1.2,
    reverbDampScale: 0.48,
    reverbWetFromDamp: true,
    wetHighCutHz: 720,
    outputScale: 0.6,
    oscType: "triangle",
    tone1Partials: [
      [1, 1],
      [1.5, 0.4],
      [2, 0.42],
      [3, 0.04],
    ],
    tone2Partials: [
      [1, 1],
      [1.5, 0.38],
      [2, 0.4],
      [3, 0.03],
    ],
  });
};

const shipHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Ship's horn (#23): F2 fundamental (~19% above prior D2) with quint-heavy
  // brass partials, sharper attack, and brighter lowpass for a clearer
  // maritime blast — still dry vs ship horn 2's massive reverb.
  distantHorn(ctx, dest, when, volume, 87.31, [
    [1, 1],
    [1.25, 0.24],
    [1.5, 0.58],
    [2, 0.4],
    [2.5, 0.12],
    [3, 0.14],
  ], 15, 980, 0.035, 2.4, 1.08);
};

const shipHorn2: VoicePlayer = (ctx, dest, when, volume) => {
  // Higher ship's horn (#26): D3 maritime blast with brassy quint-heavy partials,
  // very sharp attack, sustained body, and massive feedback-delay reverb — wetter
  // and longer-tailed than train horn while staying distinct from ship horn 1.
  const attackSec = 0.014;
  const holdSec = 1.76;
  const decaySec = 22;
  const reverbSendFadeSec = 5;
  const endSec = when + attackSec + holdSec + decaySec;
  const stopAt = endSec + 0.1;
  const f0 = 146.84; // D3

  const out = ctx.createGain();
  out.gain.value = volume * 0.64;
  out.connect(dest);

  const dry = ctx.createGain();
  dry.gain.value = 0.14;
  const wet = ctx.createGain();
  wet.gain.value = 0.86;

  const tone = ctx.createBiquadFilter();
  tone.type = "bandpass";
  tone.frequency.value = 340;
  tone.Q.value = 0.48;

  const bright = ctx.createBiquadFilter();
  bright.type = "highpass";
  bright.frequency.value = 88;
  bright.Q.value = 0.55;

  tone.connect(bright);
  bright.connect(dry);
  dry.connect(out);

  const reverbSend = ctx.createGain();
  reverbSend.gain.setValueAtTime(1, when);
  reverbSend.gain.setValueAtTime(1, when + attackSec + holdSec);
  reverbSend.gain.exponentialRampToValueAtTime(
    0.0001,
    when + attackSec + holdSec + reverbSendFadeSec,
  );
  bright.connect(reverbSend);
  const reverbNodes = feedbackReverb(ctx, reverbSend, wet, 0.08);
  wet.connect(out);

  const cleanupNodes: AudioNode[] = [out, dry, wet, tone, bright, reverbSend, ...reverbNodes];

  const partials: Array<[ratio: number, gain: number]> = [
    [1, 1],
    [1.25, 0.3],
    [1.5, 0.64],
    [2, 0.46],
    [2.5, 0.18],
    [3, 0.2],
  ];

  let remaining = partials.length;
  for (const [ratio, gain] of partials) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f0 * ratio;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(gain, when + attackSec);
    env.gain.setValueAtTime(gain, when + attackSec + holdSec);
    env.gain.exponentialRampToValueAtTime(0.0001, endSec);

    osc.connect(env).connect(tone);
    osc.start(when);
    osc.stop(stopAt);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        scheduleAudioTimelineCleanup(ctx, stopAt, cleanupNodes, 6);
      }
    };
  }
};

const trainHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Classic freight-train horn (#23): K5LA-style five-chime B-major-6th
  // cluster (311–622 Hz), sharp bright attack, sustained blast, and enormous
  // feedback-delay reverb — distinct from fog (low boomy) and ship (brassy D2).
  const attackSec = 0.004;
  const holdSec = 2.2;
  const decaySec = 18;
  const endSec = when + attackSec + holdSec + decaySec;
  const stopAt = endSec + 0.1;

  const out = ctx.createGain();
  out.gain.value = volume * 0.58;
  out.connect(dest);

  const dry = ctx.createGain();
  dry.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.68;

  const tone = ctx.createBiquadFilter();
  tone.type = "bandpass";
  tone.frequency.value = 520;
  tone.Q.value = 0.55;

  const bright = ctx.createBiquadFilter();
  bright.type = "highpass";
  bright.frequency.value = 220;
  bright.Q.value = 0.6;

  tone.connect(bright);
  bright.connect(dry);
  dry.connect(out);

  const reverbSend = ctx.createGain();
  reverbSend.gain.setValueAtTime(1, when);
  reverbSend.gain.setValueAtTime(1, when + attackSec + holdSec);
  reverbSend.gain.exponentialRampToValueAtTime(0.0001, when + attackSec + holdSec + 2.5);
  bright.connect(reverbSend);
  const reverbNodes = feedbackReverb(ctx, reverbSend, wet);
  wet.connect(out);

  const cleanupNodes: AudioNode[] = [out, dry, wet, tone, bright, reverbSend, ...reverbNodes];

  // Nathan K5LA American tuning: D♯3, F♯3, G♯3, B3, D♯4
  const chimes: Array<[hz: number, gain: number]> = [
    [311.13, 1],
    [369.99, 0.9],
    [415.3, 0.84],
    [493.88, 0.74],
    [622.25, 0.6],
  ];

  let remaining = chimes.length;
  for (const [hz, chimeGain] of chimes) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;

    const octave = ctx.createOscillator();
    octave.type = "sine";
    octave.frequency.value = hz * 2;
    const octaveGain = ctx.createGain();
    octaveGain.gain.value = 0.22;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(chimeGain, when + attackSec);
    env.gain.setValueAtTime(chimeGain, when + attackSec + holdSec);
    env.gain.exponentialRampToValueAtTime(0.0001, endSec);

    osc.connect(env);
    octave.connect(octaveGain).connect(env);
    env.connect(tone);
    osc.start(when);
    octave.start(when);
    osc.stop(stopAt);
    octave.stop(stopAt);
    osc.onended = () => {
      remaining -= 1;
      if (remaining === 0) {
        // Let feedback-delay tails finish before disconnecting.
        scheduleAudioTimelineCleanup(ctx, stopAt, cleanupNodes, 5);
      }
    };
  }
};

const PLAYERS: Record<MeditationVoiceDef["synth"], VoicePlayer> = {
  bell,
  doomBell,
  chime,
  darkChime,
  drone,
  omm,
  fogHorn,
  fogHorn2,
  fogHorn3,
  fogHorn4,
  shipHorn,
  shipHorn2,
  trainHorn,
};

export function playVoice(
  synth: MeditationVoiceDef["synth"],
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
): void {
  PLAYERS[synth](ctx, dest, when, volume);
}
