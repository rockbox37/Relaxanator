/**
 * Gentle break-prompt audio cue (FR-2). Soft two-tone chime into the master
 * mix bus — distinct from meditation voices but still synthesized.
 */

/** Soft ascending chime: C5 → E5 with a short decay. */
export function playBreakCue(
  ctx: BaseAudioContext,
  dest: AudioNode,
  when: number,
  volume: number,
): void {
  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume)) * 0.45;
  out.connect(dest);

  const tones: Array<[hz: number, delay: number, gain: number]> = [
    [523.25, 0, 1],
    [659.25, 0.12, 0.75],
  ];

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
  }
}
