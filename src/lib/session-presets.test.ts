import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDefaultAnnounceSettings } from "./announce";
import { createDefaultBreakSettings } from "./breaks";
import { createDefaultChordSettings } from "./chords";
import { createDefaultTodoCueSettings } from "./cue-sounds";
import { EQ_BAND_FREQUENCIES } from "./eq";
import { createDefaultMeditationSettings } from "./meditation";
import { createDefaultNoiseState } from "./noise";
import {
  DEFAULT_PRESET_NAME,
  PRESET_NAME_MAX_LEN,
  SESSION_PRESETS_STORAGE_KEY,
  SESSION_PRESET_SCHEMA_VERSION,
  addPreset,
  clampPresetName,
  createDefaultSessionSettings,
  createEmptyPresetsFile,
  deletePreset,
  deserializePresets,
  findPreset,
  generatePresetId,
  getPresetsServerSnapshot,
  getPresetsSnapshot,
  getSessionPresetsStorage,
  loadPresets,
  makePreset,
  migratePresetsFile,
  normalizePreset,
  normalizeSessionSettings,
  renamePreset,
  replacePresets,
  resetPresetsStore,
  savePresets,
  serializePresets,
  subscribePresets,
  updatePreset,
  type SessionSettings,
} from "./session-presets";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const store = { ...initial };
  return {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      for (const key of Object.keys(store)) delete store[key];
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    key(index: number) {
      return Object.keys(store)[index] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
}

function installLocalStorage(storage: Storage = memoryStorage()): Storage {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  return storage;
}

function removeLocalStorage(): void {
  Reflect.deleteProperty(globalThis, "localStorage");
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  resetPresetsStore();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  removeLocalStorage();
});

describe("createDefaultSessionSettings", () => {
  it("mirrors every createDefault* factory and mute off", () => {
    const s = createDefaultSessionSettings();
    expect(s.state).toEqual(createDefaultNoiseState());
    expect(s.meditation).toEqual(createDefaultMeditationSettings());
    expect(s.chords).toEqual(createDefaultChordSettings());
    expect(s.announce).toEqual(createDefaultAnnounceSettings());
    expect(s.breaks).toEqual(createDefaultBreakSettings());
    expect(s.todoCue).toEqual(createDefaultTodoCueSettings());
    expect(s.muteState).toBe("off");
  });
});

describe("normalizeSessionSettings", () => {
  it("returns full defaults for non-object input", () => {
    expect(normalizeSessionSettings(null)).toEqual(createDefaultSessionSettings());
    expect(normalizeSessionSettings("nope")).toEqual(
      createDefaultSessionSettings(),
    );
    expect(normalizeSessionSettings([1, 2])).toEqual(
      createDefaultSessionSettings(),
    );
  });

  it("round-trips a valid, fully-specified settings snapshot", () => {
    const custom: SessionSettings = {
      state: {
        color: "white",
        masterVolume: 0.42,
        eqCurve: EQ_BAND_FREQUENCIES.map((frequency) => ({ frequency, gainDb: 3 })),
      },
      meditation: {
        ...createDefaultMeditationSettings(),
        bell: {
          enabled: false,
          intervalMin: 12,
          jitter: true,
          syncToClock: true,
          volume: 0.3,
        },
      },
      chords: {
        ...createDefaultChordSettings(),
        "c-major": {
          enabled: false,
          mode: "arpeggiated",
          tempoBpm: 120,
          timbreId: "warm-pad",
          intervalMin: 5,
          volume: 0.33,
        },
      },
      announce: { enabled: true, intervalMin: 30, voiceId: "reed", volume: 0.7 },
      breaks: {
        ...createDefaultBreakSettings(),
        cueVolume: 0.9,
        snoozeMin: 10,
        notificationsEnabled: true,
      },
      todoCue: { enabled: false, soundId: "zen-bowl", volume: 0.8 },
      muteState: "except-todo",
    };
    expect(normalizeSessionSettings(custom)).toEqual(custom);
  });

  it("preserves the strum chord mode through normalization", () => {
    const s = normalizeSessionSettings({
      chords: { "c-major": { mode: "strum" } },
    });
    expect(s.chords["c-major"].mode).toBe("strum");
    // block and arpeggiated still survive too.
    expect(
      normalizeSessionSettings({ chords: { "c-major": { mode: "block" } } })
        .chords["c-major"].mode,
    ).toBe("block");
    expect(
      normalizeSessionSettings({
        chords: { "c-major": { mode: "arpeggiated" } },
      }).chords["c-major"].mode,
    ).toBe("arpeggiated");
  });

  it("clamps out-of-range numbers and rejects invalid enums per block", () => {
    const s = normalizeSessionSettings({
      state: { color: "chartreuse", masterVolume: 5, eqCurve: "bad" },
      meditation: { bell: { intervalMin: 9999, volume: 9 } },
      chords: { "c-major": { mode: "sideways", tempoBpm: 9999, timbreId: "kazoo" } },
      announce: { intervalMin: -4, voiceId: "elvis", volume: 12 },
      breaks: { types: { stretch: { intervalMin: 99999 } }, cueSoundId: "boom", snoozeMin: 999 },
      todoCue: { soundId: "airhorn", volume: -1 },
      muteState: "loud",
    });
    const noiseDef = createDefaultNoiseState();
    // Invalid color/eqCurve fall back; volume clamps to [0,1].
    expect(s.state.color).toBe(noiseDef.color);
    expect(s.state.eqCurve).toEqual(noiseDef.eqCurve);
    expect(s.state.masterVolume).toBe(1);
    // Clamped meditation interval + volume.
    expect(s.meditation.bell.intervalMin).toBe(120);
    expect(s.meditation.bell.volume).toBe(1);
    // Invalid chord enums fall back to defaults.
    const chordDef = createDefaultChordSettings()["c-major"];
    expect(s.chords["c-major"].mode).toBe(chordDef.mode);
    expect(s.chords["c-major"].timbreId).toBe(chordDef.timbreId);
    expect(s.chords["c-major"].tempoBpm).toBe(240);
    // Announce: bad interval → default; bad voice → default; volume clamps.
    const annDef = createDefaultAnnounceSettings();
    expect(s.announce.intervalMin).toBe(annDef.intervalMin);
    expect(s.announce.voiceId).toBe(annDef.voiceId);
    expect(s.announce.volume).toBe(1);
    // Breaks: bad cue sound → default; snooze clamps to max 60.
    const brkDef = createDefaultBreakSettings();
    expect(s.breaks.cueSoundId).toBe(brkDef.cueSoundId);
    expect(s.breaks.snoozeMin).toBe(60);
    expect(s.breaks.types.stretch.intervalMin).toBe(240);
    // Todo cue: bad sound → default; volume clamps to 0.
    expect(s.todoCue.soundId).toBe(createDefaultTodoCueSettings().soundId);
    expect(s.todoCue.volume).toBe(0);
    // Invalid mute → off.
    expect(s.muteState).toBe("off");
  });

  it("fills missing per-voice / per-break entries and keeps partial eq bands", () => {
    const s = normalizeSessionSettings({
      state: { eqCurve: [{ gainDb: 6 }] },
      meditation: { bell: "not-an-object" },
      chords: { "c-major": 42 },
      breaks: { types: "nope" },
      todoCue: 7,
    });
    // First band picked up from the partial array; rest default.
    expect(s.state.eqCurve[0].gainDb).toBe(6);
    expect(s.state.eqCurve[1]).toEqual(createDefaultNoiseState().eqCurve[1]);
    // Non-object voice/chord/break entries fall back to defaults.
    expect(s.meditation.bell).toEqual(createDefaultMeditationSettings().bell);
    expect(s.chords["c-major"]).toEqual(createDefaultChordSettings()["c-major"]);
    expect(s.breaks.types.stretch).toEqual(
      createDefaultBreakSettings().types.stretch,
    );
    expect(s.todoCue).toEqual(createDefaultTodoCueSettings());
  });

  it("keeps a valid custom break label and mute 'all'", () => {
    const s = normalizeSessionSettings({
      breaks: { types: { custom: { customLabel: "hydrate" } } },
      muteState: "all",
    });
    expect(s.breaks.types.custom.customLabel).toBe("hydrate");
    expect(s.muteState).toBe("all");
  });
});

describe("clampPresetName", () => {
  it("trims, defaults empties, and caps length", () => {
    expect(clampPresetName("  Focus  ")).toBe("Focus");
    expect(clampPresetName("   ")).toBe(DEFAULT_PRESET_NAME);
    expect(clampPresetName("")).toBe(DEFAULT_PRESET_NAME);
    expect(clampPresetName("x".repeat(200))).toHaveLength(PRESET_NAME_MAX_LEN);
  });

  it("defaults when passed a non-string (defensive)", () => {
    expect(clampPresetName(undefined as unknown as string)).toBe(
      DEFAULT_PRESET_NAME,
    );
  });
});

describe("generatePresetId", () => {
  it("uses crypto.randomUUID when available", () => {
    const spy = vi
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("11111111-1111-1111-1111-111111111111");
    expect(generatePresetId()).toBe("11111111-1111-1111-1111-111111111111");
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to a manual id when crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    expect(generatePresetId()).toMatch(/^preset-/);
  });

  it("falls back when randomUUID throws", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => {
        throw new Error("insecure context");
      },
    });
    expect(generatePresetId()).toMatch(/^preset-/);
  });
});

describe("makePreset / normalizePreset", () => {
  it("makePreset stamps an id, clamps the name, and normalizes settings", () => {
    const preset = makePreset("  My Mix  ", createDefaultSessionSettings());
    expect(preset.id).toBeTruthy();
    expect(preset.name).toBe("My Mix");
    expect(preset.settings).toEqual(createDefaultSessionSettings());
  });

  it("normalizePreset returns null for non-objects", () => {
    expect(normalizePreset(null)).toBeNull();
    expect(normalizePreset("x")).toBeNull();
  });

  it("normalizePreset keeps a valid id and generates one when missing", () => {
    const kept = normalizePreset({ id: "abc", name: "Keep", settings: {} });
    expect(kept?.id).toBe("abc");
    expect(kept?.name).toBe("Keep");
    expect(kept?.settings).toEqual(createDefaultSessionSettings());

    const generated = normalizePreset({ name: 123, settings: {} });
    expect(generated?.id).toBeTruthy();
    // Non-string name → default.
    expect(generated?.name).toBe(DEFAULT_PRESET_NAME);
  });
});

describe("migratePresetsFile", () => {
  it("returns an empty file for non-objects", () => {
    expect(migratePresetsFile(null)).toEqual(createEmptyPresetsFile());
    expect(migratePresetsFile(42)).toEqual(createEmptyPresetsFile());
  });

  it("drops non-object presets and normalizes the rest", () => {
    const file = migratePresetsFile({
      version: 0,
      presets: [
        { id: "a", name: "A", settings: {} },
        "garbage",
        null,
        99,
      ],
    });
    expect(file.version).toBe(SESSION_PRESET_SCHEMA_VERSION);
    expect(file.presets).toHaveLength(1);
    expect(file.presets[0].id).toBe("a");
  });

  it("treats a missing/invalid presets array as empty", () => {
    expect(migratePresetsFile({ version: 1 }).presets).toEqual([]);
    expect(migratePresetsFile({ presets: "nope" }).presets).toEqual([]);
  });
});

describe("serialize / deserialize", () => {
  it("round-trips a collection through JSON", () => {
    const presets = [makePreset("One", createDefaultSessionSettings())];
    const json = serializePresets(presets);
    expect(JSON.parse(json).version).toBe(SESSION_PRESET_SCHEMA_VERSION);
    expect(deserializePresets(json)).toEqual(presets);
  });

  it("deserializes empty / null / corrupt input to []", () => {
    expect(deserializePresets(null)).toEqual([]);
    expect(deserializePresets("")).toEqual([]);
    expect(deserializePresets("{not json")).toEqual([]);
  });
});

describe("getSessionPresetsStorage", () => {
  it("returns localStorage when available", () => {
    expect(getSessionPresetsStorage()).toBe(localStorage);
  });

  it("returns null when localStorage is undefined (SSR)", () => {
    removeLocalStorage();
    expect(getSessionPresetsStorage()).toBeNull();
  });

  it("returns null when localStorage access throws", () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    expect(getSessionPresetsStorage()).toBeNull();
  });
});

describe("loadPresets / savePresets", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const presets = [makePreset("Alpha", createDefaultSessionSettings())];
    savePresets(presets, storage);
    expect(loadPresets(storage)).toEqual(presets);
  });

  it("returns [] when storage is null or the key is absent", () => {
    expect(loadPresets(null)).toEqual([]);
    expect(loadPresets(memoryStorage())).toEqual([]);
  });

  it("returns [] on corrupt stored JSON", () => {
    const storage = memoryStorage({ [SESSION_PRESETS_STORAGE_KEY]: "{bad" });
    expect(loadPresets(storage)).toEqual([]);
  });

  it("returns [] when getItem throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("boom");
      },
    };
    expect(loadPresets(storage)).toEqual([]);
  });

  it("no-ops save when storage is null and swallows setItem failures", () => {
    expect(() => savePresets([], null)).not.toThrow();
    const storage = {
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => savePresets([], storage)).not.toThrow();
  });

  it("uses the default storage helper when omitted", () => {
    const presets = [makePreset("Default", createDefaultSessionSettings())];
    savePresets(presets);
    expect(loadPresets()).toEqual(presets);
  });
});

describe("pure CRUD", () => {
  const a = makePreset("A", createDefaultSessionSettings());
  const b = makePreset("B", createDefaultSessionSettings());

  it("adds a preset without mutating the source", () => {
    const list = [a];
    const next = addPreset(list, b);
    expect(next).toEqual([a, b]);
    expect(list).toEqual([a]);
  });

  it("updates the matching preset's settings and leaves others", () => {
    const changed: SessionSettings = {
      ...createDefaultSessionSettings(),
      muteState: "all",
    };
    const next = updatePreset([a, b], a.id, changed);
    expect(next[0].settings.muteState).toBe("all");
    expect(next[1]).toEqual(b);
  });

  it("update is a no-op when the id is absent", () => {
    expect(updatePreset([a], "missing", createDefaultSessionSettings())).toEqual([
      a,
    ]);
  });

  it("renames the matching preset (clamped) and no-ops when absent", () => {
    expect(renamePreset([a, b], b.id, "  Bee  ")[1].name).toBe("Bee");
    expect(renamePreset([a], "missing", "X")).toEqual([a]);
  });

  it("deletes the matching preset", () => {
    expect(deletePreset([a, b], a.id)).toEqual([b]);
    expect(deletePreset([a], "missing")).toEqual([a]);
  });

  it("finds a preset by id", () => {
    expect(findPreset([a, b], b.id)).toBe(b);
    expect(findPreset([a, b], "missing")).toBeUndefined();
  });
});

describe("presets store", () => {
  it("hydrates the snapshot from storage and serves a stable reference", () => {
    const preset = makePreset("Stored", createDefaultSessionSettings());
    localStorage.setItem(
      SESSION_PRESETS_STORAGE_KEY,
      serializePresets([preset]),
    );
    const first = getPresetsSnapshot();
    expect(first).toEqual([preset]);
    // Repeated reads without a mutation return the identical reference.
    expect(getPresetsSnapshot()).toBe(first);
  });

  it("server snapshot is a stable, frozen empty reference", () => {
    const a = getPresetsServerSnapshot();
    const b = getPresetsServerSnapshot();
    expect(a).toBe(b);
    expect(a).toEqual([]);
    expect(Object.isFrozen(a)).toBe(true);
  });

  it("replacePresets persists, notifies, and swaps the cached reference", () => {
    const before = getPresetsSnapshot();
    const listener = vi.fn();
    const unsubscribe = subscribePresets(listener);

    const next = [makePreset("New", createDefaultSessionSettings())];
    replacePresets(next);

    expect(listener).toHaveBeenCalledTimes(1);
    const afterMutation = getPresetsSnapshot();
    expect(afterMutation).toBe(next);
    expect(afterMutation).not.toBe(before);
    // Persisted so a fresh load sees it.
    expect(loadPresets()).toEqual(next);

    unsubscribe();
    replacePresets([]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
