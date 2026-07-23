/**
 * Whole-session presets (#6). A preset captures the serializable session
 * *settings* — noise (color/EQ/volume), meditation, chords, announcements,
 * break prompts, ToDo-reminder cue, and mute state — under a named, versioned
 * schema so a favorite combination can be restored in one action.
 *
 * Pure and framework-free: (de)serialize / validate / migrate + CRUD over the
 * presets collection, plus an SSR-safe localStorage helper. Mirrors the
 * offline-first pattern of break-tallies / break-daily-goal (relaxanator.*
 * key, `typeof localStorage === "undefined"` guard, graceful fallback on
 * corrupt/absent data). Runtime/session data (playback on/off, glow, active
 * breaks, sleep timer, tallies, daily goal, ToDo item list) is deliberately
 * excluded — see the issue-#6 xBRIEF Assumptions.
 */

import {
  type AnnounceSettings,
  ANNOUNCE_VOICES,
  createDefaultAnnounceSettings,
} from "./announce";
import {
  type BreakKind,
  type BreakSettings,
  type BreakTypeSettings,
  BREAK_TYPES,
  clampBreakIntervalMin,
  clampSnoozeMin,
  createDefaultBreakSettings,
} from "./breaks";
import {
  type ChordSettings,
  clampChordIntervalMin,
  clampTempoBpm,
  createDefaultChordSettings,
  isChordTimbreId,
} from "./chords";
import {
  type CueSoundId,
  CUE_SOUNDS,
  type TodoCueSettings,
  clampCueVolume,
  createDefaultTodoCueSettings,
} from "./cue-sounds";
import { type EqBand, EQ_BAND_FREQUENCIES, clampGainDb } from "./eq";
import {
  type MeditationSettings,
  clampIntervalMin,
  createDefaultMeditationSettings,
} from "./meditation";
import { type MuteState } from "./mute";
import {
  type NoiseColor,
  type NoiseState,
  NOISE_COLORS,
  clampVolume,
  createDefaultNoiseState,
} from "./noise";

export const SESSION_PRESETS_STORAGE_KEY = "relaxanator.sessionPresets";

/** Bump when the persisted shape changes; drives forward migration. */
export const SESSION_PRESET_SCHEMA_VERSION = 1;

export const PRESET_NAME_MAX_LEN = 60;
export const DEFAULT_PRESET_NAME = "Untitled preset";

/** The serializable settings blocks a preset captures (FR-1). */
export interface SessionSettings {
  state: NoiseState;
  meditation: MeditationSettings;
  chords: ChordSettings;
  announce: AnnounceSettings;
  breaks: BreakSettings;
  todoCue: TodoCueSettings;
  muteState: MuteState;
}

/** A named preset: a stable id, a display name, and the captured settings. */
export interface SessionPreset {
  id: string;
  name: string;
  settings: SessionSettings;
}

/** The versioned on-disk shape persisted under {@link SESSION_PRESETS_STORAGE_KEY}. */
export interface SessionPresetsFile {
  version: number;
  presets: SessionPreset[];
}

/* ------------------------------------------------------------------ *
 * Small defensive coercion helpers
 * ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Finite number → clamp; anything else → fallback. */
function num(
  value: unknown,
  fallback: number,
  clamp: (n: number) => number = (n) => n,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clamp(value)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isNoiseColor(value: unknown): value is NoiseColor {
  return typeof value === "string" && NOISE_COLORS.some((c) => c.id === value);
}

function isAnnounceVoiceId(value: unknown): value is string {
  return typeof value === "string" && ANNOUNCE_VOICES.some((v) => v.id === value);
}

function isCueSoundId(value: unknown): value is CueSoundId {
  return typeof value === "string" && CUE_SOUNDS.some((c) => c.id === value);
}

/* ------------------------------------------------------------------ *
 * Per-block normalizers — unknown/corrupt input falls back to defaults
 * ------------------------------------------------------------------ */

function normalizeEqCurve(raw: unknown, fallback: EqBand[]): EqBand[] {
  if (!Array.isArray(raw)) return fallback;
  // Rebuild from the canonical band frequencies so the curve stays well-formed
  // even if the stored array is partial, reordered, or has stray entries.
  return EQ_BAND_FREQUENCIES.map((frequency, i) => {
    const band = raw[i];
    const gainDb = isPlainObject(band)
      ? num(band.gainDb, fallback[i].gainDb, clampGainDb)
      : fallback[i].gainDb;
    return { frequency, gainDb };
  });
}

function normalizeNoiseState(raw: unknown): NoiseState {
  const def = createDefaultNoiseState();
  if (!isPlainObject(raw)) return def;
  return {
    color: isNoiseColor(raw.color) ? raw.color : def.color,
    masterVolume: num(raw.masterVolume, def.masterVolume, clampVolume),
    eqCurve: normalizeEqCurve(raw.eqCurve, def.eqCurve),
  };
}

function normalizeMeditation(raw: unknown): MeditationSettings {
  const def = createDefaultMeditationSettings();
  if (!isPlainObject(raw)) return def;
  const out: MeditationSettings = {};
  for (const [id, dv] of Object.entries(def)) {
    const rv = raw[id];
    if (!isPlainObject(rv)) {
      out[id] = dv;
      continue;
    }
    out[id] = {
      enabled: bool(rv.enabled, dv.enabled),
      intervalMin: num(rv.intervalMin, dv.intervalMin, clampIntervalMin),
      jitter: bool(rv.jitter, dv.jitter),
      syncToClock: bool(rv.syncToClock, dv.syncToClock),
      volume: num(rv.volume, dv.volume, clampVolume),
    };
  }
  return out;
}

function normalizeChords(raw: unknown): ChordSettings {
  const def = createDefaultChordSettings();
  if (!isPlainObject(raw)) return def;
  const out: ChordSettings = {};
  for (const [id, dv] of Object.entries(def)) {
    const rv = raw[id];
    if (!isPlainObject(rv)) {
      out[id] = dv;
      continue;
    }
    const timbre = rv.timbreId;
    out[id] = {
      enabled: bool(rv.enabled, dv.enabled),
      mode:
        rv.mode === "arpeggiated" || rv.mode === "block" || rv.mode === "strum"
          ? rv.mode
          : dv.mode,
      tempoBpm: num(rv.tempoBpm, dv.tempoBpm, clampTempoBpm),
      timbreId:
        typeof timbre === "string" && isChordTimbreId(timbre)
          ? timbre
          : dv.timbreId,
      intervalMin: num(rv.intervalMin, dv.intervalMin, clampChordIntervalMin),
      volume: num(rv.volume, dv.volume, clampVolume),
    };
  }
  return out;
}

function normalizeAnnounce(raw: unknown): AnnounceSettings {
  const def = createDefaultAnnounceSettings();
  if (!isPlainObject(raw)) return def;
  return {
    enabled: bool(raw.enabled, def.enabled),
    intervalMin: num(raw.intervalMin, def.intervalMin, (n) =>
      n > 0 ? n : def.intervalMin,
    ),
    voiceId: isAnnounceVoiceId(raw.voiceId) ? raw.voiceId : def.voiceId,
    volume: num(raw.volume, def.volume, clampVolume),
  };
}

function normalizeBreaks(raw: unknown): BreakSettings {
  const def = createDefaultBreakSettings();
  if (!isPlainObject(raw)) return def;
  const rawTypes = isPlainObject(raw.types) ? raw.types : {};
  const types = {} as Record<BreakKind, BreakTypeSettings>;
  for (const t of BREAK_TYPES) {
    const dv = def.types[t.id];
    const rv = rawTypes[t.id];
    if (!isPlainObject(rv)) {
      types[t.id] = dv;
      continue;
    }
    types[t.id] = {
      enabled: bool(rv.enabled, dv.enabled),
      intervalMin: num(rv.intervalMin, dv.intervalMin, clampBreakIntervalMin),
      customLabel:
        typeof rv.customLabel === "string" ? rv.customLabel : dv.customLabel,
    };
  }
  return {
    types,
    cueSoundId: isCueSoundId(raw.cueSoundId) ? raw.cueSoundId : def.cueSoundId,
    cueVolume: num(raw.cueVolume, def.cueVolume, clampCueVolume),
    snoozeMin: num(raw.snoozeMin, def.snoozeMin, clampSnoozeMin),
    notificationsEnabled: bool(raw.notificationsEnabled, def.notificationsEnabled),
  };
}

function normalizeTodoCue(raw: unknown): TodoCueSettings {
  const def = createDefaultTodoCueSettings();
  if (!isPlainObject(raw)) return def;
  return {
    enabled: bool(raw.enabled, def.enabled),
    soundId: isCueSoundId(raw.soundId) ? raw.soundId : def.soundId,
    volume: num(raw.volume, def.volume, clampCueVolume),
  };
}

function normalizeMuteState(raw: unknown): MuteState {
  return raw === "all" || raw === "except-todo" ? raw : "off";
}

/* ------------------------------------------------------------------ *
 * Settings + preset construction / validation
 * ------------------------------------------------------------------ */

/** A full settings snapshot at app defaults — the fallback for corrupt data. */
export function createDefaultSessionSettings(): SessionSettings {
  return {
    state: createDefaultNoiseState(),
    meditation: createDefaultMeditationSettings(),
    chords: createDefaultChordSettings(),
    announce: createDefaultAnnounceSettings(),
    breaks: createDefaultBreakSettings(),
    todoCue: createDefaultTodoCueSettings(),
    muteState: "off",
  };
}

/**
 * Coerce arbitrary parsed data into a well-formed {@link SessionSettings}.
 * Each block validates independently; missing/corrupt blocks or fields fall
 * back to their `createDefault*` values so a loaded preset never carries an
 * invalid shape into the engines.
 */
export function normalizeSessionSettings(raw: unknown): SessionSettings {
  if (!isPlainObject(raw)) return createDefaultSessionSettings();
  return {
    state: normalizeNoiseState(raw.state),
    meditation: normalizeMeditation(raw.meditation),
    chords: normalizeChords(raw.chords),
    announce: normalizeAnnounce(raw.announce),
    breaks: normalizeBreaks(raw.breaks),
    todoCue: normalizeTodoCue(raw.todoCue),
    muteState: normalizeMuteState(raw.muteState),
  };
}

/** Trim, collapse-empty → default, and cap the length of a preset name. */
export function clampPresetName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0) return DEFAULT_PRESET_NAME;
  return trimmed.slice(0, PRESET_NAME_MAX_LEN);
}

/** A collision-resistant preset id; falls back when crypto is unavailable. */
export function generatePresetId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // Fall through to the manual id below.
    }
  }
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Build a new preset from a name + settings (id generated, both normalized). */
export function makePreset(name: string, settings: SessionSettings): SessionPreset {
  return {
    id: generatePresetId(),
    name: clampPresetName(name),
    settings: normalizeSessionSettings(settings),
  };
}

/** Validate one parsed preset; returns null when it is not an object at all. */
export function normalizePreset(raw: unknown): SessionPreset | null {
  if (!isPlainObject(raw)) return null;
  const id =
    typeof raw.id === "string" && raw.id.length > 0 ? raw.id : generatePresetId();
  const name = clampPresetName(typeof raw.name === "string" ? raw.name : DEFAULT_PRESET_NAME);
  return { id, name, settings: normalizeSessionSettings(raw.settings) };
}

export function createEmptyPresetsFile(): SessionPresetsFile {
  return { version: SESSION_PRESET_SCHEMA_VERSION, presets: [] };
}

/**
 * Migrate an arbitrary parsed file to the current schema. The stored `version`
 * is the forward-migration hook: today only v1 exists, and every preset is
 * normalized field-by-field, so both older and newer/unknown files degrade
 * gracefully to a valid current-shape collection.
 */
export function migratePresetsFile(raw: unknown): SessionPresetsFile {
  if (!isPlainObject(raw)) return createEmptyPresetsFile();
  const rawPresets = Array.isArray(raw.presets) ? raw.presets : [];
  const presets = rawPresets
    .map((p) => normalizePreset(p))
    .filter((p): p is SessionPreset => p !== null);
  return { version: SESSION_PRESET_SCHEMA_VERSION, presets };
}

export function serializePresets(presets: SessionPreset[]): string {
  return JSON.stringify({ version: SESSION_PRESET_SCHEMA_VERSION, presets });
}

export function deserializePresets(raw: string | null): SessionPreset[] {
  if (!raw) return [];
  try {
    return migratePresetsFile(JSON.parse(raw)).presets;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ *
 * SSR-safe persistence
 * ------------------------------------------------------------------ */

/** Resolve localStorage when available; null in SSR / restricted contexts. */
export function getSessionPresetsStorage(): Pick<
  Storage,
  "getItem" | "setItem"
> | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function loadPresets(
  storage: Pick<Storage, "getItem"> | null = getSessionPresetsStorage(),
): SessionPreset[] {
  if (!storage) return [];
  try {
    return deserializePresets(storage.getItem(SESSION_PRESETS_STORAGE_KEY));
  } catch {
    return [];
  }
}

export function savePresets(
  presets: SessionPreset[],
  storage: Pick<Storage, "setItem"> | null = getSessionPresetsStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SESSION_PRESETS_STORAGE_KEY, serializePresets(presets));
  } catch {
    // Quota / private mode — keep the in-memory collection usable.
  }
}

/* ------------------------------------------------------------------ *
 * Pure CRUD over a presets collection
 * ------------------------------------------------------------------ */

/** Append a preset to the collection (returns a new array). */
export function addPreset(
  presets: SessionPreset[],
  preset: SessionPreset,
): SessionPreset[] {
  return [...presets, preset];
}

/** Overwrite the settings of the preset with `id` (no-op if absent). */
export function updatePreset(
  presets: SessionPreset[],
  id: string,
  settings: SessionSettings,
): SessionPreset[] {
  return presets.map((p) =>
    p.id === id ? { ...p, settings: normalizeSessionSettings(settings) } : p,
  );
}

/** Rename the preset with `id` (name clamped; no-op if absent). */
export function renamePreset(
  presets: SessionPreset[],
  id: string,
  name: string,
): SessionPreset[] {
  return presets.map((p) =>
    p.id === id ? { ...p, name: clampPresetName(name) } : p,
  );
}

/** Remove the preset with `id` (returns a new array). */
export function deletePreset(
  presets: SessionPreset[],
  id: string,
): SessionPreset[] {
  return presets.filter((p) => p.id !== id);
}

/** Look up a preset by id. */
export function findPreset(
  presets: SessionPreset[],
  id: string,
): SessionPreset | undefined {
  return presets.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ *
 * useSyncExternalStore-friendly store (mirrors break-tallies / todos)
 * ------------------------------------------------------------------ */

const listeners = new Set<() => void>();
let memoryCache: SessionPreset[] | null = null;

/**
 * Stable, frozen empty snapshot for SSR/hydration. A module-level constant (not
 * a fresh array each call) keeps the `useSyncExternalStore` server snapshot
 * referentially stable, avoiding the "getServerSnapshot should be cached"
 * warning.
 */
const EMPTY_PRESETS: SessionPreset[] = [];
Object.freeze(EMPTY_PRESETS);

/** useSyncExternalStore subscribe — notifies on in-app preset mutations. */
export function subscribePresets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Client snapshot: hydrate from storage once, then serve the memory cache. */
export function getPresetsSnapshot(): SessionPreset[] {
  if (!memoryCache) {
    memoryCache = loadPresets();
  }
  return memoryCache;
}

export function getPresetsServerSnapshot(): SessionPreset[] {
  return EMPTY_PRESETS;
}

function emitPresets(): void {
  for (const listener of listeners) listener();
}

/** Replace the whole collection: persist + notify subscribers. */
export function replacePresets(next: SessionPreset[]): void {
  memoryCache = next;
  savePresets(next);
  emitPresets();
}

/** Test helper — clears the in-memory cache between cases. */
export function resetPresetsStore(): void {
  memoryCache = null;
}
