import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnnounceEngine } from "./announce-engine";
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
        start(_when: number) {},
        onended: null as (() => void) | null,
      };
    },
    createGain() {
      return {
        gain: { value: 1 },
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
});
