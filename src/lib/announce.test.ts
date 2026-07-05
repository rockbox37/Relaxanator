import { describe, expect, it } from "vitest";

import {
  ANNOUNCE_INTERVALS,
  ANNOUNCE_VOICES,
  ANNOUNCE_WORDS,
  DEFAULT_ANNOUNCE_VOICE_ID,
  createDefaultAnnounceSettings,
  getAnnounceVoice,
  nextBoundaryMs,
  timeTokens,
} from "./announce";

function localMs(h: number, m: number, s = 0): number {
  return new Date(2026, 5, 15, h, m, s).getTime(); // Mon Jun 15 2026, local
}

describe("ANNOUNCE_VOICES", () => {
  it("has unique ids and the deep vocoder as the default", () => {
    const ids = ANNOUNCE_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_ANNOUNCE_VOICE_ID);
    expect(getAnnounceVoice(DEFAULT_ANNOUNCE_VOICE_ID).playbackRate).toBeLessThan(1);
    expect(ids).toContain("speak-spell");
  });

  it("falls back to the default voice for unknown ids", () => {
    expect(getAnnounceVoice("hal9000").id).toBe(DEFAULT_ANNOUNCE_VOICE_ID);
  });
});

describe("createDefaultAnnounceSettings", () => {
  it("defaults to disabled, on the hour, vocoder voice", () => {
    const s = createDefaultAnnounceSettings();
    expect(s.enabled).toBe(false);
    expect(s.intervalMin).toBe(60);
    expect(s.voiceId).toBe(DEFAULT_ANNOUNCE_VOICE_ID);
    expect(ANNOUNCE_INTERVALS.some((i) => i.minutes === s.intervalMin)).toBe(true);
  });
});

describe("nextBoundaryMs", () => {
  it("is never immediate: enabling at 2:47 hourly speaks at 3:00", () => {
    expect(nextBoundaryMs(localMs(14, 47), 60)).toBe(localMs(15, 0));
  });

  it("aligns sub-hour intervals to minute marks", () => {
    expect(nextBoundaryMs(localMs(14, 20), 15)).toBe(localMs(14, 30));
    expect(nextBoundaryMs(localMs(14, 44, 59), 15)).toBe(localMs(14, 45));
    expect(nextBoundaryMs(localMs(14, 29), 30)).toBe(localMs(14, 30));
  });

  it("is strictly in the future even exactly on a boundary", () => {
    expect(nextBoundaryMs(localMs(15, 0), 60)).toBe(localMs(16, 0));
    expect(nextBoundaryMs(localMs(14, 45), 15)).toBe(localMs(15, 0));
  });

  it("aligns multi-hour intervals to divisible hours from midnight", () => {
    expect(nextBoundaryMs(localMs(14, 47), 120)).toBe(localMs(16, 0));
    expect(nextBoundaryMs(localMs(15, 59), 180)).toBe(localMs(18, 0));
  });

  it("rolls over midnight", () => {
    const lateNight = new Date(2026, 5, 15, 23, 50).getTime();
    const nextMidnight = new Date(2026, 5, 16, 0, 0).getTime();
    expect(nextBoundaryMs(lateNight, 60)).toBe(nextMidnight);
  });
});

describe("timeTokens", () => {
  it("speaks o'clock on the hour in 12-hour style", () => {
    expect(timeTokens(15, 0)).toEqual(["three", "oclock"]);
    expect(timeTokens(0, 0)).toEqual(["twelve", "oclock"]);
    expect(timeTokens(12, 0)).toEqual(["twelve", "oclock"]);
  });

  it("speaks quarter-hour minutes", () => {
    expect(timeTokens(14, 30)).toEqual(["two", "thirty"]);
    expect(timeTokens(9, 15)).toEqual(["nine", "fifteen"]);
    expect(timeTokens(23, 45)).toEqual(["eleven", "fortyfive"]);
  });

  it("degrades stray minutes to the nearest quarter below", () => {
    expect(timeTokens(14, 7)).toEqual(["two", "oclock"]);
    expect(timeTokens(14, 50)).toEqual(["two", "fortyfive"]);
  });

  it("only ever emits words that exist as sprites", () => {
    for (let h = 0; h < 24; h += 1) {
      for (const m of [0, 15, 30, 45]) {
        for (const token of timeTokens(h, m)) {
          expect(ANNOUNCE_WORDS).toContain(token);
        }
      }
    }
  });
});
