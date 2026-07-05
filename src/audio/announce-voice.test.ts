import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HAL_OUTPUT_GAIN,
  VOCODER_DETUNE_CENTS,
  scheduleAnnounceWord,
} from "./announce-voice";
import { ANNOUNCE_WORDS, getAnnounceVoice } from "../lib/announce";

describe("announce voice routing", () => {
  it("does not attenuate HAL beyond plain voice level", () => {
    expect(HAL_OUTPUT_GAIN).toBe(1);
  });

  it("lowers vocoder pitch by 3 whole steps without changing playbackRate", () => {
    expect(VOCODER_DETUNE_CENTS).toBe(-600);
  });
});

function mockAudioContext() {
  const nodes: Array<{ type: string; detune?: { value: number }; playbackRate?: { value: number }; gain?: { value: number } }> = [];
  const ctx = {
    createBufferSource() {
      const source = {
        type: "source",
        buffer: null as AudioBuffer | null,
        playbackRate: { value: 1 },
        detune: { value: 0 },
        connect(next: { connect: (d: unknown) => unknown }) {
          return next;
        },
        start(_when: number) {},
      };
      nodes.push(source);
      return source;
    },
    createGain() {
      const gain = { type: "gain", gain: { value: 1 }, connect(dest: unknown) { return dest; } };
      nodes.push(gain);
      return gain;
    },
    createBiquadFilter() {
      const filter = {
        type: "filter",
        frequency: { value: 0 },
        Q: { value: 0 },
        gain: { value: 0 },
        connect(dest: unknown) { return dest; },
      };
      nodes.push(filter);
      return filter;
    },
    createDynamicsCompressor() {
      const comp = {
        type: "compressor",
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect(dest: unknown) { return dest; },
      };
      nodes.push(comp);
      return comp;
    },
  };
  return { ctx: ctx as unknown as BaseAudioContext, nodes };
}

describe("scheduleAnnounceWord detune", () => {
  const buffer = { duration: 1 } as AudioBuffer;
  const dest = {} as AudioNode;

  it("applies -600 cent detune for vocoder (Zarvox) plain playback", () => {
    const { ctx, nodes } = mockAudioContext();
    const voice = getAnnounceVoice("vocoder");
    scheduleAnnounceWord(ctx, buffer, dest, 0, voice, 0.6);
    const source = nodes.find((n) => n.type === "source");
    expect(source?.detune?.value).toBe(-600);
    expect(source?.playbackRate?.value).toBe(1.025);
  });

  it("leaves Speak & Spell (Fred) plain playback undetuned", () => {
    const { ctx, nodes } = mockAudioContext();
    const voice = getAnnounceVoice("speak-spell");
    scheduleAnnounceWord(ctx, buffer, dest, 0, voice, 0.6);
    const source = nodes.find((n) => n.type === "source");
    expect(source?.detune?.value).toBe(0);
    expect(source?.playbackRate?.value).toBe(1);
  });

  it("keeps HAL detune separate from vocoder detune", () => {
    const { ctx, nodes } = mockAudioContext();
    const voice = getAnnounceVoice("hal9000");
    scheduleAnnounceWord(ctx, buffer, dest, 0, voice, 0.6);
    const source = nodes.find((n) => n.type === "source");
    expect(source?.detune?.value).toBe(-75);
    expect(source?.playbackRate?.value).toBe(0.88);
  });
});

describe("HAL word sprites", () => {
  /** macOS `say` in a sandbox emits 4096-byte FLLR silence — real sprites are much larger. */
  const MIN_HAL_SPRITE_BYTES = 8000;

  it("ships non-silent Ralph TTS sprites for every word", () => {
    for (const word of ANNOUNCE_WORDS) {
      const path = join(process.cwd(), "public/audio/tts/hal", `${word}.wav`);
      const bytes = readFileSync(path);
      expect(bytes.byteLength, `${word}.wav`).toBeGreaterThan(MIN_HAL_SPRITE_BYTES);
    }
  });
});
