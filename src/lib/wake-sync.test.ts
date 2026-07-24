import { describe, expect, it } from "vitest";

import {
  STALE_CATCHUP_GRACE_SEC,
  WAKE_DIVERGENCE_MS,
  observeClocks,
  shouldCatchUp,
} from "./wake-sync";

describe("observeClocks", () => {
  it("stays quiet when both clocks advance together", () => {
    const observation = observeClocks(
      { wallMs: 1_000_000, audioSec: 10 },
      { wallMs: 1_001_000, audioSec: 11 },
    );
    expect(observation.woke).toBe(false);
    expect(observation.divergenceMs).toBe(0);
  });

  it("stays quiet through a throttled tick, where both clocks jump equally", () => {
    // Intensive throttling delays the pump to once a minute; the audio clock
    // keeps running, so the two agree about how much time passed.
    const observation = observeClocks(
      { wallMs: 1_000_000, audioSec: 10 },
      { wallMs: 1_060_000, audioSec: 70 },
    );
    expect(observation.woke).toBe(false);
  });

  it("tolerates the small jitter between a hardware and system clock", () => {
    const observation = observeClocks(
      { wallMs: 1_000_000, audioSec: 10 },
      { wallMs: 1_001_000, audioSec: 10.95 },
    );
    expect(observation.woke).toBe(false);
  });

  it("wakes when wall time outruns a stalled audio clock", () => {
    // Machine slept three hours: the audio clock barely moved.
    const observation = observeClocks(
      { wallMs: 1_000_000, audioSec: 10 },
      { wallMs: 1_000_000 + 3 * 3_600_000, audioSec: 10.2 },
    );
    expect(observation.woke).toBe(true);
    expect(observation.divergenceMs).toBeGreaterThan(WAKE_DIVERGENCE_MS);
  });

  it("wakes when the audio clock jumps ahead of wall time", () => {
    const observation = observeClocks(
      { wallMs: 1_000_000, audioSec: 10 },
      { wallMs: 1_001_000, audioSec: 3_610 },
    );
    expect(observation.woke).toBe(true);
  });

  it("wakes on a backwards wall-clock correction, which breaks the same mappings", () => {
    const observation = observeClocks(
      { wallMs: 1_000_000, audioSec: 10 },
      { wallMs: 1_000_000 - 60_000, audioSec: 11 },
    );
    expect(observation.woke).toBe(true);
  });

  it("returns the new sample so the caller can carry it forward", () => {
    const next = { wallMs: 1_001_000, audioSec: 11 };
    expect(observeClocks({ wallMs: 1_000_000, audioSec: 10 }, next).sample).toBe(
      next,
    );
  });

  it("honors a caller-supplied tolerance", () => {
    const prev = { wallMs: 1_000_000, audioSec: 10 };
    const next = { wallMs: 1_002_000, audioSec: 11 };
    expect(observeClocks(prev, next, 2_000).woke).toBe(false);
    expect(observeClocks(prev, next, 500).woke).toBe(true);
  });
});

describe("shouldCatchUp", () => {
  it("catches up a schedule that only just fell behind", () => {
    expect(shouldCatchUp(999, 1000)).toBe(true);
  });

  it("catches up a schedule an intensively throttled tab left a minute behind", () => {
    expect(shouldCatchUp(940, 1000)).toBe(true);
  });

  it("catches up exactly at the grace boundary", () => {
    expect(shouldCatchUp(1000 - STALE_CATCHUP_GRACE_SEC, 1000)).toBe(true);
  });

  it("drops a schedule stranded past the grace by a suspend", () => {
    expect(shouldCatchUp(1000 - STALE_CATCHUP_GRACE_SEC - 1, 1000)).toBe(false);
    expect(shouldCatchUp(10, 3_610)).toBe(false);
  });

  it("honors a caller-supplied grace", () => {
    expect(shouldCatchUp(940, 1000, 30)).toBe(false);
    expect(shouldCatchUp(940, 1000, 90)).toBe(true);
  });
});
