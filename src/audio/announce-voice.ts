/**
 * Per-voice playback routing for time announcements: plain sprites or
 * HAL-style warm mid-register processing.
 */
import type { AnnounceVoiceDef } from "@/lib/announce";

/** HAL chain output trim — unity so volume matches other voices. */
export const HAL_OUTPUT_GAIN = 1;

/** Slight pitch drop (cents) for Douglas Rain–style calm mid-register. */
const HAL_DETUNE_CENTS = -75;

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

/**
 * Warm, measured HAL tone: Ralph (en_US) sprites through gentle compression,
 * mid presence, and soft top rolloff — calm and detached, not tinny British.
 */
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
  source.detune.value = HAL_DETUNE_CENTS;

  const highPass = ctx.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = 120;
  highPass.Q.value = 0.7;

  const midPresence = ctx.createBiquadFilter();
  midPresence.type = "peaking";
  midPresence.frequency.value = 1050;
  midPresence.Q.value = 0.85;
  midPresence.gain.value = 2.5;

  const lowPass = ctx.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 3400;
  lowPass.Q.value = 0.55;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 8;
  compressor.ratio.value = 2.5;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.18;

  const gain = ctx.createGain();
  gain.gain.value = volume * HAL_OUTPUT_GAIN;

  source
    .connect(highPass)
    .connect(midPresence)
    .connect(lowPass)
    .connect(compressor)
    .connect(gain)
    .connect(dest);
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
    case "hal":
      return scheduleHal(ctx, buffer, dest, when, voice.playbackRate, volume);
    default:
      return schedulePlain(ctx, buffer, dest, when, voice.playbackRate, volume);
  }
}
