import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnounceEngine, FIRST_OUTPUT_RAMP_SEC, FIRST_OUTPUT_SETTLE_SEC } from "./announce-engine";
import { ANNOUNCE_WORDS } from "../lib/announce";

function mockAudioContext(state: AudioContextState = "running") {
  const decodeAudioData = vi.fn(async (buf: ArrayBuffer) => ({
    duration: 0.2,
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
        start(_when: number, _offset?: number) {},
        onended: null as (() => void) | null,
      };
    },
    createGain() {
      return {
        gain: {
          value: 1,
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

  it("ramps the announce bus on first output, then steps gain on later phrases", async () => {
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

    engine.start();
    await engine.preview();
    expect(gainCount).toBeGreaterThan(0);
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
  });

  it("delays the first word until after the settle offset", async () => {
    const ctx = mockAudioContext();
    const startCalls: number[] = [];
    const origCreate = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = origCreate();
      const origStart = source.start.bind(source);
      source.start = (when: number) => {
        startCalls.push(when);
        origStart(when);
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

    expect(startCalls.length).toBeGreaterThan(0);
    expect(startCalls[0]).toBeCloseTo(0.05 + FIRST_OUTPUT_SETTLE_SEC);

    startCalls.length = 0;
    await engine.preview();
    expect(startCalls[0]).toBeCloseTo(0.05);
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
});
