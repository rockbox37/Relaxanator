/**
 * Per-voice playback routing for time announcements: plain sprites, a
 * sawtooth-carrier vocoder, or HAL-style soft filtering.
 */
import type { AnnounceVoiceDef } from "@/lib/announce";

/** Vocoder carrier — sawtooth, not square, for a warmer robot tone. */
export const VOCODER_CARRIER_WAVE: OscillatorType = "sawtooth";
export const VOCODER_CARRIER_HZ = 110;
/** Low-pass on the carrier tames saw harmonics before AM. */
export const VOCODER_CARRIER_LP_HZ = 520;
/** Output trim relative to plain voices (was 0.55; raised for audibility). */
export const VOCODER_OUTPUT_GAIN = 0.92;
/** Envelope depth added on top of {@link VOCODER_GAIN_FLOOR}. */
export const VOCODER_ENVELOPE_DEPTH = 0.88;
/** Minimum vocoder gain so the carrier never inverts (ring-mod glitch). */
export const VOCODER_GAIN_FLOOR = 0.12;

let modulatorEnvelopeCurve: Float32Array<ArrayBuffer> | null = null;

/** Full-wave rectifier curve: bipolar speech → unipolar AM envelope. */
export function getModulatorEnvelopeCurve(): Float32Array<ArrayBuffer> {
  if (modulatorEnvelopeCurve) return modulatorEnvelopeCurve;
  const samples = 256;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.abs(x);
  }
  modulatorEnvelopeCurve = curve;
  return curve;
}

export type AnnounceWordHandle = {
  stopAt: number;
  lastNode: AudioNode;
};

function wordDurationSec(buffer: AudioBuffer, playbackRate: number): number {
  return buffer.duration / playbackRate;
}

function schedulePlain(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  playbackRate: number,
  volume: number,
): AnnounceWordHandle {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(dest);
  source.start(when);
  return {
    stopAt: when + wordDurationSec(buffer, playbackRate),
    lastNode: source,
  };
}

/** AM vocoder: rectified speech envelope gates a filtered sawtooth carrier. */
function scheduleVocoderSaw(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  playbackRate: number,
  volume: number,
): AnnounceWordHandle {
  const duration = wordDurationSec(buffer, playbackRate);

  const mod = ctx.createBufferSource();
  mod.buffer = buffer;
  mod.playbackRate.value = playbackRate;

  const envelope = ctx.createWaveShaper();
  envelope.curve = getModulatorEnvelopeCurve();
  envelope.oversample = "2x";

  const modScale = ctx.createGain();
  modScale.gain.value = VOCODER_ENVELOPE_DEPTH;

  const carrier = ctx.createOscillator();
  carrier.type = VOCODER_CARRIER_WAVE;
  carrier.frequency.value = VOCODER_CARRIER_HZ;

  const carrierFilter = ctx.createBiquadFilter();
  carrierFilter.type = "lowpass";
  carrierFilter.frequency.value = VOCODER_CARRIER_LP_HZ;
  carrierFilter.Q.value = 0.7;

  const vocoderGain = ctx.createGain();
  vocoderGain.gain.value = VOCODER_GAIN_FLOOR;

  const out = ctx.createGain();
  out.gain.value = volume * VOCODER_OUTPUT_GAIN;

  mod.connect(envelope).connect(modScale).connect(vocoderGain.gain);
  carrier.connect(carrierFilter).connect(vocoderGain);
  vocoderGain.connect(out).connect(dest);

  mod.start(when);
  carrier.start(when);
  mod.stop(when + duration + 0.02);
  carrier.stop(when + duration + 0.02);

  return { stopAt: when + duration, lastNode: mod };
}

/** Calm, soft HAL tone: British sprites through a gentle lowpass. */
function scheduleHal(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  playbackRate: number,
  volume: number,
): AnnounceWordHandle {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2800;
  tone.Q.value = 0.6;

  const gain = ctx.createGain();
  gain.gain.value = volume * 0.92;

  source.connect(tone).connect(gain).connect(dest);
  source.start(when);

  return {
    stopAt: when + wordDurationSec(buffer, playbackRate),
    lastNode: source,
  };
}

export function scheduleAnnounceWord(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  dest: AudioNode,
  when: number,
  voice: AnnounceVoiceDef,
  volume: number,
): AnnounceWordHandle {
  switch (voice.effect) {
    case "vocoder-saw":
      return scheduleVocoderSaw(ctx, buffer, dest, when, voice.playbackRate, volume);
    case "hal":
      return scheduleHal(ctx, buffer, dest, when, voice.playbackRate, volume);
    default:
      return schedulePlain(ctx, buffer, dest, when, voice.playbackRate, volume);
  }
}
