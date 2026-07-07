/**
 * Noise-engine state model: colors, volume, and the serializable player
 * state. Pure logic — the Web Audio wiring lives in src/audio/.
 */
import { type EqBand, slopedEqCurve } from "./eq";

export const NOISE_COLORS = [
  { id: "white", label: "White", description: "Even energy across all frequencies" },
  { id: "pink", label: "Pink", description: "Softer highs, natural balance" },
  { id: "brown", label: "Brown", description: "Deep, rumbling low end" },
] as const;

export type NoiseColor = (typeof NOISE_COLORS)[number]["id"];

/** The color the player starts on — its curve also seeds the default EQ state. */
export const DEFAULT_NOISE_COLOR: NoiseColor = "brown";

/**
 * Signature EQ tilt (dB per octave) for each noise color. White is flat; pink
 * rolls off ~3 dB/oct and brown ~6 dB/oct — the classic power-spectrum slopes,
 * expressed as an EQ curve so selecting a color snaps the sliders to a starting
 * shape the user can then tweak. Kept as a plain map so a future saved session
 * preset can carry its own curve through the same "select preset → snap" path.
 */
export const EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR: Record<NoiseColor, number> = {
  white: 0,
  pink: 3,
  brown: 6,
};

/** The default EQ curve a noise color snaps the sliders to when selected. */
export function eqCurveForColor(color: NoiseColor): EqBand[] {
  return slopedEqCurve(EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR[color]);
}

export const DEFAULT_MASTER_VOLUME = 0.6;

export interface NoiseState {
  color: NoiseColor;
  /** Master volume in [0, 1]. */
  masterVolume: number;
  eqCurve: EqBand[];
}

/** Clamp a volume to [0, 1]; NaN becomes 0 (silent, fail-safe). */
export function clampVolume(volume: number): number {
  if (Number.isNaN(volume)) return 0;
  return Math.min(1, Math.max(0, volume));
}

/** Index of a color in the worklet's k-rate `color` param space. */
export function colorToIndex(color: NoiseColor): number {
  const index = NOISE_COLORS.findIndex((c) => c.id === color);
  return index === -1 ? 0 : index;
}

export function createDefaultNoiseState(): NoiseState {
  return {
    color: DEFAULT_NOISE_COLOR,
    masterVolume: DEFAULT_MASTER_VOLUME,
    // Seed the curve from the default color so startup (sliders + applied audio
    // EQ) matches the shape a user would get by selecting that color.
    eqCurve: eqCurveForColor(DEFAULT_NOISE_COLOR),
  };
}
