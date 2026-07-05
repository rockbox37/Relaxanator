/**
 * Per-voice playback routing for time announcements: plain sprites or
 * HAL-style soft filtering.
 */
import type { AnnounceVoiceDef } from "@/lib/announce";

/** HAL uses plain sprites + lowpass only — no extra trim. */
export const HAL_OUTPUT_GAIN = 1;

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
  gain.gain.value = volume * HAL_OUTPUT_GAIN;

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
    case "hal":
      return scheduleHal(ctx, buffer, dest, when, voice.playbackRate, volume);
    default:
      return schedulePlain(ctx, buffer, dest, when, voice.playbackRate, volume);
  }
}
