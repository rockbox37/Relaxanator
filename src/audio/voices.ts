/**
 * Synthesized meditation voices. Each function schedules a one-shot sound at
 * `when` (audio-clock seconds) into `dest` and cleans itself up. Bell and
 * chime are additive struck tones; drone and omm are sustained swells.
 *
 * All voices are synthesized for now — recorded samples (and the planned
 * Manding-inspired deep tones) plug in as new registry entries later.
 */
import type { MeditationVoiceDef } from "@/lib/meditation";

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

/** Multi-tap feedback delay for long reverb tails (train horn). */
function feedbackReverb(
  ctx: BaseAudioContext,
  source: AudioNode,
  wet: GainNode,
): AudioNode[] {
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
    fb.gain.value = tap.feedback;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = tap.dampHz;
    damp.Q.value = 0.4;
    source.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
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

const doomBell: VoicePlayer = (ctx, dest, when, volume) => {
  // Church-bell voicing an octave-and-a-half below the bell: F2 fundamental
  // with hum (0.5), prime (1), tierce (1.2 — the minor third that gives big
  // bells their character), quint (1.5), and nominal (2.0), ringing ~16s.
  struck(ctx, dest, when, volume * 0.9, 87.31, [
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
  // (F2) while sharing the same bittersweet minor-third character.
  struck(ctx, dest, when, volume * 0.65, 261.63, [
    [1, 1],
    [1.2, 0.5],
    [2.0, 0.28],
    [2.76, 0.16],
    [5.4, 0.06],
  ], 8);
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

const fogHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Distant fog horn (#22): low B1 fundamental with strong quint/2nd body,
  // a short sustained blast, brighter lowpass than before, and higher output
  // so the tone reads on small speakers while staying deeper than ship/train.
  distantHorn(ctx, dest, when, volume, 61.74, [
    [1, 1],
    [1.5, 0.38],
    [2, 0.52],
    [3, 0.14],
  ], 18, 480, 0.08, 2.8, 0.88);
};

const fogHorn2: VoicePlayer = (ctx, dest, when, volume) => {
  // Higher fog horn (#26): B2 fundamental (octave above fog horn), slightly
  // sharper attack, brighter lowpass, and a touch more 2nd/3rd partial for
  // a distinct but still distant, long-decay fog-horn family tone.
  distantHorn(ctx, dest, when, volume, 123.47, [
    [1, 1],
    [1.5, 0.4],
    [2, 0.58],
    [3, 0.18],
  ], 17, 620, 0.05, 2.6, 0.88);
};

const fogHorn3: VoicePlayer = (ctx, dest, when, volume) => {
  // Two-tone fog signal (#26): 250 Hz blast, brief gap, ~198 Hz blast (major
  // third down), through heavy feedback-delay reverb — mid-range voicing
  // distinct from low B1/B2 fog horns 1/2.
  const attackSec = 0.07;
  const hold1Sec = 1.0;
  const hold2Sec = 1.5;
  const gapSec = 0.25;
  const decaySec = 18;
  const tone1F0 = 250;
  const tone2F0 = tone1F0 * 2 ** (-4 / 12);

  const tone1When = when;
  const tone2When = when + attackSec + hold1Sec + gapSec;
  const sequenceEnd = tone2When + attackSec + hold2Sec + decaySec + 0.1;

  const out = ctx.createGain();
  out.gain.value = volume * 0.62;
  out.connect(dest);

  const dry = ctx.createGain();
  dry.gain.value = 0.22;
  const wet = ctx.createGain();
  wet.gain.value = 0.78;

  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(dry);

  const reverbSend = ctx.createGain();
  reverbSend.gain.setValueAtTime(1, when);
  reverbSend.gain.setValueAtTime(1, tone2When + attackSec + hold2Sec);
  reverbSend.gain.exponentialRampToValueAtTime(0.0001, tone2When + attackSec + hold2Sec + 3);
  bus.connect(reverbSend);
  const reverbNodes = feedbackReverb(ctx, reverbSend, wet);
  wet.connect(out);
  dry.connect(out);

  const cleanupNodes: AudioNode[] = [out, dry, wet, bus, reverbSend, ...reverbNodes];

  distantHorn(ctx, bus, tone1When, 1, tone1F0, [
    [1, 1],
    [1.5, 0.44],
    [2, 0.5],
    [3, 0.12],
  ], decaySec, 920, attackSec, hold1Sec, 0.9);

  distantHorn(ctx, bus, tone2When, 1, tone2F0, [
    [1, 1],
    [1.5, 0.42],
    [2, 0.48],
    [3, 0.1],
  ], decaySec, 760, attackSec, hold2Sec, 0.9);

  const delayMs = Math.max(0, (sequenceEnd - ctx.currentTime) * 1000) + 5000;
  setTimeout(() => {
    for (const node of cleanupNodes) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }, delayMs);
};

const shipHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Ship's horn (#23): D2 fundamental with strong quint partials for a
  // brassy maritime blast; brightest lowpass and highest output of the horns
  // for audibility on small speakers while keeping a long decay.
  distantHorn(ctx, dest, when, volume, 73.42, [
    [1, 1],
    [1.5, 0.52],
    [2, 0.32],
    [3, 0.12],
  ], 16, 820, 0.05, 2.5, 1.12);
};

const shipHorn2: VoicePlayer = (ctx, dest, when, volume) => {
  // Higher ship's horn (#26): D3 fundamental (octave above ship horn), sharper
  // attack, brighter lowpass, and slightly stronger quint/2nd partials for a
  // distinct but still brassy maritime blast with long decay.
  distantHorn(ctx, dest, when, volume, 146.84, [
    [1, 1],
    [1.5, 0.55],
    [2, 0.36],
    [3, 0.14],
  ], 16, 1000, 0.035, 2.4, 1.1);
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
        setTimeout(() => {
          for (const node of cleanupNodes) {
            try {
              node.disconnect();
            } catch {
              /* already disconnected */
            }
          }
        }, 5000);
      }
    };
  }
};

const PLAYERS: Record<MeditationVoiceDef["synth"], VoicePlayer> = {
  bell,
  doomBell,
  chime,
  drone,
  omm,
  fogHorn,
  fogHorn2,
  fogHorn3,
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
