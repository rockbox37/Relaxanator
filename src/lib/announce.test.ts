import { afterEach, describe, expect, it, vi } from "vitest";

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
  missedBoundaryMs,
  nextBoundaryMs,
  scheduleHorizonMs,
  scheduleLookaheadMs,
  scheduleMissGraceMs,
  systemPrefers24Hour,
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
    expect(vocoder.playbackRate).toBe(1.025);
    expect(ids).toContain("speak-spell");
    expect(ids).toContain("big-robot");
    expect(ids).toContain("reed");
    expect(ids).not.toContain("trinoids");
  });

  it("falls back to the default voice for unknown ids", () => {
    expect(getAnnounceVoice("trinoids").id).toBe(DEFAULT_ANNOUNCE_VOICE_ID);
  });

  it("defines Big Robot as the processed-robot sprite set with warm filtering", () => {
    const bigRobot = getAnnounceVoice("big-robot");
    expect(bigRobot.dir).toBe("hal");
    expect(bigRobot.effect).toBe("hal");
    expect(bigRobot.playbackRate).toBe(0.88);
  });

  it("defines Reed as a calm natural baritone with light neutral processing", () => {
    const reed = getAnnounceVoice("reed");
    expect(reed.dir).toBe("reed");
    expect(reed.effect).toBe("neutral");
    expect(reed.playbackRate).toBe(0.96);
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

describe("missedBoundaryMs", () => {
  it("returns the boundary just overslept within grace", () => {
    expect(missedBoundaryMs(localMs(15, 0, 2), 60, 60_000)).toBe(localMs(15, 0));
    expect(missedBoundaryMs(localMs(14, 45, 30), 15, 60_000)).toBe(
      localMs(14, 45),
    );
  });

  it("returns null when still before the next boundary", () => {
    expect(missedBoundaryMs(localMs(14, 47), 60, 60_000)).toBeNull();
  });

  it("returns null when the miss is older than grace", () => {
    expect(missedBoundaryMs(localMs(15, 2), 60, 60_000)).toBeNull();
  });

  it("catches a pump that lands exactly on the boundary", () => {
    // nextBoundaryMs is strictly-after, so without catch-up :00 would skip.
    expect(missedBoundaryMs(localMs(15, 0), 60, 60_000)).toBe(localMs(15, 0));
  });

  it("with a full-interval grace, recovers after a >60s timer sleep (#47)", () => {
    // PR #46 used a fixed 60s grace — a 90s oversleep still dropped the hour.
    expect(missedBoundaryMs(localMs(15, 1, 30), 60, 60_000)).toBeNull();
    expect(
      missedBoundaryMs(localMs(15, 1, 30), 60, scheduleMissGraceMs(60)),
    ).toBe(localMs(15, 0));
  });
});

describe("scheduleLookaheadMs / scheduleMissGraceMs", () => {
  it("lookahead is at least 60s and otherwise one full interval", () => {
    expect(scheduleLookaheadMs(15)).toBe(15 * 60_000);
    expect(scheduleLookaheadMs(60)).toBe(60 * 60_000);
    expect(scheduleLookaheadMs(1)).toBe(60_000);
    expect(scheduleHorizonMs(60)).toBe(scheduleLookaheadMs(60));
  });

  it("miss grace caps at 5 minutes so mid-window does not re-speak the prior mark", () => {
    expect(scheduleMissGraceMs(60)).toBe(5 * 60_000);
    expect(scheduleMissGraceMs(15)).toBe(5 * 60_000);
    expect(scheduleMissGraceMs(1)).toBe(60_000);
    // At :50 hourly, a full-interval grace would wrongly return :00.
    expect(missedBoundaryMs(localMs(14, 50), 60, scheduleLookaheadMs(60))).toBe(
      localMs(14, 0),
    );
    expect(missedBoundaryMs(localMs(14, 50), 60, scheduleMissGraceMs(60))).toBeNull();
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
        for (const hour12 of [true, false]) {
          for (const token of timeTokens(h, m, { hour12 })) {
            expect(ANNOUNCE_WORDS).toContain(token);
          }
        }
      }
    }
  });

  it("collapses AM/PM to the same 12-hour word by default", () => {
    expect(timeTokens(10, 0)).toEqual(timeTokens(22, 0));
    expect(timeTokens(1, 0)).toEqual(timeTokens(13, 0));
  });
});

describe("timeTokens (24-hour mode)", () => {
  it("speaks the literal 0–23 hour word on the hour", () => {
    expect(timeTokens(0, 0, { hour12: false })).toEqual([
      "its",
      "zero",
      "oclock",
    ]);
    expect(timeTokens(10, 0, { hour12: false })).toEqual([
      "its",
      "ten",
      "oclock",
    ]);
    expect(timeTokens(13, 0, { hour12: false })).toEqual([
      "its",
      "thirteen",
      "oclock",
    ]);
    expect(timeTokens(15, 0, { hour12: false })).toEqual([
      "its",
      "fifteen",
      "oclock",
    ]);
    expect(timeTokens(22, 0, { hour12: false })).toEqual([
      "its",
      "twentytwo",
      "oclock",
    ]);
    expect(timeTokens(23, 0, { hour12: false })).toEqual([
      "its",
      "twentythree",
      "oclock",
    ]);
  });

  it("keeps quarter-hour minute words alongside the 24-hour hour", () => {
    expect(timeTokens(14, 30, { hour12: false })).toEqual([
      "its",
      "fourteen",
      "thirty",
    ]);
    expect(timeTokens(23, 45, { hour12: false })).toEqual([
      "its",
      "twentythree",
      "fortyfive",
    ]);
    expect(timeTokens(19, 15, { hour12: false })).toEqual([
      "its",
      "nineteen",
      "fifteen",
    ]);
  });

  it("distinguishes AM from PM hours", () => {
    expect(timeTokens(9, 0, { hour12: false })).not.toEqual(
      timeTokens(21, 0, { hour12: false }),
    );
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

  it("uses 24-hour hour words with hyphenation when hour12 is false", () => {
    expect(formatAnnouncement(22, 0, { hour12: false })).toBe(
      "It's twenty-two o'clock",
    );
    expect(formatAnnouncement(13, 0, { hour12: false })).toBe(
      "It's thirteen o'clock",
    );
    expect(formatAnnouncement(0, 0, { hour12: false })).toBe(
      "It's zero o'clock",
    );
    expect(formatAnnouncement(21, 45, { hour12: false })).toBe(
      "It's twenty-one forty-five",
    );
  });
});

describe("systemPrefers24Hour", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Force Intl.resolvedOptions to report the given fields (or throw). */
  function stubResolvedOptions(
    resolved: Partial<Intl.ResolvedDateTimeFormatOptions> | "throw",
  ): void {
    vi.spyOn(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions",
    ).mockImplementation(() => {
      if (resolved === "throw") throw new Error("Intl unavailable");
      return resolved as Intl.ResolvedDateTimeFormatOptions;
    });
  }

  it("returns a boolean without throwing on the real environment", () => {
    expect(typeof systemPrefers24Hour()).toBe("boolean");
  });

  it("prefers the resolved hour12 flag when present", () => {
    stubResolvedOptions({ hour12: false });
    expect(systemPrefers24Hour()).toBe(true);
  });

  it("treats a true hour12 flag as 12-hour", () => {
    stubResolvedOptions({ hour12: true });
    expect(systemPrefers24Hour()).toBe(false);
  });

  it("falls back to a 24-hour hourCycle when hour12 is absent", () => {
    stubResolvedOptions({ hourCycle: "h23" });
    expect(systemPrefers24Hour()).toBe(true);
  });

  it("treats a 12-hour hourCycle as 12-hour", () => {
    stubResolvedOptions({ hourCycle: "h12" });
    expect(systemPrefers24Hour()).toBe(false);
  });

  it("defaults to 12-hour when neither field is reported", () => {
    stubResolvedOptions({});
    expect(systemPrefers24Hour()).toBe(false);
  });

  it("defaults to 12-hour when Intl throws", () => {
    stubResolvedOptions("throw");
    expect(systemPrefers24Hour()).toBe(false);
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
