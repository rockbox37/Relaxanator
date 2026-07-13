import { describe, expect, it, vi } from "vitest";

import { playBreakCue } from "./break-cue";

function mockAudioContext(): BaseAudioContext {
  const nodes: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> =
    [];

  const createOscillator = vi.fn(() => {
    const osc = {
      type: "sine",
      frequency: { value: 440 },
      connect: vi.fn(function connect(this: unknown, next: unknown) {
        return next;
      }),
      start: vi.fn(),
      stop: vi.fn(),
    };
    nodes.push(osc);
    return osc;
  });

  const createGain = vi.fn(() => ({
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(function connect(this: unknown, next: unknown) {
      return next;
    }),
  }));

  return {
    createOscillator,
    createGain,
    currentTime: 0,
    destination: {},
    _nodes: nodes,
  } as unknown as BaseAudioContext & { _nodes: typeof nodes };
}

describe("playBreakCue", () => {
  it("schedules two oscillators into the destination", () => {
    const ctx = mockAudioContext() as BaseAudioContext & {
      createOscillator: ReturnType<typeof vi.fn>;
      createGain: ReturnType<typeof vi.fn>;
    };
    const dest = { connect: vi.fn() } as unknown as AudioNode;
    playBreakCue(ctx, dest, 1.5, 0.5);
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2);
    expect(ctx.createGain).toHaveBeenCalled();
  });

  it("clamps volume into a usable range", () => {
    const ctx = mockAudioContext() as BaseAudioContext & {
      createGain: ReturnType<typeof vi.fn>;
    };
    const dest = {} as AudioNode;
    playBreakCue(ctx, dest, 0, 2);
    const outGain = ctx.createGain.mock.results[0]?.value;
    expect(outGain.gain.value).toBeCloseTo(0.45);
  });
});
