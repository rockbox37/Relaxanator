/**
 * Post-decode buffer shaping for TTS sprites. macOS `say` exports often
 * start with a small DC offset / edge click that survives playback-rate and
 * detune resampling — a short linear fade at decode time removes it once for
 * all scheduled words.
 */
export const SPRITE_DECODE_FADE_SEC = 0.012;

/** Apply a linear fade-in to the first `fadeSec` of every channel in place. */
export function fadeInDecodedBuffer(
  buffer: AudioBuffer,
  fadeSec = SPRITE_DECODE_FADE_SEC,
): AudioBuffer {
  const fadeSamples = Math.min(
    Math.ceil(fadeSec * buffer.sampleRate),
    buffer.length,
  );
  if (fadeSamples <= 1) return buffer;

  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < fadeSamples; i += 1) {
      data[i] *= i / (fadeSamples - 1);
    }
  }
  return buffer;
}
