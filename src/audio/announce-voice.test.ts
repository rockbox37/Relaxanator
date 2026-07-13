import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FIRST_WORD_ATTACK_SEC,
  FIRST_WORD_BUFFER_SKIP_SEC,
  HAL_OUTPUT_GAIN,
  PLAIN_ATTACK_SEC,
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
        start(_when: number, _offset?: number) {},
      };
      nodes.push(source);
      return source;
    },
    createGain() {
      const gainParam = {
        value: 1,
        setValueAtTime(_value: number, _time: number) {},
        linearRampToValueAtTime(_value: number, _time: number) {},
      };
      const gain = {
        type: "gain",
        gain: gainParam,
        connect(dest: unknown) {
          return dest;
        },
      };
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

  it("keeps Big Robot (hal effect) detune separate from vocoder detune", () => {
    const { ctx, nodes } = mockAudioContext();
    const voice = getAnnounceVoice("big-robot");
    scheduleAnnounceWord(ctx, buffer, dest, 0, voice, 0.6);
    const source = nodes.find((n) => n.type === "source");
    expect(source?.detune?.value).toBe(-75);
    expect(source?.playbackRate?.value).toBe(0.88);
  });

  it("gives Reed (neutral effect) light detune and its own playback rate", () => {
    const { ctx, nodes } = mockAudioContext();
    const voice = getAnnounceVoice("reed");
    scheduleAnnounceWord(ctx, buffer, dest, 0, voice, 0.6);
    const source = nodes.find((n) => n.type === "source");
    expect(source?.detune?.value).toBe(-20);
    expect(source?.playbackRate?.value).toBe(0.96);
  });

  it("applies a short linear attack on plain (vocoder) word gain", () => {
    const { ctx, nodes } = mockAudioContext();
    const voice = getAnnounceVoice("vocoder");
    const when = 1.25;
    const volume = 0.6;
    const setValueAtTime = vi.fn();
    const linearRampToValueAtTime = vi.fn();
    const origCreateGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const gain = origCreateGain();
      gain.gain.setValueAtTime = setValueAtTime;
      gain.gain.linearRampToValueAtTime = linearRampToValueAtTime;
      return gain;
    };

    scheduleAnnounceWord(ctx, buffer, dest, when, voice, volume);

    expect(setValueAtTime).toHaveBeenCalledWith(0, when);
    expect(linearRampToValueAtTime).toHaveBeenCalledWith(
      volume,
      when + PLAIN_ATTACK_SEC,
    );
    expect(nodes.find((n) => n.type === "gain")).toBeDefined();
  });

  it("uses a longer attack on the first plain word of a session", () => {
    const { ctx } = mockAudioContext();
    const voice = getAnnounceVoice("vocoder");
    const when = 2;
    const volume = 0.6;
    const setValueAtTime = vi.fn();
    const linearRampToValueAtTime = vi.fn();
    const origCreateGain = ctx.createGain.bind(ctx);
    ctx.createGain = () => {
      const gain = origCreateGain();
      gain.gain.setValueAtTime = setValueAtTime;
      gain.gain.linearRampToValueAtTime = linearRampToValueAtTime;
      return gain;
    };

    scheduleAnnounceWord(ctx, buffer, dest, when, voice, volume, true);

    expect(setValueAtTime).toHaveBeenCalledWith(0, when);
    expect(linearRampToValueAtTime).toHaveBeenCalledWith(
      volume,
      when + FIRST_WORD_ATTACK_SEC,
    );
  });

  it("skips the leading edge of the first plain word buffer", () => {
    const { ctx } = mockAudioContext();
    const voice = getAnnounceVoice("vocoder");
    const when = 1.5;
    const start = vi.fn();
    const origCreateSource = ctx.createBufferSource.bind(ctx);
    ctx.createBufferSource = () => {
      const source = origCreateSource();
      source.start = start;
      return source;
    };

    scheduleAnnounceWord(ctx, buffer, dest, when, voice, 0.6, true);

    expect(start).toHaveBeenCalledWith(when, FIRST_WORD_BUFFER_SKIP_SEC);
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
