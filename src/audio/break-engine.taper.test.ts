import { beforeEach, describe, expect, it, vi } from "vitest";

import { sliderToGain } from "@/lib/audio-taper";
import { createDefaultBreakSettings } from "@/lib/breaks";

import { BreakEngine } from "./break-engine";

// Mock the cue synth so we can assert the exact volume argument passed.
vi.mock("./cue-sounds", () => ({
  playCueSound: vi.fn(),
}));

import { playCueSound } from "./cue-sounds";

function mockCtx(currentTime = 0): BaseAudioContext {
  return { currentTime } as unknown as BaseAudioContext;
}

describe("BreakEngine audio taper", () => {
  beforeEach(() => {
    vi.mocked(playCueSound).mockClear();
  });

  it("passes a tapered (perceptual) gain into the cue synth on preview", () => {
    const ctx = mockCtx(3);
    const settings = createDefaultBreakSettings();
    settings.cueVolume = 0.5;

    const engine = new BreakEngine(ctx, {} as AudioNode, settings);
    engine.preview();

    expect(playCueSound).toHaveBeenCalledTimes(1);
    const passedVolume = vi.mocked(playCueSound).mock.calls[0][4];
    expect(passedVolume).toBeCloseTo(sliderToGain(0.5), 10);
    expect(passedVolume).toBeLessThan(0.5);
  });

  it("preserves the extremes (0 -> silent, 1 -> unity) through the taper", () => {
    const ctx = mockCtx(0);

    const zero = createDefaultBreakSettings();
    zero.cueVolume = 0;
    new BreakEngine(ctx, {} as AudioNode, zero).preview();
    expect(vi.mocked(playCueSound).mock.calls[0][4]).toBe(0);

    vi.mocked(playCueSound).mockClear();
    const unity = createDefaultBreakSettings();
    unity.cueVolume = 1;
    new BreakEngine(ctx, {} as AudioNode, unity).preview();
    expect(vi.mocked(playCueSound).mock.calls[0][4]).toBe(1);
  });
});
