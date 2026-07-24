import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sliderToGain } from "@/lib/audio-taper";
import { createDefaultMeditationSettings } from "@/lib/meditation";

import { MeditationEngine } from "./meditation-engine";

// Mock the synth so we can assert the exact volume argument the engine passes.
vi.mock("./voices", () => ({
  playVoice: vi.fn(),
}));

import { playVoice } from "./voices";

function mockCtx(currentTime = 0): BaseAudioContext {
  return { currentTime } as unknown as BaseAudioContext;
}

describe("MeditationEngine audio taper", () => {
  beforeEach(() => {
    vi.mocked(playVoice).mockClear();
  });

  it("passes a tapered (perceptual) gain into the voice synth on preview", () => {
    const ctx = mockCtx(5);
    const settings = createDefaultMeditationSettings();
    // bell is enabled by default; pin a known slider position.
    settings.bell.volume = 0.5;

    const engine = new MeditationEngine(ctx, {} as AudioNode, settings);
    engine.preview("bell");

    expect(playVoice).toHaveBeenCalledTimes(1);
    const passedVolume = vi.mocked(playVoice).mock.calls[0][4];
    expect(passedVolume).toBeCloseTo(sliderToGain(0.5), 10);
    // Sub-linear: the applied gain is below the stored slider position.
    expect(passedVolume).toBeLessThan(0.5);
  });

  it("preserves the extremes (0 -> silent, 1 -> unity) through the taper", () => {
    const ctx = mockCtx(0);
    const settings = createDefaultMeditationSettings();

    settings.bell.volume = 0;
    new MeditationEngine(ctx, {} as AudioNode, settings).preview("bell");
    expect(vi.mocked(playVoice).mock.calls[0][4]).toBe(0);

    vi.mocked(playVoice).mockClear();
    settings.bell.volume = 1;
    new MeditationEngine(ctx, {} as AudioNode, settings).preview("bell");
    expect(vi.mocked(playVoice).mock.calls[0][4]).toBe(1);
  });
});

describe("MeditationEngine wake resync (#135)", () => {
  beforeEach(() => {
    vi.mocked(playVoice).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops the fire missed while asleep and re-anchors the cadence to now", () => {
    vi.useFakeTimers();
    let now = 0;
    const ctx = {
      get currentTime() {
        return now;
      },
    } as unknown as BaseAudioContext;

    const settings = createDefaultMeditationSettings();
    settings.bell.syncToClock = false;
    settings.bell.intervalMin = 1;

    const engine = new MeditationEngine(ctx, {} as AudioNode, settings);
    engine.start(); // first ring reserved for t=60

    // The machine slept through it; the pump comes back 40s past the mark.
    now = 100;
    engine.resync();
    vi.advanceTimersByTime(200);
    expect(playVoice).not.toHaveBeenCalled();

    // Cadence resumes a full interval after the wake, not from the old anchor.
    now = 159.8;
    vi.advanceTimersByTime(200);
    expect(playVoice).toHaveBeenCalledTimes(1);

    engine.stop();
  });
});
