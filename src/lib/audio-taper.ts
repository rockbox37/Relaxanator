/**
 * Perceptual "audio taper" for volume sliders.
 *
 * Human loudness perception is roughly logarithmic, so a slider whose position
 * maps LINEARLY to audio gain feels wrong: almost all of the perceived change
 * bunches up near the top of the travel while the lower half sounds nearly the
 * same. Mapping the stored 0..1 slider position through a power curve
 * (an "audio taper") spends more of the slider's travel on the quiet region,
 * so equal slider movements produce roughly equal perceived loudness changes.
 *
 * This module is deliberately PURE and framework-free: the audio engines call
 * {@link sliderToGain} at the exact point a stored 0..1 volume becomes a
 * GainNode value (or is handed to a synth). Stored settings stay 0..1 — only
 * the applied gain is tapered.
 */

/**
 * Taper exponent. `gain = position ** TAPER_EXPONENT`.
 *
 * ~2.5 approximates a smooth perceptual taper: the midpoint (0.5) lands well
 * below the linear 0.5 (~0.177), matching how audio "volume" pots are tapered,
 * while keeping the endpoints exact (0 -> 0, 1 -> 1).
 */
export const TAPER_EXPONENT = 2.5;

/**
 * Convert a 0..1 slider position into a perceptually-tapered linear gain.
 *
 * Guarantees:
 * - `sliderToGain(0) === 0` (silent) and `sliderToGain(1) === 1` (unchanged max)
 * - monotonically increasing across [0, 1]
 * - mid-travel gain is noticeably below the linear mapping (sub-linear)
 *
 * Inputs are clamped to [0, 1]; `NaN` maps to 0 so a bad value silences rather
 * than throwing (mirrors `clampVolume` in src/lib/noise.ts).
 */
export function sliderToGain(position01: number): number {
  if (Number.isNaN(position01)) return 0;
  const clamped = Math.min(1, Math.max(0, position01));
  return clamped ** TAPER_EXPONENT;
}
