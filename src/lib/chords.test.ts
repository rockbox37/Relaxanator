import { describe, expect, it } from "vitest";

import {
  ARP_STEP_BEATS,
  BEATS_PER_BAR,
  CHORD_MAX_INTERVAL_MIN,
  CHORD_MIN_INTERVAL_MIN,
  CHORD_TIMBRES,
  CHORD_VOICES,
  type ChordVoiceDef,
  type ChordVoiceSettings,
  DEFAULT_TEMPO_BPM,
  MAX_TEMPO_BPM,
  MIN_TEMPO_BPM,
  STRUM_MAX_STEP_SEC,
  STRUM_MIN_STEP_SEC,
  buildChordPlan,
  chordLoopIntervalSec,
  chordPlanBeats,
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
  strumStepSec,
} from "./chords";

function voiceSettings(
  overrides: Partial<ChordVoiceSettings> = {},
): ChordVoiceSettings {
  return {
    enabled: true,
    mode: "block",
    loop: false,
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

  it("includes the new minor-chord voices with minor-flavored voicings", () => {
    const expectedMinorVoiceIds = [
      "e-minor",
      "em7",
      "gm9",
      "minor-andalusian",
      "minor-i-VI-III-VII",
    ];
    for (const id of expectedMinorVoiceIds) {
      const voice = findVoice(id);
      expect(isChordTimbreId(voice.defaultTimbreId)).toBe(true);
    }
    // The single minor chords carry a minor third (3 semitones) above the root.
    for (const id of ["e-minor", "em7", "gm9"]) {
      const voice = findVoice(id);
      expect(voice.kind).toBe("chord");
      expect(voice.chords[0].intervals).toContain(3);
      expect(voice.chords[0].intervals).toContain(7); // perfect fifth
    }
    // Em7 adds a minor seventh; Gm9 adds the seventh and the ninth.
    expect(findVoice("em7").chords[0].intervals).toContain(10);
    expect(findVoice("gm9").chords[0].intervals).toEqual([0, 3, 7, 10, 14]);
    // The minor-key progressions are multi-chord.
    for (const id of ["minor-andalusian", "minor-i-VI-III-VII"]) {
      expect(findVoice(id).chords.length).toBeGreaterThan(1);
    }
  });

  it("includes soothing pentatonic progressions with no semitone clashes", () => {
    // Each pentatonic voice's chord tones must belong to its named pentatonic
    // scale (as pitch classes), guaranteeing an open, tension-free sound.
    const pentatonicScales: Record<string, Set<number>> = {
      // C major pentatonic: C D E G A
      "pentatonic-major-drift": new Set([0, 2, 4, 7, 9]),
      // A minor pentatonic: A C D E G
      "pentatonic-minor-flow": new Set([9, 0, 2, 4, 7]),
      // D major pentatonic: D E F# A B
      "pentatonic-quartal-air": new Set([2, 4, 6, 9, 11]),
    };
    for (const [id, scale] of Object.entries(pentatonicScales)) {
      const voice = findVoice(id);
      expect(voice.kind).toBe("progression");
      expect(voice.chords.length).toBeGreaterThan(1);
      // Gentle, slow ambient defaults.
      expect(voice.defaultMode).toBe("arpeggiated");
      expect(voice.defaultTempoBpm).toBeLessThanOrEqual(60);
      for (const chord of voice.chords) {
        const pitchClasses = chord.intervals.map(
          (semi) => (((voice.rootMidi + semi) % 12) + 12) % 12,
        );
        // Every tone lies on the pentatonic scale — no out-of-scale/semitone notes.
        for (const pc of pitchClasses) {
          expect(scale.has(pc)).toBe(true);
        }
        // No two distinct tones a semitone apart (open, clash-free voicing).
        const sorted = [...chord.intervals].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i] - sorted[i - 1]).not.toBe(1);
        }
      }
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

  it("defaults loop off for every voice so nothing loops unless opted in", () => {
    const settings = createDefaultChordSettings();
    for (const voice of CHORD_VOICES) {
      expect(settings[voice.id].loop).toBe(false);
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

describe("strumStepSec", () => {
  it("maps tempo onto the strum window, tightening as BPM rises", () => {
    // Slowest tempo => widest stroke; fastest => tightest.
    expect(strumStepSec(MIN_TEMPO_BPM)).toBeCloseTo(STRUM_MAX_STEP_SEC, 9);
    expect(strumStepSec(MAX_TEMPO_BPM)).toBeCloseTo(STRUM_MIN_STEP_SEC, 9);
    // Monotonically decreasing with tempo.
    expect(strumStepSec(60)).toBeGreaterThan(strumStepSec(120));
    expect(strumStepSec(120)).toBeGreaterThan(strumStepSec(200));
  });

  it("keeps every strum step inside the ~18–35 ms window", () => {
    for (const bpm of [MIN_TEMPO_BPM, 50, 72, 100, 132, 200, MAX_TEMPO_BPM]) {
      const step = strumStepSec(bpm);
      expect(step).toBeGreaterThanOrEqual(STRUM_MIN_STEP_SEC);
      expect(step).toBeLessThanOrEqual(STRUM_MAX_STEP_SEC);
    }
  });

  it("clamps out-of-range / NaN tempo like the rest of the model", () => {
    expect(strumStepSec(9999)).toBeCloseTo(STRUM_MIN_STEP_SEC, 9);
    expect(strumStepSec(1)).toBeCloseTo(STRUM_MAX_STEP_SEC, 9);
    expect(Number.isNaN(strumStepSec(Number.NaN))).toBe(false);
  });
});

describe("buildChordPlan — strum mode", () => {
  it("strikes a single chord low->high over a tight downstroke window", () => {
    const voice = findVoice("c-major"); // C4 triad, one 4-beat chord
    const settings = voiceSettings({ mode: "strum", tempoBpm: 60 });
    const events = buildChordPlan(voice, settings, 10);
    const strumStep = strumStepSec(60);

    expect(events).toHaveLength(3);
    // Notes are struck in ascending pitch order, each a tiny step later.
    expect(events[0].whenSec).toBeCloseTo(10, 9);
    expect(events[1].whenSec).toBeCloseTo(10 + strumStep, 9);
    expect(events[2].whenSec).toBeCloseTo(10 + 2 * strumStep, 9);
    // Low->high in both time and pitch.
    expect(events[0].whenSec).toBeLessThan(events[1].whenSec);
    expect(events[1].whenSec).toBeLessThan(events[2].whenSec);
    expect(events[0].hz).toBeLessThan(events[1].hz);
    expect(events[1].hz).toBeLessThan(events[2].hz);
    // Root stays loudest, like block/arp.
    expect(events[0].gain).toBe(1);
    expect(events[1].gain).toBe(0.8);
  });

  it("uses inter-note offsets far tighter than an arpeggio", () => {
    const voice = findVoice("c-major");
    const tempoBpm = 60;
    const beatSec = 60 / tempoBpm;
    const arpStepSec = ARP_STEP_BEATS * beatSec; // 0.5s at 60bpm

    const strum = buildChordPlan(
      voice,
      voiceSettings({ mode: "strum", tempoBpm }),
      0,
    );
    const strumGap = strum[1].whenSec - strum[0].whenSec;

    const arp = buildChordPlan(
      voice,
      voiceSettings({ mode: "arpeggiated", tempoBpm }),
      0,
    );
    const arpGap = arp[1].whenSec - arp[0].whenSec;

    expect(arpGap).toBeCloseTo(arpStepSec, 9);
    // The strum step is a small fraction of the arpeggio step.
    expect(strumGap).toBeLessThan(arpGap);
    expect(strumGap).toBeLessThan(arpGap / 5);
    expect(strumGap).toBeLessThanOrEqual(STRUM_MAX_STEP_SEC);
  });

  it("sustains each strummed note to the chord end, floored at one beat", () => {
    const voice = findVoice("c-major"); // 4-beat chord at 60bpm => 4s, 1s beat
    const events = buildChordPlan(
      voice,
      voiceSettings({ mode: "strum", tempoBpm: 60 }),
      0,
    );
    const strumStep = strumStepSec(60);
    expect(events[0].holdSec).toBeCloseTo(4, 9);
    expect(events[1].holdSec).toBeCloseTo(4 - strumStep, 9);
    expect(events[2].holdSec).toBeCloseTo(4 - 2 * strumStep, 9);
    for (const e of events) expect(e.holdSec).toBeGreaterThanOrEqual(1);
  });

  it("alternates downstroke/upstroke per chord in a progression", () => {
    const voice = findVoice("pop-I-V-vi-IV"); // 4 triads, 2 beats each @60bpm
    const settings = voiceSettings({ mode: "strum", tempoBpm: 60 });
    const events = buildChordPlan(voice, settings, 0);
    const strumStep = strumStepSec(60);

    // Group events into the four chords of three notes each, in push order
    // (which is always low->high by interval).
    const chords = [
      events.slice(0, 3),
      events.slice(3, 6),
      events.slice(6, 9),
      events.slice(9, 12),
    ];

    // Each chord still lands at its beat position: the earliest note of each
    // chord is exactly at 0, 2, 4, 6 seconds.
    const starts = chords.map((c) => Math.min(...c.map((e) => e.whenSec)));
    expect(starts).toEqual([0, 2, 4, 6]);

    // Even chords (0, 2) are downstrokes: lowest pitch struck first.
    for (const idx of [0, 2]) {
      const c = chords[idx];
      const base = idx * 2;
      expect(c[0].whenSec).toBeCloseTo(base, 9);
      expect(c[1].whenSec).toBeCloseTo(base + strumStep, 9);
      expect(c[2].whenSec).toBeCloseTo(base + 2 * strumStep, 9);
    }
    // Odd chords (1, 3) are upstrokes: highest pitch struck first, so the
    // lowest-pitch note (index 0 in push order) fires last.
    for (const idx of [1, 3]) {
      const c = chords[idx];
      const base = idx * 2;
      expect(c[2].whenSec).toBeCloseTo(base, 9); // top string first
      expect(c[1].whenSec).toBeCloseTo(base + strumStep, 9);
      expect(c[0].whenSec).toBeCloseTo(base + 2 * strumStep, 9); // low last
    }
  });

  it("tightens the strum as tempo rises but keeps ordering", () => {
    const voice = findVoice("c-major");
    const slow = buildChordPlan(
      voice,
      voiceSettings({ mode: "strum", tempoBpm: 60 }),
      0,
    );
    const fast = buildChordPlan(
      voice,
      voiceSettings({ mode: "strum", tempoBpm: 200 }),
      0,
    );
    const slowGap = slow[1].whenSec - slow[0].whenSec;
    const fastGap = fast[1].whenSec - fast[0].whenSec;
    expect(fastGap).toBeLessThan(slowGap);
    // Still a downstroke: ascending in time.
    expect(fast[0].whenSec).toBeLessThan(fast[2].whenSec);
  });

  it("is deterministic: identical inputs yield identical events", () => {
    const voice = findVoice("pop-I-V-vi-IV");
    const settings = voiceSettings({ mode: "strum", tempoBpm: 96 });
    const a = buildChordPlan(voice, settings, 5);
    const b = buildChordPlan(voice, settings, 5);
    expect(a).toEqual(b);
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

describe("chordPlanBeats", () => {
  it("sums each chord's beats, flooring each at a single beat", () => {
    expect(chordPlanBeats(findVoice("c-major"))).toBe(4); // one 4-beat chord
    expect(chordPlanBeats(findVoice("pop-I-V-vi-IV"))).toBe(8); // 4 * 2 beats
    expect(chordPlanBeats(findVoice("jazz-ii-V-I"))).toBe(8); // 2 + 2 + 4
    // Sub-beat chords floor to one beat, matching buildChordPlan's duration.
    const tiny: ChordVoiceDef = {
      ...findVoice("c-major"),
      chords: [{ intervals: [0, 4, 7], beats: 0.25 }],
    };
    expect(chordPlanBeats(tiny)).toBe(1);
  });
});

describe("chordLoopIntervalSec", () => {
  it("loops a single chord as a one-bar pulse on the BPM grid", () => {
    const voice = findVoice("c-major"); // one 4-beat chord === one bar
    // 60bpm => 1s/beat => one bar (4 beats) === 4s.
    expect(chordLoopIntervalSec(voice, voiceSettings({ tempoBpm: 60 }))).toBeCloseTo(
      4,
      9,
    );
    // 120bpm => 0.5s/beat => 2s.
    expect(
      chordLoopIntervalSec(voice, voiceSettings({ tempoBpm: 120 })),
    ).toBeCloseTo(2, 9);
  });

  it("loops a whole progression, quantized to bars", () => {
    const voice = findVoice("pop-I-V-vi-IV"); // 8 beats === 2 bars
    // 60bpm => 8 beats === 8s (already a whole number of bars, so gapless).
    expect(chordLoopIntervalSec(voice, voiceSettings({ tempoBpm: 60 }))).toBeCloseTo(
      8,
      9,
    );
  });

  it("rounds a partial-bar plan UP to the next bar (no overlap)", () => {
    const threeBeat: ChordVoiceDef = {
      ...findVoice("c-major"),
      chords: [{ intervals: [0, 4, 7], beats: 3 }], // 3 beats -> quantize to 4
    };
    // 60bpm => plan is 3s but the loop re-triggers on the 4s (one-bar) grid.
    expect(
      chordLoopIntervalSec(threeBeat, voiceSettings({ tempoBpm: 60 })),
    ).toBeCloseTo(4, 9);
  });

  it("never returns a shorter-than-plan interval (no overlap) and stays positive", () => {
    for (const voice of CHORD_VOICES) {
      for (const tempoBpm of [MIN_TEMPO_BPM, 60, 96, 132, MAX_TEMPO_BPM]) {
        const settings = voiceSettings({ tempoBpm, loop: true });
        const loopSec = chordLoopIntervalSec(voice, settings);
        expect(loopSec).toBeGreaterThan(0);
        // The loop length is >= the plan length, so an iteration never starts
        // before the previous one has finished playing.
        expect(loopSec + 1e-9).toBeGreaterThanOrEqual(
          chordPlanDurationSec(voice, settings),
        );
        // And it is a whole number of bars on the beat grid.
        const beatSec = 60 / tempoBpm;
        const beats = loopSec / beatSec;
        expect(beats % BEATS_PER_BAR).toBeCloseTo(0, 6);
      }
    }
  });

  it("is deterministic for identical inputs", () => {
    const voice = findVoice("canon-in-d");
    const settings = voiceSettings({ tempoBpm: 90, loop: true });
    expect(chordLoopIntervalSec(voice, settings)).toBe(
      chordLoopIntervalSec(voice, settings),
    );
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

  it("uses the bar-length loop interval when loop is on (ignores minutes)", () => {
    const voice = findVoice("c-major"); // one bar; 60bpm => 4s
    const settings = voiceSettings({ loop: true, tempoBpm: 60, intervalMin: 5 });
    // Loop on => +4s (a bar), NOT +300s (the 5-minute interval).
    expect(computeNextChordFire(100, settings, voice)).toBeCloseTo(104, 9);
  });

  it("falls back to the minutes interval when loop is on but no voice is given", () => {
    const settings = voiceSettings({ loop: true, intervalMin: 2 });
    expect(computeNextChordFire(100, settings)).toBe(100 + 120);
  });

  it("ignores loop-derived timing when loop is off even if a voice is given", () => {
    const voice = findVoice("c-major");
    const settings = voiceSettings({ loop: false, intervalMin: 2 });
    expect(computeNextChordFire(100, settings, voice)).toBe(100 + 120);
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

  it("reschedules a looping voice back-to-back on the bar grid, not the minutes interval", () => {
    const voice = findVoice("c-major"); // one bar; 60bpm => 4s per loop
    const lookup = (id: string) => (id === "c-major" ? voice : undefined);
    const settings = {
      "c-major": voiceSettings({ loop: true, tempoBpm: 60, intervalMin: 5 }),
    };
    // A 9s lookahead from t=100 with a 4s loop surfaces fires at 104 and 108,
    // then parks the schedule at 112 — a continuous 4s cadence, never +300s.
    const { events, schedule } = collectDueChordEvents(
      { "c-major": 104 },
      settings,
      100,
      9,
      lookup,
    );
    expect(events).toEqual([
      { voiceId: "c-major", whenSec: 104 },
      { voiceId: "c-major", whenSec: 108 },
    ]);
    expect(schedule["c-major"]).toBeCloseTo(112, 9);
  });

  it("keeps the minutes cadence for a non-looping voice even with a lookup", () => {
    const voice = findVoice("c-major");
    const lookup = (id: string) => (id === "c-major" ? voice : undefined);
    const settings = {
      "c-major": voiceSettings({ loop: false, intervalMin: 1 }),
    };
    const { schedule } = collectDueChordEvents(
      { "c-major": 100.2 },
      settings,
      100,
      0.5,
      lookup,
    );
    // Loop off => advance by the full 60s minutes interval, unchanged.
    expect(schedule["c-major"]).toBe(100.2 + 60);
  });
});
