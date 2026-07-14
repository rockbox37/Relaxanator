import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createAudioContext,
  getAudioContextConstructor,
  playSilentBuffer,
  unlockAudioContext,
} from "./audio-unlock";

function mockCtx(state: AudioContextState = "suspended") {
  const start = vi.fn();
  const connect = vi.fn(function connect(this: unknown) {
    return this;
  });
  const resume = vi.fn(async () => {
    ctx.state = "running";
  });
  const ctx = {
    state,
    sampleRate: 48_000,
    destination: {},
    resume,
    createBuffer: vi.fn(() => ({
      getChannelData: () => ({
        fill: vi.fn(),
      }),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null as AudioBuffer | null,
      connect,
      start,
    })),
  };
  return { ctx: ctx as unknown as AudioContext, start, connect, resume };
}

describe("audio-unlock", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("getAudioContextConstructor prefers AudioContext", () => {
    const Fake = vi.fn();
    vi.stubGlobal("AudioContext", Fake);
    expect(getAudioContextConstructor()).toBe(Fake);
  });

  it("getAudioContextConstructor falls back to webkitAudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    const Webkit = vi.fn();
    vi.stubGlobal("webkitAudioContext", Webkit);
    expect(getAudioContextConstructor()).toBe(Webkit);
  });

  it("getAudioContextConstructor throws when neither constructor exists", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(() => getAudioContextConstructor()).toThrow(/Web Audio API/);
  });

  it("createAudioContext constructs via the resolved ctor", () => {
    const Fake = vi.fn(function FakeAudioContext() {
      return { state: "suspended" };
    });
    vi.stubGlobal("AudioContext", Fake);
    createAudioContext();
    expect(Fake).toHaveBeenCalledOnce();
  });

  it("playSilentBuffer starts a one-sample buffer on destination", () => {
    const { ctx, start, connect } = mockCtx();
    playSilentBuffer(ctx);
    expect(ctx.createBuffer).toHaveBeenCalledWith(1, 1, 48_000);
    expect(connect).toHaveBeenCalledWith(ctx.destination);
    expect(start).toHaveBeenCalledWith(0);
  });

  it("unlockAudioContext plays silent buffer and resumes when suspended", async () => {
    const { ctx, start, resume } = mockCtx("suspended");
    await unlockAudioContext(ctx);
    expect(start).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(ctx.state).toBe("running");
  });

  it("unlockAudioContext skips resume when already running", async () => {
    const { ctx, start, resume } = mockCtx("running");
    await unlockAudioContext(ctx);
    expect(start).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
  });

  it("unlockAudioContext still resumes if silent buffer throws", async () => {
    const { ctx, resume } = mockCtx("suspended");
    vi.spyOn(ctx, "createBuffer").mockImplementation(() => {
      throw new Error("boom");
    });
    await unlockAudioContext(ctx);
    expect(resume).toHaveBeenCalledOnce();
  });
});
