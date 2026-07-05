import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnounceEngine, FIRST_OUTPUT_RAMP_SEC, FIRST_OUTPUT_SETTLE_SEC } from "./announce-engine";
import { ANNOUNCE_WORDS } from "../lib/announce";

function mockAudioContext(state: AudioContextState = "running") {
  const decodeAudioData = vi.fn(async (buf: ArrayBuffer) => ({
    duration: 0.2,
    length: 4410,
    sampleRate: 22050,
    numberOfChannels: 1,
    getChannelData: () => new Float32Array(4410).fill(0.1),
    byteLength: buf.byteLength,
  }));
  return {
    state,
    currentTime: 0,
    decodeAudioData,
    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
        detune: { value: 0 },
        connect(next: { connect: (d: unknown) => unknown }) {
          return next;
        },
        start(_when: number, _offset?: number, _duration?: number) {},
        stop(_when?: number) {},
        onended: null as (() => void) | null,
      };
    },
    createGain() {
      return {
        gain: {
          value: 0,
          cancelScheduledValues(_time: number) {},
          setValueAtTime(_value: number, _time: number) {},
          linearRampToValueAtTime(_value: number, _time: number) {},
        },
        connect(dest: unknown) {
          return dest;
        },
        disconnect() {},
      };
    },
  } as unknown as BaseAudioContext & { decodeAudioData: ReturnType<typeof vi.fn> };
}

describe("AnnounceEngine preload", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const word = url.split("/").pop()?.replace(".wav", "") ?? "word";
        return {
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(word).buffer,
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("awaits in-flight preload started by start() before preview speak", async () => {
    const ctx = mockAudioContext();
    let bufferSources = 0;
    const origCreate = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      bufferSources += 1;
      return origCreate();
    };

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await engine.preview();

    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(ANNOUNCE_WORDS.length);
    expect(bufferSources).toBeGreaterThan(0);
  });

  it("connects a permanent output bus at construction and ramps it on first output", async () => {
    const ctx = mockAudioContext();
    const setValueAtTime = vi.fn();
    const linearRampToValueAtTime = vi.fn();
    let gainCount = 0;
    const origCreateGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      gainCount += 1;
      const gain = origCreateGain();
      gain.gain.setValueAtTime = setValueAtTime;
      gain.gain.linearRampToValueAtTime = linearRampToValueAtTime;
      return gain;
    };

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    expect(gainCount).toBe(1);

    engine.start();
    await engine.preview();
    expect(gainCount).toBeGreaterThan(1);
    expect(setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    const busRamp = linearRampToValueAtTime.mock.calls.find((c) => c[0] === 0.6);
    expect(busRamp).toBeDefined();
    expect(busRamp![1]).toBeCloseTo(0.05 + FIRST_OUTPUT_RAMP_SEC);

    setValueAtTime.mockClear();
    linearRampToValueAtTime.mockClear();
    await engine.preview();
    expect(
      linearRampToValueAtTime.mock.calls.find((c) => c[0] === 0.6),
    ).toBeUndefined();
    expect(setValueAtTime).toHaveBeenCalledWith(0.6, expect.any(Number));
  });

  it("delays the first word until after the settle offset", async () => {
    const ctx = mockAudioContext();
    const phraseStarts: number[] = [];
    const origCreate = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = origCreate();
      const origStart = source.start.bind(source);
      source.start = (when: number, offset?: number, duration?: number) => {
        if (duration === undefined) {
          phraseStarts.push(when);
        }
        origStart(when, offset, duration);
      };
      return source;
    };

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await engine.preview();

    expect(phraseStarts.length).toBeGreaterThan(0);
    expect(phraseStarts[0]).toBeCloseTo(0.05 + FIRST_OUTPUT_SETTLE_SEC);

    phraseStarts.length = 0;
    await engine.preview();
    expect(phraseStarts[0]).toBeCloseTo(0.05);
  });

  it("resets the first-output ramp after stop()", async () => {
    const ctx = mockAudioContext();
    const linearRampToValueAtTime = vi.fn();
    const origCreateGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const gain = origCreateGain();
      gain.gain.linearRampToValueAtTime = linearRampToValueAtTime;
      return gain;
    };

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await engine.preview();
    linearRampToValueAtTime.mockClear();

    engine.stop();
    engine.start();
    await engine.preview();
    expect(
      linearRampToValueAtTime.mock.calls.find((c) => c[0] === 0.6),
    ).toBeDefined();
  });

  it("primes the vocoder detune path after preload", async () => {
    const ctx = mockAudioContext();
    const detuneValues: number[] = [];
    const origCreate = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = origCreate();
      Object.defineProperty(source.detune, "value", {
        set(v: number) {
          detuneValues.push(v);
        },
        get() {
          return detuneValues.at(-1) ?? 0;
        },
      });
      return source;
    };

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await engine.preview();

    expect(detuneValues).toContain(-600);
  });
});
