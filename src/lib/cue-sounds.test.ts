import { describe, expect, it } from "vitest";

import {
  CUE_SOUNDS,
  DEFAULT_BREAK_CUE_SOUND_ID,
  DEFAULT_TODO_CUE_SOUND_ID,
  clampCueVolume,
  createDefaultTodoCueSettings,
} from "./cue-sounds";

describe("CUE_SOUNDS registry", () => {
  it("has unique ids and non-empty labels", () => {
    const ids = CUE_SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sound of CUE_SOUNDS) {
      expect(sound.label.length).toBeGreaterThan(0);
      expect(sound.description.length).toBeGreaterThan(0);
    }
  });

  it("registers both default ids", () => {
    expect(ids()).toContain(DEFAULT_BREAK_CUE_SOUND_ID);
    expect(ids()).toContain(DEFAULT_TODO_CUE_SOUND_ID);
  });

  function ids() {
    return CUE_SOUNDS.map((s) => s.id);
  }
});

describe("clampCueVolume", () => {
  it("clamps into [0, 1] and handles NaN", () => {
    expect(clampCueVolume(-1)).toBe(0);
    expect(clampCueVolume(2)).toBe(1);
    expect(clampCueVolume(0.4)).toBe(0.4);
    expect(clampCueVolume(Number.NaN)).toBeCloseTo(0.55);
  });
});

describe("createDefaultTodoCueSettings", () => {
  it("is enabled with the todo default sound and a sane volume", () => {
    const cue = createDefaultTodoCueSettings();
    expect(cue.enabled).toBe(true);
    expect(cue.soundId).toBe(DEFAULT_TODO_CUE_SOUND_ID);
    expect(cue.volume).toBeGreaterThan(0);
    expect(cue.volume).toBeLessThanOrEqual(1);
  });
});
