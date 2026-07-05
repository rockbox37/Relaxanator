import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultNoiseState } from "../lib/noise";
import { NoiseEngine } from "./noise-engine";

function mockAudioContext() {
  const gainNodes: Array<{ value: number }> = [];

  const ctx = {
    sampleRate: 48_000,
    currentTime: 0,
    destination: {},
    audioWorklet: {
      addModule: vi.fn(async () => {}),
    },
    createGain() {
      const gain = { value: 0, setTargetAtTime: vi.fn() };
      gainNodes.push(gain);
      return {
        gain,
        connect() {
          return this;
        },
      };
    },
    createBiquadFilter() {
      return {
        type: "peaking",
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect() {
          return this;
        },
      };
    },
    createDynamicsCompressor() {
      return {
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect() {
          return this;
        },
      };
    },
    createOscillator() {
      return {
        connect() {
          return this;
        },
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
    createBuffer() {
      return {
        getChannelData: () => new Float32Array(1),
      };
    },
    createBufferSource() {
      return {
        buffer: null,
        connect() {
          return this;
        },
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
    _gainNodes: gainNodes,
  };

  return ctx;
}

describe("NoiseEngine announce routing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wires announceBus at unity gain — AnnounceEngine owns output volume", async () => {
    const ctx = mockAudioContext();
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function AudioContext() {
        return ctx;
      }),
    );
    vi.stubGlobal(
      "AudioWorkletNode",
      vi.fn(function AudioWorkletNode() {
        return {
          parameters: {
            get: () => ({ setValueAtTime: vi.fn() }),
          },
          connect() {
            return this;
          },
        };
      }),
    );

    const engine = new NoiseEngine();
    await engine.init(createDefaultNoiseState());

    const announceBus = engine.announceBus as { gain: { value: number } } | null;
    expect(announceBus).not.toBeNull();
    expect(announceBus!.gain.value).toBe(1);
  });
});
