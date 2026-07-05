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
): void {
  const out = ctx.createGain();
  out.gain.value = volume * 0.6;
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

const deepBell: VoicePlayer = (ctx, dest, when, volume) => {
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
  // C4 fundamental keeps it a lighter strike than Bell (C3) and Deep Bell
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
  // Distant fog horn (#22): very low B1 fundamental, simple boomy partials,
  // heavy lowpass and ~18 s decay so each blast fades slowly into the bed.
  distantHorn(ctx, dest, when, volume, 58.27, [
    [1, 1],
    [2, 0.22],
    [2.5, 0.08],
  ], 18, 340, 0.18);
};

const shipHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Ship's horn (#23): D2 fundamental with strong quint partials for a
  // brassy maritime blast; brighter lowpass than fog horn for distinction.
  distantHorn(ctx, dest, when, volume, 73.42, [
    [1, 1],
    [1.5, 0.42],
    [2, 0.18],
    [3, 0.06],
  ], 16, 520, 0.14);
};

const trainHorn: VoicePlayer = (ctx, dest, when, volume) => {
  // Train horn (#23): E2 fundamental with minor-third tierce like Deep Bell,
  // muffled lowpass and long decay for a distant rail-yard character.
  distantHorn(ctx, dest, when, volume, 82.41, [
    [1, 1],
    [1.2, 0.58],
    [1.5, 0.24],
    [2, 0.1],
    [2.4, 0.05],
  ], 17, 450, 0.12);
};

const PLAYERS: Record<MeditationVoiceDef["synth"], VoicePlayer> = {
  bell,
  deepBell,
  chime,
  drone,
  omm,
  fogHorn,
  shipHorn,
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
