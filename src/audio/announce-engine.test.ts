import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnounceEngine, FIRST_OUTPUT_RAMP_SEC, FIRST_OUTPUT_SETTLE_SEC } from "./announce-engine";
import * as announce from "../lib/announce";
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
        const word = new URL(url, "http://local").pathname.split("/").pop()?.replace(".wav", "") ?? "word";
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
      enabled: false,
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
      enabled: false,
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
      enabled: false,
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
      enabled: false,
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

  it("preview speaks the current wall-clock time, not the next interval boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 14, 47, 30));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: false,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await engine.preview();

    expect(timeTokensSpy).toHaveBeenCalledWith(14, 47, expect.any(Object));
    expect(timeTokensSpy).not.toHaveBeenCalledWith(15, 0, expect.any(Object));

    timeTokensSpy.mockRestore();
    vi.useRealTimers();
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
      enabled: false,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await engine.preview();

    expect(detuneValues).toContain(-600);
  });
});

describe("AnnounceEngine pump scheduling", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const word =
          new URL(url, "http://local").pathname.split("/").pop()?.replace(".wav", "") ??
          "word";
        return {
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(word).buffer,
        };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("schedules when the next boundary is inside the long lookahead window", async () => {
    vi.useFakeTimers();
    // 45s before the hour — outside the old 1.5s window, inside LOOKAHEAD_MS.
    vi.setSystemTime(new Date(2026, 0, 15, 14, 59, 15));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(600);

    expect(timeTokensSpy).toHaveBeenCalledWith(15, 0, expect.any(Object));
    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("schedules early in the interval window, not only in the last 60s (#47)", async () => {
    vi.useFakeTimers();
    // 10 minutes before the hour — outside PR #46's fixed 60s lookahead.
    vi.setSystemTime(new Date(2026, 0, 15, 14, 50, 0));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(timeTokensSpy).toHaveBeenCalledWith(15, 0, expect.any(Object));
    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("catch-up speaks a boundary missed by timer throttling", async () => {
    vi.useFakeTimers();
    // 2s after the hour — nextBoundaryMs alone would wait until 16:00.
    vi.setSystemTime(new Date(2026, 0, 15, 15, 0, 2));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(timeTokensSpy).toHaveBeenCalledWith(15, 0, expect.any(Object));
    // Full-interval lookahead may also enqueue the following hour onto the
    // audio clock; that is intentional. Assert we did catch the missed :00.
    expect(
      timeTokensSpy.mock.calls.some(
        (c) => c[0] === 15 && c[1] === 0,
      ),
    ).toBe(true);
    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("catch-up recovers after a >60s oversleep within the interval (#47)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 15, 1, 30));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(timeTokensSpy).toHaveBeenCalledWith(15, 0, expect.any(Object));
    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("resync clears a reserved boundary so the next pump can re-schedule", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 14, 59, 15));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(timeTokensSpy).toHaveBeenCalledTimes(1);

    engine.resync();
    await vi.advanceTimersByTimeAsync(0);
    expect(timeTokensSpy).toHaveBeenCalledTimes(2);

    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("does not re-fire a catch-up boundary once the next interval is reserved (#62)", async () => {
    vi.useFakeTimers();
    // Inside miss grace after the hour. Full-interval lookahead will also
    // enqueue 16:00; the missed 15:00 must not oscillate back in on later pumps.
    vi.setSystemTime(new Date(2026, 0, 15, 15, 0, 2));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    // Catch-up 15:00, then reserve 16:00, then many pumps inside grace.
    await vi.advanceTimersByTimeAsync(10_000);

    const fifteenOclock = timeTokensSpy.mock.calls.filter(
      (c) => c[0] === 15 && c[1] === 0,
    );
    const sixteenOclock = timeTokensSpy.mock.calls.filter(
      (c) => c[0] === 16 && c[1] === 0,
    );
    expect(fifteenOclock).toHaveLength(1);
    expect(sixteenOclock).toHaveLength(1);

    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("resync during miss grace does not re-speak an already catch-up boundary (#62)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 15, 0, 2));

    const ctx = mockAudioContext();
    const timeTokensSpy = vi.spyOn(announce, "timeTokens");
    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    await vi.advanceTimersByTimeAsync(1000);
    const before = timeTokensSpy.mock.calls.filter(
      (c) => c[0] === 15 && c[1] === 0,
    ).length;
    expect(before).toBe(1);

    engine.resync();
    await vi.advanceTimersByTimeAsync(1000);
    engine.resync();
    await vi.advanceTimersByTimeAsync(1000);

    const after = timeTokensSpy.mock.calls.filter(
      (c) => c[0] === 15 && c[1] === 0,
    ).length;
    expect(after).toBe(1);

    timeTokensSpy.mockRestore();
    engine.stop();
  });

  it("resync cancels prior BufferSources before re-scheduling the same future boundary (#73)", async () => {
    vi.useFakeTimers();
    // Inside full-interval lookahead of the hour.
    vi.setSystemTime(new Date(2026, 0, 15, 14, 50, 0));

    const ctx = mockAudioContext();
    const phraseSources: { stop: ReturnType<typeof vi.fn> }[] = [];
    const origCreate = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = origCreate();
      const stop = vi.fn(source.stop.bind(source));
      source.stop = stop;
      const origStart = source.start.bind(source);
      source.start = (when: number, offset?: number, duration?: number) => {
        // Prime blip passes a duration; phrase words do not.
        if (duration === undefined) {
          phraseSources.push({ stop });
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
    await vi.advanceTimersByTimeAsync(0);

    const firstPhrase = phraseSources.length;
    expect(firstPhrase).toBeGreaterThan(0);
    // No stops yet — the first schedule is still live on the audio clock.
    expect(phraseSources.every((s) => s.stop.mock.calls.length === 0)).toBe(
      true,
    );

    // Mimic enable-path / visibility resync: remaps wall→audio without
    // canceling would leave two overlapping utterances (#73).
    engine.resync();
    await vi.advanceTimersByTimeAsync(0);

    expect(phraseSources.length).toBe(firstPhrase * 2);
    const firstGen = phraseSources.slice(0, firstPhrase);
    const secondGen = phraseSources.slice(firstPhrase);
    expect(firstGen.every((s) => s.stop.mock.calls.length >= 1)).toBe(true);
    expect(secondGen.every((s) => s.stop.mock.calls.length === 0)).toBe(true);

    engine.stop();
  });

  it("enable then resync leaves only one live schedule for the next boundary (#73)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 15, 14, 50, 0));

    const ctx = mockAudioContext();
    const phraseStarts: number[] = [];
    const phraseStops: ReturnType<typeof vi.fn>[] = [];
    const origCreate = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = origCreate();
      const stop = vi.fn(source.stop.bind(source));
      source.stop = stop;
      const origStart = source.start.bind(source);
      source.start = (when: number, offset?: number, duration?: number) => {
        if (duration === undefined) {
          phraseStarts.push(when);
          phraseStops.push(stop);
        }
        origStart(when, offset, duration);
      };
      return source;
    };

    const dest = { connect: () => dest } as unknown as AudioNode;
    const engine = new AnnounceEngine(ctx, dest, {
      enabled: false,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });

    engine.start();
    // NoisePlayer enable path: updateSettings(enabled) pumps, then resync.
    engine.updateSettings({
      enabled: true,
      intervalMin: 60,
      voiceId: "vocoder",
      volume: 0.6,
    });
    await vi.advanceTimersByTimeAsync(0);
    const afterEnable = phraseStarts.length;
    expect(afterEnable).toBeGreaterThan(0);

    engine.resync();
    await vi.advanceTimersByTimeAsync(0);

    expect(phraseStarts.length).toBe(afterEnable * 2);
    const live = phraseStops.filter((s) => s.mock.calls.length === 0);
    expect(live).toHaveLength(afterEnable);

    engine.stop();
  });
});
