import { describe, expect, it } from "vitest";

import {
  NOISE_COLOR_ORDER,
  createBrownGenerator,
  createGenerator,
  createPinkGenerator,
  createWhiteGenerator,
  fillBuffer,
} from "../../public/worklets/noise-dsp.js";

/** Deterministic LCG so DSP assertions are reproducible. */
function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function samples(gen: () => number, n: number): number[] {
  return Array.from({ length: n }, () => gen());
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Lag-1 autocorrelation: ~0 for white noise, ~1 for a brown random walk. */
function lag1Autocorrelation(xs: number[]): number {
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    den += (xs[i] - m) ** 2;
    if (i > 0) num += (xs[i] - m) * (xs[i - 1] - m);
  }
  return num / den;
}

const N = 32768;

describe.each([
  ["white", createWhiteGenerator],
  ["pink", createPinkGenerator],
  ["brown", createBrownGenerator],
])("%s generator", (_name, factory) => {
  it("stays bounded in [-1, 1] with near-zero mean and audible level", () => {
    const xs = samples(factory(seededRng(42)), N);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(1);
    expect(Math.abs(mean(xs))).toBeLessThan(0.05);
    expect(Math.max(...xs.map(Math.abs))).toBeGreaterThan(0.05);
  });
});

describe("spectral character", () => {
  it("white is uncorrelated, brown is a smoothed walk, pink in between", () => {
    const white = lag1Autocorrelation(samples(createWhiteGenerator(seededRng(7)), N));
    const pink = lag1Autocorrelation(samples(createPinkGenerator(seededRng(7)), N));
    const brown = lag1Autocorrelation(samples(createBrownGenerator(seededRng(7)), N));
    expect(Math.abs(white)).toBeLessThan(0.05);
    expect(brown).toBeGreaterThan(0.95);
    expect(pink).toBeGreaterThan(white);
    expect(pink).toBeLessThan(brown);
  });
});

describe("createGenerator", () => {
  it("resolves colors by id and by index", () => {
    const rng = seededRng(1);
    for (const [i, id] of NOISE_COLOR_ORDER.entries()) {
      expect(typeof createGenerator(id, rng)).toBe("function");
      expect(typeof createGenerator(i, rng)).toBe("function");
    }
  });

  it("falls back to white for unknown colors", () => {
    const byUnknown = samples(createGenerator("magenta", seededRng(3)), 64);
    const byWhite = samples(createWhiteGenerator(seededRng(3)), 64);
    expect(byUnknown).toEqual(byWhite);
  });

  it("maps dark-brown to the brown generator (EQ carries the darker shelf)", () => {
    expect(NOISE_COLOR_ORDER).toEqual(["white", "pink", "brown", "dark-brown"]);
    const brown = samples(createGenerator("brown", seededRng(11)), 128);
    const darkBrown = samples(createGenerator("dark-brown", seededRng(11)), 128);
    expect(darkBrown).toEqual(brown);
  });
});

describe("fillBuffer", () => {
  it("fills every slot from the generator and returns the buffer", () => {
    const buf = new Float32Array(128);
    const out = fillBuffer(createWhiteGenerator(seededRng(9)), buf);
    expect(out).toBe(buf);
    expect(buf.some((x) => x !== 0)).toBe(true);
    expect(buf.every((x) => x >= -1 && x <= 1)).toBe(true);
  });
});
