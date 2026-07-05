import { describe, expect, it } from "vitest";

import {
  ANNOUNCE_INTERVALS,
  ANNOUNCE_VOICES,
  ANNOUNCE_WORDS,
  DEFAULT_ANNOUNCE_VOICE_ID,
  WORD_GAP_AFTER_ITS_SEC,
  WORD_GAP_SEC,
  createDefaultAnnounceSettings,
  formatAnnouncement,
  formatHourAnnouncement,
  getAnnounceVoice,
  nextBoundaryMs,
  timeTokens,
  wordGapAfterToken,
} from "./announce";

function localMs(h: number, m: number, s = 0): number {
  return new Date(2026, 5, 15, h, m, s).getTime(); // Mon Jun 15 2026, local
}

describe("ANNOUNCE_VOICES", () => {
  it("has unique ids and the deep vocoder as the default", () => {
    const ids = ANNOUNCE_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(DEFAULT_ANNOUNCE_VOICE_ID);
    const vocoder = getAnnounceVoice(DEFAULT_ANNOUNCE_VOICE_ID);
    expect(vocoder.dir).toBe("zarvox");
    expect(vocoder.effect).toBe("plain");
    expect(vocoder.playbackRate).toBe(0.984);
    expect(ids).toContain("speak-spell");
    expect(ids).toContain("hal9000");
    expect(ids).not.toContain("trinoids");
  });

  it("falls back to the default voice for unknown ids", () => {
    expect(getAnnounceVoice("trinoids").id).toBe(DEFAULT_ANNOUNCE_VOICE_ID);
  });

  it("defines HAL as a measured North American sprite set with warm filtering", () => {
    const hal = getAnnounceVoice("hal9000");
    expect(hal.dir).toBe("hal");
    expect(hal.effect).toBe("hal");
    expect(hal.playbackRate).toBe(0.88);
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
  it("speaks It's … o'clock on the hour in 12-hour style", () => {
    expect(timeTokens(10, 0)).toEqual(["its", "ten", "oclock"]);
    expect(timeTokens(15, 0)).toEqual(["its", "three", "oclock"]);
    expect(timeTokens(0, 0)).toEqual(["its", "twelve", "oclock"]);
    expect(timeTokens(12, 0)).toEqual(["its", "twelve", "oclock"]);
  });

  it("speaks quarter-hour minutes with the It's prefix", () => {
    expect(timeTokens(14, 30)).toEqual(["its", "two", "thirty"]);
    expect(timeTokens(9, 15)).toEqual(["its", "nine", "fifteen"]);
    expect(timeTokens(23, 45)).toEqual(["its", "eleven", "fortyfive"]);
  });

  it("degrades stray minutes to the nearest quarter below", () => {
    expect(timeTokens(14, 7)).toEqual(["its", "two", "oclock"]);
    expect(timeTokens(14, 50)).toEqual(["its", "two", "fortyfive"]);
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

describe("formatAnnouncement", () => {
  it("formats on-the-hour times as It's {hour} o'clock", () => {
    expect(formatAnnouncement(10, 0)).toBe("It's ten o'clock");
    expect(formatAnnouncement(22, 0)).toBe("It's ten o'clock");
    expect(formatAnnouncement(0, 0)).toBe("It's twelve o'clock");
    expect(formatAnnouncement(12, 0)).toBe("It's twelve o'clock");
    expect(formatAnnouncement(1, 0)).toBe("It's one o'clock");
  });

  it("formats quarter-hour times with hyphenated forty-five", () => {
    expect(formatAnnouncement(14, 30)).toBe("It's two thirty");
    expect(formatAnnouncement(23, 45)).toBe("It's eleven forty-five");
  });
});

describe("formatHourAnnouncement", () => {
  it("reads the hour from a Date in local time", () => {
    expect(formatHourAnnouncement(new Date(2026, 5, 15, 10, 0))).toBe(
      "It's ten o'clock",
    );
  });
});

describe("wordGapAfterToken", () => {
  it("halves the standard gap after the It's prefix", () => {
    expect(WORD_GAP_AFTER_ITS_SEC).toBe(WORD_GAP_SEC / 2);
    expect(wordGapAfterToken("its")).toBe(0.06);
  });

  it("keeps the standard gap between hour and minute or o'clock", () => {
    expect(wordGapAfterToken("ten")).toBe(0.12);
    expect(wordGapAfterToken("oclock")).toBe(0.12);
    expect(wordGapAfterToken("thirty")).toBe(0.12);
  });
});
