import { beforeEach, describe, expect, it, vi } from "vitest";

import { sliderToGain } from "@/lib/audio-taper";
import { createDefaultChordSettings } from "@/lib/chords";

import { ChordsEngine } from "./chords-engine";

// Mock the synth so we can assert the exact volume argument the engine passes.
vi.mock("./chord-voices", () => ({
  playChordVoice: vi.fn(),
}));

import { playChordVoice } from "./chord-voices";

function mockCtx(currentTime = 0): BaseAudioContext {
  return { currentTime } as unknown as BaseAudioContext;
}

describe("ChordsEngine audio taper", () => {
  beforeEach(() => {
    vi.mocked(playChordVoice).mockClear();
  });

  it("passes a tapered (perceptual) gain into the chord synth on preview", () => {
    const ctx = mockCtx(10);
    const settings = createDefaultChordSettings();
    settings["c-major"].volume = 0.5;

    const engine = new ChordsEngine(ctx, {} as AudioNode, settings);
    engine.preview("c-major");

    expect(playChordVoice).toHaveBeenCalledTimes(1);
    const passedVolume = vi.mocked(playChordVoice).mock.calls[0][4];
    expect(passedVolume).toBeCloseTo(sliderToGain(0.5), 10);
    expect(passedVolume).toBeLessThan(0.5);
  });

  it("preserves the extremes (0 -> silent, 1 -> unity) through the taper", () => {
    const ctx = mockCtx(0);
    const settings = createDefaultChordSettings();

    settings["c-major"].volume = 0;
    new ChordsEngine(ctx, {} as AudioNode, settings).preview("c-major");
    expect(vi.mocked(playChordVoice).mock.calls[0][4]).toBe(0);

    vi.mocked(playChordVoice).mockClear();
    settings["c-major"].volume = 1;
    new ChordsEngine(ctx, {} as AudioNode, settings).preview("c-major");
    expect(vi.mocked(playChordVoice).mock.calls[0][4]).toBe(1);
  });
});
