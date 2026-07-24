/**
 * Wake detection for clock-synced scheduling (#135). Every scheduler in the
 * app maps a wall-clock instant onto the audio clock and enqueues ahead, which
 * is what keeps timing accurate in throttled background tabs. A machine
 * suspend breaks that mapping: wall time runs on while the audio clock stalls,
 * so on wake the queued schedules point at civil times that have already
 * passed. This module supplies the pure signal the player uses to notice the
 * gap and re-anchor, plus the shared grace that bounds a scheduler's catch-up
 * fire. Pure and unit-tested; the wiring lives in NoisePlayer.
 */

/** The wall clock (epoch ms) and audio clock (seconds) sampled together. */
export interface ClockSample {
  wallMs: number;
  audioSec: number;
}

/**
 * Divergence between the two clocks that counts as a suspend rather than
 * ordinary jitter. Timer throttling delays a tick but advances both clocks
 * equally, so it stays near zero; only a stalled (or jumped) audio clock
 * pushes past this.
 */
export const WAKE_DIVERGENCE_MS = 10_000;

/**
 * How stale a schedule may be before its catch-up fire is dropped instead of
 * played. Comfortably above the ~60s floor of an intensively throttled
 * background tab — which should still ring once — and far below any real
 * suspend, whose missed fires are stale news by the time the machine wakes.
 */
export const STALE_CATCHUP_GRACE_SEC = 120;

export interface WakeObservation {
  /** The sample to carry into the next observation. */
  sample: ClockSample;
  /** How far the wall clock outran the audio clock over this tick. */
  divergenceMs: number;
  /** True when the divergence is large enough to invalidate mapped schedules. */
  woke: boolean;
}

/**
 * Compare two clock samples. `woke` is true when wall time and audio time
 * disagree about how much time passed — the signature of a suspend/resume, or
 * of a wall-clock jump, which invalidates the same mappings. Callers must only
 * sample while the AudioContext is running: a deliberately suspended context
 * stalls its clock for the same reason a sleeping machine does.
 */
export function observeClocks(
  prev: ClockSample,
  next: ClockSample,
  divergenceToleranceMs: number = WAKE_DIVERGENCE_MS,
): WakeObservation {
  const wallDeltaMs = next.wallMs - prev.wallMs;
  const audioDeltaMs = (next.audioSec - prev.audioSec) * 1000;
  const divergenceMs = wallDeltaMs - audioDeltaMs;
  return {
    sample: next,
    divergenceMs,
    woke: Math.abs(divergenceMs) > divergenceToleranceMs,
  };
}

/**
 * True when a schedule that fell behind `nowSec` is recent enough to be worth
 * a single catch-up fire. Beyond the grace the missed fires are discarded so a
 * wake does not release a backlog of triggers.
 */
export function shouldCatchUp(
  fireAtSec: number,
  nowSec: number,
  graceSec: number = STALE_CATCHUP_GRACE_SEC,
): boolean {
  return nowSec - fireAtSec <= graceSec;
}
