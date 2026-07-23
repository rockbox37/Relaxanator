/**
 * Sound-trigger glow state (#104): pure helpers for the transient per-row
 * highlight shown when a sound fires. A glow is an expiry timestamp per
 * voiceId; re-triggering refreshes (not stacks) the expiry, and pruning drops
 * entries whose glow has elapsed. The Web Audio timing (when a scheduled voice
 * is actually heard) lives in the engines; the React wiring lives in
 * NoisePlayer. Everything here is deterministic and unit-tested.
 */

/**
 * How long a row stays lit before it has fully faded back (ms). The row holds
 * at full highlight for the first ~4s, then fades back to baseline over the
 * final ~2s (see the `voice-glow` keyframes in globals.css, which mirror this
 * total 6s window).
 */
export const GLOW_DURATION_MS = 6000;

/**
 * Emitted by the audio engines when a voice is actually heard (the scheduled
 * audio-clock start time, `whenSec`). NoisePlayer defers off this to light the
 * matching row in sync with the sound.
 */
export interface VoiceFireEvent {
  voiceId: string;
  whenSec: number;
}

/** Map of voiceId -> audio-heard glow expiry (epoch ms). */
export type GlowState = Record<string, number>;

/**
 * Light up `voiceId` from `nowMs`, refreshing its expiry if it is already lit.
 * Returns a new map (never mutates the input).
 */
export function triggerGlow(
  state: GlowState,
  voiceId: string,
  nowMs: number,
  durationMs: number = GLOW_DURATION_MS,
): GlowState {
  return { ...state, [voiceId]: nowMs + Math.max(0, durationMs) };
}

/** Drop entries whose glow has elapsed at `nowMs`. Returns a new map. */
export function pruneGlow(state: GlowState, nowMs: number): GlowState {
  const next: GlowState = {};
  for (const [voiceId, expiresAt] of Object.entries(state)) {
    if (expiresAt > nowMs) next[voiceId] = expiresAt;
  }
  return next;
}

/** Set of voiceIds currently lit at `nowMs`. */
export function glowingIds(state: GlowState, nowMs: number): Set<string> {
  const ids = new Set<string>();
  for (const [voiceId, expiresAt] of Object.entries(state)) {
    if (expiresAt > nowMs) ids.add(voiceId);
  }
  return ids;
}
