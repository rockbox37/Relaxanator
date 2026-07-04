/**
 * 10-band graphic-EQ model: octave-spaced center frequencies from 31 Hz to
 * 16 kHz, each band a peaking filter with a bounded dB gain. Pure logic —
 * Web Audio node wiring lives elsewhere.
 */

export const EQ_BAND_FREQUENCIES = [
  31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const EQ_BAND_COUNT = EQ_BAND_FREQUENCIES.length;

export const EQ_GAIN_MIN_DB = -12;
export const EQ_GAIN_MAX_DB = 12;

export interface EqBand {
  /** Center frequency in Hz. */
  frequency: number;
  /** Peaking-filter gain in dB, clamped to [EQ_GAIN_MIN_DB, EQ_GAIN_MAX_DB]. */
  gainDb: number;
}

/** Clamp a gain value to the legal slider range; NaN becomes 0 (flat). */
export function clampGainDb(gainDb: number): number {
  if (Number.isNaN(gainDb)) return 0;
  return Math.min(EQ_GAIN_MAX_DB, Math.max(EQ_GAIN_MIN_DB, gainDb));
}

/** A flat (all zero-gain) 10-band curve. */
export function createFlatEqCurve(): EqBand[] {
  return EQ_BAND_FREQUENCIES.map((frequency) => ({ frequency, gainDb: 0 }));
}

/**
 * Return a copy of the curve with one band's gain replaced (clamped).
 * Out-of-range indexes return the curve unchanged.
 */
export function withBandGain(
  curve: readonly EqBand[],
  bandIndex: number,
  gainDb: number,
): EqBand[] {
  return curve.map((band, i) =>
    i === bandIndex ? { ...band, gainDb: clampGainDb(gainDb) } : { ...band },
  );
}

/** Human label for a band's center frequency, e.g. "31 Hz", "1 kHz". */
export function formatFrequency(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)} kHz`;
  }
  return `${hz} Hz`;
}
