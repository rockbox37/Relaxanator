/**
 * Noise-engine state model: colors, volume, and the serializable player
 * state. Pure logic — the Web Audio wiring lives in src/audio/.
 */
import { type EqBand, createFlatEqCurve } from "./eq";

export const NOISE_COLORS = [
  { id: "white", label: "White", description: "Even energy across all frequencies" },
  { id: "pink", label: "Pink", description: "Softer highs, natural balance" },
  { id: "brown", label: "Brown", description: "Deep, rumbling low end" },
] as const;

export type NoiseColor = (typeof NOISE_COLORS)[number]["id"];

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
    color: "brown",
    masterVolume: DEFAULT_MASTER_VOLUME,
    eqCurve: createFlatEqCurve(),
  };
}
