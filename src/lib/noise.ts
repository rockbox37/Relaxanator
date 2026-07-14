/**
 * Noise-engine state model: colors, volume, and the serializable player
 * state. Pure logic — the Web Audio wiring lives in src/audio/.
 */
import {
  EQ_BAND_FREQUENCIES,
  EQ_GAIN_MIN_DB,
  type EqBand,
  slopedEqCurve,
} from "./eq";

export const NOISE_COLORS = [
  { id: "white", label: "White", description: "Even energy across all frequencies" },
  { id: "pink", label: "Pink", description: "Softer highs, natural balance" },
  { id: "brown", label: "Brown", description: "Deep, rumbling low end" },
  {
    id: "dark-brown",
    label: "Dark Brown",
    description: "Brown lows with a darker mid/high shelf",
  },
] as const;

export type NoiseColor = (typeof NOISE_COLORS)[number]["id"];

/** Classic sloped colors (white / pink / brown). Dark Brown uses a custom shelf. */
export type SlopedNoiseColor = Exclude<NoiseColor, "dark-brown">;

/** The color the player starts on — its curve also seeds the default EQ state. */
export const DEFAULT_NOISE_COLOR: NoiseColor = "brown";

/**
 * Signature EQ tilt (dB per octave) for classic noise colors. White is flat;
 * pink rolls off ~3 dB/oct and brown ~6 dB/oct — the classic power-spectrum
 * slopes, expressed as an EQ curve so selecting a color snaps the sliders to a
 * starting shape the user can then tweak. Kept as a plain map so a future saved
 * session preset can carry its own curve through the same "select preset → snap"
 * path. Dark Brown is not a constant slope — see {@link darkBrownEqCurve}.
 */
export const EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR: Record<SlopedNoiseColor, number> = {
  white: 0,
  pink: 3,
  brown: 6,
};

/**
 * Dark Brown (#68): Brown’s bass shelf through 125 Hz, then +2 dB at 250 Hz and
 * −12 dB from 500 Hz upward. DSP generator reuses Brown; the darkness is EQ.
 */
export function darkBrownEqCurve(): EqBand[] {
  const brown = slopedEqCurve(EQ_ROLLOFF_DB_PER_OCTAVE_BY_COLOR.brown);
  return EQ_BAND_FREQUENCIES.map((frequency, i) => {
    if (frequency <= 125) {
      return { ...brown[i] };
    }
    if (frequency === 250) {
      return { frequency, gainDb: 2 };
    }
    return { frequency, gainDb: EQ_GAIN_MIN_DB };
  });
}

/** The default EQ curve a noise color snaps the sliders to when selected. */
export function eqCurveForColor(color: NoiseColor): EqBand[] {
  if (color === "dark-brown") {
    return darkBrownEqCurve();
  }
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
