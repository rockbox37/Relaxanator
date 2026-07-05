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
  struck(ctx, dest, when, volume * 0.8, 220, [
    [1, 1],
    [2.0, 0.6],
    [2.76, 0.4],
    [5.4, 0.25],
    [8.93, 0.12],
  ], 7);
};

const chime: VoicePlayer = (ctx, dest, when, volume) => {
  struck(ctx, dest, when, volume * 0.6, 880, [
    [1, 1],
    [2.76, 0.5],
    [5.4, 0.2],
  ], 3);
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

const PLAYERS: Record<MeditationVoiceDef["synth"], VoicePlayer> = {
  bell,
  chime,
  drone,
  omm,
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
