import { describe, expect, it } from "vitest";

import {
  ARP_STEP_BEATS,
  CHORD_MAX_INTERVAL_MIN,
  CHORD_MIN_INTERVAL_MIN,
  CHORD_TIMBRES,
  CHORD_VOICES,
  type ChordVoiceDef,
  type ChordVoiceSettings,
  DEFAULT_TEMPO_BPM,
  MAX_TEMPO_BPM,
  MIN_TEMPO_BPM,
  buildChordPlan,
  chordPlanDurationSec,
  clampChordIntervalMin,
  clampTempoBpm,
  collectDueChordEvents,
  computeNextChordFire,
  createDefaultChordSettings,
  initChordSchedule,
  isChordTimbreId,
  midiToHz,
  noteGain,
} from "./chords";

function voiceSettings(
  overrides: Partial<ChordVoiceSettings> = {},
): ChordVoiceSettings {
  return {
    enabled: true,
    mode: "block",
    tempoBpm: 60, // 1 beat === 1 second, keeps timing arithmetic obvious
    timbreId: "rhodes",
    intervalMin: 1,
    volume: 0.5,
    ...overrides,
  };
}

function findVoice(id: string): ChordVoiceDef {
  const voice = CHORD_VOICES.find((v) => v.id === id);
  if (!voice) throw new Error(`missing test voice ${id}`);
  return voice;
}

describe("CHORD_TIMBRES registry", () => {
  it("has unique ids, non-empty labels, and covers every category", () => {
    const ids = CHORD_TIMBRES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const timbre of CHORD_TIMBRES) {
      expect(timbre.label.length).toBeGreaterThan(0);
      expect(timbre.description.length).toBeGreaterThan(0);
    }
    const categories = new Set(CHORD_TIMBRES.map((t) => t.category));
    expect(categories).toEqual(
      new Set([
        "electric-piano",
        "harpsichord",
        "piano",
        "synth-pad",
        "guitar",
      ]),
    );
  });

  it("covers the requested instrument families", () => {
    const byCat = (c: string) =>
      CHORD_TIMBRES.filter((t) => t.category === c).length;
    // Several electric pianos + several airy pads, plus harpsichord + pianos.
    expect(byCat("electric-piano")).toBeGreaterThanOrEqual(2);
    expect(byCat("harpsichord")).toBeGreaterThanOrEqual(1);
    expect(byCat("piano")).toBeGreaterThanOrEqual(2);
    expect(byCat("synth-pad")).toBeGreaterThanOrEqual(3);
    // A family of guitars (metal, nylon, jazz, steel, clean electric, 12-string).
    expect(byCat("guitar")).toBeGreaterThanOrEqual(5);
  });

  it("includes the guitar timbre family with a stable id set", () => {
    const guitarIds = CHORD_TIMBRES.filter((t) => t.category === "guitar").map(
      (t) => t.id,
    );
    expect(new Set(guitarIds)).toEqual(
      new Set([
        "nylon-guitar",
        "steel-guitar",
        "clean-electric",
        "jazz-guitar",
        "metal-guitar",
        "twelve-string",
      ]),
    );
  });
});

describe("isChordTimbreId", () => {
  it("recognizes registered ids and rejects unknown ones", () => {
    expect(isChordTimbreId("rhodes")).toBe(true);
    expect(isChordTimbreId("harpsichord")).toBe(true);
    expect(isChordTimbreId("metal-guitar")).toBe(true);
    expect(isChordTimbreId("jazz-guitar")).toBe(true);
    expect(isChordTimbreId("tuba")).toBe(false);
  });
});

describe("CHORD_VOICES registry", () => {
  it("has unique ids and valid default timbres", () => {
    const ids = CHORD_VOICES.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const voice of CHORD_VOICES) {
      expect(isChordTimbreId(voice.defaultTimbreId)).toBe(true);
      expect(voice.chords.length).toBeGreaterThan(0);
      expect(voice.defaultVolume).toBeGreaterThan(0);
      expect(voice.defaultVolume).toBeLessThanOrEqual(1);
      for (const chord of voice.chords) {
        expect(chord.intervals.length).toBeGreaterThan(0);
        expect(chord.beats).toBeGreaterThan(0);
      }
    }
  });

  it("includes ready-made guitar voices defaulting to guitar timbres", () => {
    const guitarTimbreIds = new Set(
      CHORD_TIMBRES.filter((t) => t.category === "guitar").map((t) => t.id),
    );
    const expectedGuitarVoiceIds = [
      "metal-power-chords",
      "nylon-classical",
      "steel-folk",
      "jazz-turnaround",
      "clean-arpeggios",
      "twelve-string-jangle",
    ];
    for (const id of expectedGuitarVoiceIds) {
      const voice = findVoice(id);
      expect(guitarTimbreIds.has(voice.defaultTimbreId)).toBe(true);
    }
    // The required metal power-chord voice: low root, block, power chords.
    const metal = findVoice("metal-power-chords");
    expect(metal.defaultTimbreId).toBe("metal-guitar");
    expect(metal.defaultMode).toBe("block");
    expect(metal.rootMidi).toBeLessThanOrEqual(40); // low-E territory
    for (const chord of metal.chords) {
      // Power chords = root + perfect fifth (+ optional octave).
      expect(chord.intervals).toContain(chord.intervals[0] + 7);
    }
  });

  it("has both single chords and multi-chord progressions", () => {
    const single = CHORD_VOICES.filter((v) => v.kind === "chord");
    const progressions = CHORD_VOICES.filter((v) => v.kind === "progression");
    expect(single.length).toBeGreaterThan(0);
    expect(progressions.length).toBeGreaterThan(0);
    for (const chordVoice of single) {
      expect(chordVoice.chords).toHaveLength(1);
    }
    for (const prog of progressions) {
      expect(prog.chords.length).toBeGreaterThan(1);
    }
  });
});

describe("midiToHz", () => {
  it("anchors A4 = 440 Hz and computes octaves/semitones", () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6); // A3, an octave down
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3); // middle C
    expect(midiToHz(70)).toBeCloseTo(440 * 2 ** (1 / 12), 6);
  });
});

describe("noteGain", () => {
  it("makes the root loudest and the upper voices softer", () => {
    expect(noteGain(0)).toBe(1);
    expect(noteGain(1)).toBe(0.8);
    expect(noteGain(4)).toBe(0.8);
  });
});

describe("clampTempoBpm", () => {
  it("clamps to range and fails safe on NaN", () => {
    expect(clampTempoBpm(120)).toBe(120);
    expect(clampTempoBpm(1)).toBe(MIN_TEMPO_BPM);
    expect(clampTempoBpm(9999)).toBe(MAX_TEMPO_BPM);
    expect(clampTempoBpm(Number.NaN)).toBe(DEFAULT_TEMPO_BPM);
  });
});

describe("clampChordIntervalMin", () => {
  it("clamps to range and fails safe on NaN", () => {
    expect(clampChordIntervalMin(3)).toBe(3);
    expect(clampChordIntervalMin(0)).toBe(CHORD_MIN_INTERVAL_MIN);
    expect(clampChordIntervalMin(999)).toBe(CHORD_MAX_INTERVAL_MIN);
    expect(clampChordIntervalMin(Number.NaN)).toBe(CHORD_MIN_INTERVAL_MIN);
  });
});

describe("createDefaultChordSettings", () => {
  it("creates one entry per voice, enabling exactly one", () => {
    const settings = createDefaultChordSettings();
    expect(Object.keys(settings)).toHaveLength(CHORD_VOICES.length);
    const enabled = Object.values(settings).filter((s) => s.enabled);
    expect(enabled).toHaveLength(1);
    expect(settings["c-major"].enabled).toBe(true);
  });

  it("seeds each voice from its registry defaults", () => {
    const settings = createDefaultChordSettings();
    for (const voice of CHORD_VOICES) {
      const s = settings[voice.id];
      expect(s.mode).toBe(voice.defaultMode);
      expect(s.tempoBpm).toBe(voice.defaultTempoBpm);
      expect(s.timbreId).toBe(voice.defaultTimbreId);
      expect(s.intervalMin).toBe(voice.defaultIntervalMin);
      expect(s.volume).toBe(voice.defaultVolume);
    }
  });
});

describe("buildChordPlan — block mode", () => {
  it("stacks every note of a single chord at the start", () => {
    const voice = findVoice("c-major"); // C4 major triad, one chord of 4 beats
    const events = buildChordPlan(voice, voiceSettings({ mode: "block" }), 10);
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.whenSec).toBe(10); // all simultaneous
      expect(e.holdSec).toBe(4); // 4 beats * 1s/beat at 60bpm
    }
    expect(events[0].hz).toBeCloseTo(midiToHz(60), 6);
    expect(events[1].hz).toBeCloseTo(midiToHz(64), 6);
    expect(events[2].hz).toBeCloseTo(midiToHz(67), 6);
    expect(events[0].gain).toBe(1);
    expect(events[1].gain).toBe(0.8);
  });

  it("advances the cursor by each chord's duration in a progression", () => {
    const voice = findVoice("pop-I-V-vi-IV"); // 4 chords of 2 beats each
    const events = buildChordPlan(voice, voiceSettings({ mode: "block" }), 0);
    // Each chord is a triad -> 12 notes total.
    expect(events).toHaveLength(12);
    // Chord starts land at 0, 2, 4, 6 seconds (2 beats @ 60bpm).
    const starts = [...new Set(events.map((e) => e.whenSec))];
    expect(starts).toEqual([0, 2, 4, 6]);
  });
});

describe("buildChordPlan — arpeggiated mode", () => {
  it("spreads notes by the arp step and sustains them to the chord end", () => {
    const voice = findVoice("c-major"); // one chord, 4 beats, triad
    const events = buildChordPlan(
      voice,
      voiceSettings({ mode: "arpeggiated" }),
      0,
    );
    const stepSec = ARP_STEP_BEATS * 1; // 0.5s at 60bpm
    expect(events[0].whenSec).toBeCloseTo(0, 6);
    expect(events[1].whenSec).toBeCloseTo(stepSec, 6);
    expect(events[2].whenSec).toBeCloseTo(2 * stepSec, 6);
    // Each note sustains to the end of the 4s chord (minus its offset).
    expect(events[0].holdSec).toBeCloseTo(4, 6);
    expect(events[1].holdSec).toBeCloseTo(4 - stepSec, 6);
    expect(events[2].holdSec).toBeCloseTo(4 - 2 * stepSec, 6);
  });

  it("floors the sustain at one beat for late arp notes", () => {
    // A wide 5-note chord arpeggiated fast: later offsets exceed chord length,
    // so holdSec must clamp up to one beat rather than going negative.
    const voice: ChordVoiceDef = {
      id: "wide",
      label: "Wide",
      description: "test",
      kind: "chord",
      rootMidi: 60,
      chords: [{ intervals: [0, 2, 4, 6, 8], beats: 1 }],
      defaultTimbreId: "rhodes",
      defaultMode: "arpeggiated",
      defaultTempoBpm: 60,
      defaultIntervalMin: 1,
      defaultVolume: 0.5,
    };
    const events = buildChordPlan(
      voice,
      voiceSettings({ mode: "arpeggiated" }),
      0,
    );
    for (const e of events) {
      expect(e.holdSec).toBeGreaterThanOrEqual(1); // one beat at 60bpm
    }
  });
});

describe("chordPlanDurationSec", () => {
  it("sums each chord's beat length at the configured tempo", () => {
    const voice = findVoice("pop-I-V-vi-IV"); // 4 * 2 beats = 8 beats
    // 120 bpm -> 0.5s/beat -> 8 * 0.5 = 4s.
    expect(chordPlanDurationSec(voice, voiceSettings({ tempoBpm: 120 }))).toBeCloseTo(
      4,
      6,
    );
  });

  it("matches the cursor advance of buildChordPlan (block)", () => {
    const voice = findVoice("jazz-ii-V-I");
    const settings = voiceSettings({ mode: "block", tempoBpm: 90 });
    const events = buildChordPlan(voice, settings, 100);
    const dur = chordPlanDurationSec(voice, settings);
    const lastStart = Math.max(...events.map((e) => e.whenSec));
    // Final chord begins before the total end; the total is strictly greater.
    expect(100 + dur).toBeGreaterThan(lastStart);
  });
});

describe("computeNextChordFire", () => {
  it("advances exactly one interval", () => {
    expect(computeNextChordFire(100, voiceSettings({ intervalMin: 2 }))).toBe(
      100 + 120,
    );
  });

  it("never schedules in the past for degenerate intervals", () => {
    expect(
      computeNextChordFire(50, voiceSettings({ intervalMin: -100 })),
    ).toBeGreaterThan(50);
  });
});

describe("initChordSchedule", () => {
  it("seeds only enabled voices one interval out", () => {
    const settings = {
      a: voiceSettings({ intervalMin: 1 }),
      b: voiceSettings({ enabled: false }),
    };
    const schedule = initChordSchedule(settings, 10);
    expect(schedule.a).toBe(70);
    expect(schedule.b).toBeUndefined();
  });
});

describe("collectDueChordEvents", () => {
  it("emits events inside the lookahead window and advances the schedule", () => {
    const settings = { a: voiceSettings({ intervalMin: 1 }) };
    const { events, schedule } = collectDueChordEvents(
      { a: 100.2 },
      settings,
      100,
      0.5,
    );
    expect(events).toEqual([{ voiceId: "a", whenSec: 100.2 }]);
    expect(schedule.a).toBe(100.2 + 60);
  });

  it("emits nothing when the next fire is beyond the lookahead", () => {
    const settings = { a: voiceSettings() };
    const { events, schedule } = collectDueChordEvents(
      { a: 105 },
      settings,
      100,
      0.5,
    );
    expect(events).toEqual([]);
    expect(schedule.a).toBe(105);
  });

  it("drops disabled voices and seeds newly enabled ones", () => {
    const settings = {
      gone: voiceSettings({ enabled: false }),
      fresh: voiceSettings({ intervalMin: 2 }),
    };
    const { events, schedule } = collectDueChordEvents(
      { gone: 101 },
      settings,
      100,
      0.5,
    );
    expect(events).toEqual([]);
    expect(schedule.gone).toBeUndefined();
    expect(schedule.fresh).toBe(100 + 120);
  });

  it("fires once after a long suspend instead of burst-firing", () => {
    const settings = { a: voiceSettings({ intervalMin: 1 }) };
    const { events, schedule } = collectDueChordEvents(
      { a: 40 },
      settings,
      640,
      0.5,
    );
    expect(events).toEqual([{ voiceId: "a", whenSec: 640 }]);
    expect(schedule.a).toBe(640 + 60);
  });

  it("emits multiple events when several fires fall in the window", () => {
    // A tiny interval + a wide lookahead should surface several fires.
    const settings = { a: voiceSettings({ intervalMin: CHORD_MIN_INTERVAL_MIN }) };
    const intervalSec = CHORD_MIN_INTERVAL_MIN * 60; // 30s
    const { events } = collectDueChordEvents(
      { a: 100 },
      settings,
      100 - intervalSec, // so the first fire is exactly at 100
      intervalSec * 2 + 1,
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
  });
});
