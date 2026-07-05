/**
 * Pure noise-generation DSP shared between the AudioWorklet processor and
 * unit tests. No Web Audio types here — just sample math. Generators accept
 * an injectable rng (defaults to Math.random) so tests are deterministic.
 */

/** Color ids, index-aligned with the worklet's `color` AudioParam. */
export const NOISE_COLOR_ORDER = ["white", "pink", "brown"];

/** Uniform white noise in [-1, 1). */
export function createWhiteGenerator(rng = Math.random) {
  return () => rng() * 2 - 1;
}

/**
 * Pink noise (-3 dB/octave) via Paul Kellet's refined filter of white noise.
 * Output stays comfortably within [-1, 1].
 */
export function createPinkGenerator(rng = Math.random) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  return () => {
    const white = rng() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    return pink * 0.11;
  };
}

/**
 * Brown (red) noise (-6 dB/octave) via a leaky integrator of white noise.
 * The leak keeps the walk from drifting; 3.5x gain restores audible level.
 */
export function createBrownGenerator(rng = Math.random) {
  let last = 0;
  return () => {
    const white = rng() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    return Math.max(-1, Math.min(1, last * 3.5));
  };
}

const FACTORIES = {
  white: createWhiteGenerator,
  pink: createPinkGenerator,
  brown: createBrownGenerator,
};

/**
 * Create a generator for a color id or its NOISE_COLOR_ORDER index.
 * Unknown colors fall back to white (index 0).
 */
export function createGenerator(color, rng = Math.random) {
  const id = typeof color === "number" ? NOISE_COLOR_ORDER[color] : color;
  const factory = FACTORIES[id] ?? createWhiteGenerator;
  return factory(rng);
}

/** Fill a Float32Array-like buffer from a generator. */
export function fillBuffer(generator, buffer) {
  for (let i = 0; i < buffer.length; i += 1) {
    buffer[i] = generator();
  }
  return buffer;
}
