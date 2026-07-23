"use client";

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { AnnounceEngine } from "@/audio/announce-engine";
import { unlockAudioContext } from "@/audio/audio-unlock";
import { BreakEngine } from "@/audio/break-engine";
import { ChordsEngine } from "@/audio/chords-engine";
import { MeditationEngine } from "@/audio/meditation-engine";
import { NoiseEngine } from "@/audio/noise-engine";
import {
  type EqBand,
  EQ_GAIN_MAX_DB,
  EQ_GAIN_MIN_DB,
  formatFrequency,
  withBandGain,
} from "@/lib/eq";
import {
  type AnnounceSettings,
  createDefaultAnnounceSettings,
} from "@/lib/announce";
import {
  type BreakKind,
  type BreakSettings,
  type BreakTypeSettings,
  createDefaultBreakSettings,
} from "@/lib/breaks";
import {
  requestNotificationPermission,
} from "@/lib/break-notifications";
import {
  getBreakDailyGoalServerSnapshot,
  getBreakDailyGoalSnapshot,
  setBreakDailyGoal,
  subscribeBreakDailyGoal,
} from "@/lib/break-daily-goal";
import {
  clearAllBreakTallies,
  clearBreakTally,
  getBreakTalliesServerSnapshot,
  getBreakTalliesSnapshot,
  incrementBreakTally,
  subscribeBreakTallies,
  updateBreakTallies,
} from "@/lib/break-tallies";
import {
  type ChordSettings,
  type ChordVoiceSettings,
  createDefaultChordSettings,
} from "@/lib/chords";
import {
  type MeditationSettings,
  type VoiceSettings,
  createDefaultMeditationSettings,
} from "@/lib/meditation";
import {
  GLOW_DURATION_MS,
  type GlowState,
  pruneGlow,
  triggerGlow,
} from "@/lib/sound-glow";
import {
  NOISE_COLORS,
  type NoiseColor,
  clampVolume,
  createDefaultNoiseState,
  eqCurveForColor,
} from "@/lib/noise";
import {
  SLEEP_FADE_SEC,
  SLEEP_TIMER_OFF,
  SLEEP_TIMER_PRESETS,
  type SleepTimer,
  armSleepTimer,
  clampSleepMinutes,
  fadeRemainingSec,
  formatCountdown,
  isElapsed,
  isFading,
  isSleepPreset,
  sleepRemainingSec,
} from "@/lib/sleep-timer";

import {
  type ActiveBreak,
  pushActiveBreak,
  removeActiveBreak,
} from "@/lib/break-banner-stack";
import {
  TODO_SNOOZE_MIN,
  addTodo,
  dismissTodo,
  getTodosServerSnapshot,
  getTodosSnapshot,
  listActiveTodoReminders,
  patchTodo,
  removeTodo,
  snoozeTodo,
  subscribeTodos,
} from "@/lib/todos";
import {
  type TodoCueSettings,
  clampCueVolume,
  createDefaultTodoCueSettings,
} from "@/lib/cue-sounds";
import {
  type MuteState,
  isExceptTodoActive,
  isMuteAllActive,
  muteGains,
  toggleMuteAll,
  toggleMuteExceptTodo,
} from "@/lib/mute";
import { playCueSound } from "@/audio/cue-sounds";
import {
  type SessionPreset,
  type SessionSettings,
  addPreset,
  deletePreset,
  findPreset,
  getPresetsServerSnapshot,
  getPresetsSnapshot,
  makePreset,
  renamePreset,
  replacePresets,
  subscribePresets,
  updatePreset,
} from "@/lib/session-presets";

import AboutDialog from "./AboutDialog";
import { BreakBannerStack } from "./BreakBanner";
import BreakPanel from "./BreakPanel";
import ChordsPanel from "./ChordsPanel";
import MeditationPanel from "./MeditationPanel";
import PresetsPanel from "./PresetsPanel";
import TimeAnnouncePanel from "./TimeAnnouncePanel";
import TodoPanel from "./TodoPanel";
import { TodoReminderStack } from "./TodoReminderBanner";

/** Sleep-timer pump cadence — reads the audio clock to drive fade + stop. */
const SLEEP_PUMP_MS = 250;
/** Poll clock so ToDo reminders appear when local time crosses due. */
const TODO_REMINDER_POLL_MS = 15_000;

export default function NoisePlayer() {
  const engineRef = useRef<NoiseEngine | null>(null);
  const meditationRef = useRef<MeditationEngine | null>(null);
  const chordsRef = useRef<ChordsEngine | null>(null);
  const announceRef = useRef<AnnounceEngine | null>(null);
  const breakRef = useRef<BreakEngine | null>(null);
  const [state, setState] = useState(createDefaultNoiseState);
  const [meditation, setMeditation] = useState<MeditationSettings>(
    createDefaultMeditationSettings,
  );
  const [chords, setChords] = useState<ChordSettings>(createDefaultChordSettings);
  /** Transient per-row "just played" glow state, keyed by voiceId (#104). */
  const [medGlow, setMedGlow] = useState<GlowState>({});
  const [chordGlow, setChordGlow] = useState<GlowState>({});
  const [announce, setAnnounce] = useState<AnnounceSettings>(
    createDefaultAnnounceSettings,
  );
  const [breaks, setBreaks] = useState<BreakSettings>(createDefaultBreakSettings);
  const [activeBreaks, setActiveBreaks] = useState<ActiveBreak[]>([]);
  const [notificationHint, setNotificationHint] = useState<string | undefined>();
  const breakTallies = useSyncExternalStore(
    subscribeBreakTallies,
    getBreakTalliesSnapshot,
    getBreakTalliesServerSnapshot,
  );
  const breakDailyGoal = useSyncExternalStore(
    subscribeBreakDailyGoal,
    getBreakDailyGoalSnapshot,
    getBreakDailyGoalServerSnapshot,
  );
  const todos = useSyncExternalStore(
    subscribeTodos,
    getTodosSnapshot,
    getTodosServerSnapshot,
  );
  const [todoClockMs, setTodoClockMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setTodoClockMs(Date.now());
    }, TODO_REMINDER_POLL_MS);
    return () => window.clearInterval(id);
  }, []);
  const activeTodoReminders = listActiveTodoReminders(todos, todoClockMs);
  const [todoCue, setTodoCue] = useState<TodoCueSettings>(
    createDefaultTodoCueSettings,
  );
  const [muteState, setMuteState] = useState<MuteState>("off");
  // Whole-session presets (#6). Read via useSyncExternalStore so the list stays
  // SSR-safe (empty server snapshot, localStorage-hydrated client snapshot) and
  // consistent with the tallies / todos stores.
  const presets = useSyncExternalStore(
    subscribePresets,
    getPresetsSnapshot,
    getPresetsServerSnapshot,
  );
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetNameInput, setPresetNameInput] = useState("");
  /** Read in ensureEngines so a mute set before playback applies on start. */
  const muteStateRef = useRef(muteState);
  useEffect(() => {
    muteStateRef.current = muteState;
  }, [muteState]);
  /** Reminder keys (id:dueAt) already sounded, so each due fires the cue once. */
  const cuedTodoKeysRef = useRef<Set<string>>(new Set());
  const activeTodoCueKey = activeTodoReminders
    .map((r) => `${r.item.id}:${r.dueAt}`)
    .join("|");
  useEffect(() => {
    const keys = activeTodoCueKey ? activeTodoCueKey.split("|") : [];
    const activeSet = new Set(keys);
    // Drop keys no longer active so a re-due reminder (e.g. after snooze) re-fires.
    for (const key of [...cuedTodoKeysRef.current]) {
      if (!activeSet.has(key)) cuedTodoKeysRef.current.delete(key);
    }
    if (!todoCue.enabled) return;
    const ctx = engineRef.current?.context;
    // Dedicated bus so ToDo cues survive "Mute All But ToDo Reminders" (#97).
    const bus = engineRef.current?.todoCueBus;
    // Cue only while audio is actually running — matches break-cue behavior.
    if (!ctx || !bus || ctx.state !== "running") return;
    let hasNew = false;
    for (const key of keys) {
      if (cuedTodoKeysRef.current.has(key)) continue;
      cuedTodoKeysRef.current.add(key);
      hasNew = true;
    }
    // One cue per batch of newly-due reminders — avoids stacked cacophony.
    if (hasNew) {
      playCueSound(todoCue.soundId, ctx, bus, ctx.currentTime, todoCue.volume);
    }
  }, [activeTodoCueKey, todoCue.enabled, todoCue.soundId, todoCue.volume]);
  const announceSettingsRef = useRef(announce);
  const meditationSettingsRef = useRef(meditation);
  const chordsSettingsRef = useRef(chords);
  const breakSettingsRef = useRef(breaks);
  useEffect(() => {
    announceSettingsRef.current = announce;
  }, [announce]);
  useEffect(() => {
    meditationSettingsRef.current = meditation;
  }, [meditation]);
  useEffect(() => {
    chordsSettingsRef.current = chords;
  }, [chords]);
  useEffect(() => {
    breakSettingsRef.current = breaks;
  }, [breaks]);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  /** Sync guard — React state `starting` is stale across concurrent ensureEngines calls. */
  const startingRef = useRef(false);
  /** Bumped when AudioContext engines are first created — wires recovery listeners. */
  const [audioEpoch, setAudioEpoch] = useState(0);
  const [sleepMinutes, setSleepMinutes] = useState(SLEEP_TIMER_OFF);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

  /** About modal (#134) — open state + trigger for focus return on close. */
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);

  function closeAbout() {
    setAboutOpen(false);
    // Return focus to the trigger that opened the dialog (FR-4).
    aboutTriggerRef.current?.focus();
  }

  // Escape-to-close while the About modal is open (FR-4). Listener is added
  // only while open so it never intercepts keys during normal use.
  useEffect(() => {
    if (!aboutOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAboutOpen(false);
        aboutTriggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [aboutOpen]);

  const sleepTimerRef = useRef<SleepTimer | null>(null);
  const sleepPumpRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sleepFadedRef = useRef(false);

  const clearSleepTimer = () => {
    if (sleepPumpRef.current) clearInterval(sleepPumpRef.current);
    sleepPumpRef.current = null;
    sleepTimerRef.current = null;
    sleepFadedRef.current = false;
    setSleepRemaining(null);
  };

  useEffect(() => {
    return () => {
      if (sleepPumpRef.current) clearInterval(sleepPumpRef.current);
      breakRef.current?.stop();
      breakRef.current = null;
      announceRef.current?.stop();
      announceRef.current = null;
      meditationRef.current?.stop();
      meditationRef.current = null;
      chordsRef.current?.stop();
      chordsRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  /**
   * Light a row's glow now and schedule a prune once it has fully faded, so a
   * re-trigger refreshes (rather than stacks) the effect (#104). Called from
   * each engine's onFire, which the engine defers to the audio-heard time.
   */
  function flashVoice(
    setGlow: Dispatch<SetStateAction<GlowState>>,
    voiceId: string,
  ) {
    setGlow((g) => triggerGlow(g, voiceId, Date.now()));
    window.setTimeout(() => {
      setGlow((g) => pruneGlow(g, Date.now()));
    }, GLOW_DURATION_MS + 50);
  }

  /**
   * Tab foreground / AudioContext wake: wall time advanced while timers were
   * throttled or the context was interrupted — re-map the next announce
   * boundary onto the live audio clock (#47).
   */
  useEffect(() => {
    const resyncIfRunning = () => {
      const ctx = engineRef.current?.context;
      if (ctx?.state === "running") {
        announceRef.current?.resync();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const engine = engineRef.current;
      const ctx = engine?.context;
      if (!ctx) return;
      void (async () => {
        // Only force-resume on tab focus while the UI thinks we're playing —
        // never from statechange, or an intentional Pause would immediately
        // fight itself back to running.
        if (ctx.state !== "running" && playing) {
          await engine.resume();
        }
        resyncIfRunning();
      })();
    };

    document.addEventListener("visibilitychange", onVisibility);
    const ctx = engineRef.current?.context;
    ctx?.addEventListener("statechange", resyncIfRunning);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      ctx?.removeEventListener("statechange", resyncIfRunning);
    };
  }, [playing, audioEpoch]);

  /**
   * iOS Safari (#83): if a context already exists, kick unlock *synchronously*
   * at the top of the gesture before any await. Fresh init() does the same
   * inside NoiseEngine before addModule.
   */
  function unlockExistingContextSync(): void {
    const ctx = engineRef.current?.context;
    if (ctx) void unlockAudioContext(ctx);
  }

  async function ensureEngines(): Promise<NoiseEngine | null> {
    if (engineRef.current) {
      unlockExistingContextSync();
      return engineRef.current;
    }
    // Prefer the ref over React state — two callers in the same tick both see
    // starting===false before setStarting flushes, and would otherwise each
    // construct an AnnounceEngine (dual pumps → double-fire, #73).
    if (startingRef.current) return null;
    startingRef.current = true;
    setStarting(true);
    try {
      const engine = new NoiseEngine();
      await engine.init(state);
      engineRef.current = engine;
      if (engine.context && engine.mixBus && engine.announceBus) {
        // Resume settled after init's sync unlock; prime cold graph edges.
        await engine.resume();
        engine.primeAudioOutput();
        // Apply any mute set before playback started.
        const g = muteGains(muteStateRef.current);
        engine.setMuteGains(g.output, g.mainGroup);

        const meditationEngine = new MeditationEngine(
          engine.context,
          engine.mixBus,
          meditationSettingsRef.current,
        );
        meditationEngine.setOnFire(({ voiceId }) =>
          flashVoice(setMedGlow, voiceId),
        );
        meditationEngine.start();
        meditationRef.current = meditationEngine;

        const chordsEngine = new ChordsEngine(
          engine.context,
          engine.mixBus,
          chordsSettingsRef.current,
        );
        chordsEngine.setOnFire(({ voiceId }) =>
          flashVoice(setChordGlow, voiceId),
        );
        chordsEngine.start();
        chordsRef.current = chordsEngine;

        const announceEngine = new AnnounceEngine(
          engine.context,
          engine.announceBus,
          announceSettingsRef.current,
        );
        announceEngine.start();
        announceRef.current = announceEngine;

        const breakEngine = new BreakEngine(
          engine.context,
          engine.mixBus,
          breakSettingsRef.current,
        );
        breakEngine.setOnFire(({ kind, message }) => {
          setActiveBreaks((prev) => pushActiveBreak(prev, { kind, message }));
        });
        breakEngine.start();
        breakRef.current = breakEngine;
      }
      setAudioEpoch((n) => n + 1);
      return engine;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  /** Resume AudioContext for preview without audible noise when not playing. */
  async function ensurePreviewAudio(): Promise<boolean> {
    unlockExistingContextSync();
    const engine = await ensureEngines();
    if (!engine) return false;
    await engine.resume();
    if (!playing) {
      engine.setMasterVolume(0);
    }
    return true;
  }

  /** (Re)arm the sleep-timer pump on the audio clock, or clear it when off. */
  function armSleep(minutes: number, engine: NoiseEngine) {
    clearSleepTimer();
    engine.resetBuses();
    if (minutes <= 0 || !engine.context) return;
    const timer = armSleepTimer(engine.context.currentTime, minutes, SLEEP_FADE_SEC);
    sleepTimerRef.current = timer;
    setSleepRemaining(sleepRemainingSec(timer, engine.context.currentTime));
    sleepPumpRef.current = setInterval(sleepPump, SLEEP_PUMP_MS);
  }

  function sleepPump() {
    const engine = engineRef.current;
    const timer = sleepTimerRef.current;
    if (!engine?.context || !timer) return;
    const now = engine.context.currentTime;
    setSleepRemaining(sleepRemainingSec(timer, now));
    if (!sleepFadedRef.current && isFading(timer, now)) {
      engine.fadeOut(fadeRemainingSec(timer, now));
      sleepFadedRef.current = true;
    }
    if (isElapsed(timer, now)) void finishSleep();
  }

  /** Timer fired: stop everything (buses already faded) and reset to Play. */
  async function finishSleep() {
    const engine = engineRef.current;
    clearSleepTimer();
    if (!engine) return;
    await engine.suspend();
    engine.setMasterVolume(0);
    engine.resetBuses();
    setPlaying(false);
    meditationRef.current?.stop();
    meditationRef.current?.start();
    chordsRef.current?.stop();
    chordsRef.current?.start();
    announceRef.current?.stop();
    announceRef.current?.start();
    breakRef.current?.stop();
    breakRef.current?.start();
  }

  async function togglePlay() {
    if (starting) return;
    // Sync unlock before any await — preserves iOS gesture chain (#83).
    unlockExistingContextSync();
    const engine = await ensureEngines();
    if (!engine) return;
    if (playing) {
      clearSleepTimer();
      // Drop far-ahead audio-clock schedules before suspending — wall time
      // keeps moving while the audio clock freezes.
      announceRef.current?.stop();
      announceRef.current?.start();
      breakRef.current?.stop();
      breakRef.current?.start();
      await engine.suspend();
      setPlaying(false);
    } else {
      await engine.resume();
      announceRef.current?.resync();
      engine.setMasterVolume(state.masterVolume);
      setPlaying(true);
      if (sleepMinutes > 0) armSleep(sleepMinutes, engine);
    }
  }

  /** Silence everything immediately; Play and preview can resume afterward. */
  async function stopAllSounds() {
    if (starting) return;
    const engine = engineRef.current;
    if (!engine) return;

    clearSleepTimer();
    await engine.suspend();
    engine.setMasterVolume(0);
    engine.resetBuses();
    setPlaying(false);

    meditationRef.current?.stop();
    meditationRef.current?.start();
    chordsRef.current?.stop();
    chordsRef.current?.start();
    announceRef.current?.stop();
    announceRef.current?.start();
    breakRef.current?.stop();
    breakRef.current?.start();
  }

  function changeSleepMinutes(minutes: number) {
    const clamped = clampSleepMinutes(minutes);
    setSleepMinutes(clamped);
    const engine = engineRef.current;
    if (!engine) return;
    if (playing && clamped > 0) {
      armSleep(clamped, engine);
    } else {
      clearSleepTimer();
      engine.resetBuses();
    }
  }

  /**
   * Snap the EQ sliders (state) and the audible filter gains to a whole curve.
   * The single "select preset → sliders snap" path — colors use it today, and a
   * future saved session preset can reuse it with its own stored curve.
   */
  function applyEqCurve(curve: EqBand[]) {
    setState((s) => ({ ...s, eqCurve: curve }));
    engineRef.current?.setEqCurve(curve);
  }

  function selectColor(color: NoiseColor) {
    setState((s) => ({ ...s, color }));
    engineRef.current?.setColor(color);
    applyEqCurve(eqCurveForColor(color));
  }

  function changeBandGain(bandIndex: number, gainDb: number) {
    setState((s) => ({ ...s, eqCurve: withBandGain(s.eqCurve, bandIndex, gainDb) }));
    engineRef.current?.setBandGain(bandIndex, gainDb);
  }

  function changeMasterVolume(volume: number) {
    const clamped = clampVolume(volume);
    setState((s) => ({ ...s, masterVolume: clamped }));
    if (playing) {
      engineRef.current?.setMasterVolume(clamped);
    }
  }

  function changeVoice(voiceId: string, update: Partial<VoiceSettings>) {
    setMeditation((m) => {
      const next = { ...m, [voiceId]: { ...m[voiceId], ...update } };
      meditationRef.current?.updateSettings(next);
      return next;
    });
  }

  async function previewVoice(voiceId: string) {
    if (!(await ensurePreviewAudio())) return;
    meditationRef.current?.preview(voiceId);
  }

  function changeChord(voiceId: string, update: Partial<ChordVoiceSettings>) {
    setChords((c) => {
      const next = { ...c, [voiceId]: { ...c[voiceId], ...update } };
      chordsRef.current?.updateSettings(next);
      return next;
    });
  }

  async function previewChord(voiceId: string) {
    if (!(await ensurePreviewAudio())) return;
    chordsRef.current?.preview(voiceId);
  }

  function changeAnnounce(update: Partial<AnnounceSettings>) {
    const next = { ...announceSettingsRef.current, ...update };
    announceSettingsRef.current = next;
    announceRef.current?.updateSettings(next);
    setAnnounce(next);
    // Enabling needs a running AudioContext + pump; the checkbox gesture
    // is enough to resume. Re-push settings after ensure in case creation
    // raced, then resync so the next boundary is mapped from wall clock.
    if (update.enabled === true) {
      void (async () => {
        await ensurePreviewAudio();
        announceRef.current?.updateSettings(announceSettingsRef.current);
        announceRef.current?.resync();
      })();
    }
  }

  async function previewAnnounce() {
    if (!(await ensurePreviewAudio())) return;
    await announceRef.current?.preview();
  }

  function changeBreakType(kind: BreakKind, update: Partial<BreakTypeSettings>) {
    setBreaks((b) => {
      const next: BreakSettings = {
        ...b,
        types: { ...b.types, [kind]: { ...b.types[kind], ...update } },
      };
      breakSettingsRef.current = next;
      breakRef.current?.updateSettings(next);
      return next;
    });
  }

  function changeBreakSettings(update: Partial<BreakSettings>) {
    setBreaks((b) => {
      const next = { ...b, ...update };
      breakSettingsRef.current = next;
      breakRef.current?.updateSettings(next);
      return next;
    });
  }

  async function toggleBreakNotifications(enabled: boolean) {
    if (!enabled) {
      setNotificationHint(undefined);
      changeBreakSettings({ notificationsEnabled: false });
      return;
    }
    const permission = await requestNotificationPermission();
    if (permission === "granted") {
      setNotificationHint(undefined);
      changeBreakSettings({ notificationsEnabled: true });
      return;
    }
    // Graceful deny / unsupported — keep the feature usable via banner + cue.
    changeBreakSettings({ notificationsEnabled: false });
    if (permission === "unsupported") {
      setNotificationHint(
        "Browser notifications are not available here — in-app banner still works.",
      );
    } else {
      setNotificationHint(
        "Notification permission denied — in-app banner and audio cue still work.",
      );
    }
  }

  async function previewBreakCue() {
    if (!(await ensurePreviewAudio())) return;
    breakRef.current?.preview();
  }

  function changeTodoCue(update: Partial<TodoCueSettings>) {
    setTodoCue((c) => ({
      ...c,
      ...update,
      volume: update.volume !== undefined ? clampCueVolume(update.volume) : c.volume,
    }));
  }

  async function previewTodoCue() {
    if (!(await ensurePreviewAudio())) return;
    const ctx = engineRef.current?.context;
    const bus = engineRef.current?.todoCueBus;
    if (!ctx || !bus) return;
    playCueSound(todoCue.soundId, ctx, bus, ctx.currentTime, todoCue.volume);
  }

  function applyMute(next: MuteState) {
    setMuteState(next);
    const g = muteGains(next);
    engineRef.current?.setMuteGains(g.output, g.mainGroup);
  }

  /* -------------------------------------------------------------- *
   * Whole-session presets (#6)
   * -------------------------------------------------------------- */

  /** Snapshot the serializable settings blocks a preset captures (FR-1). */
  function buildCurrentSessionSettings(): SessionSettings {
    return { state, meditation, chords, announce, breaks, todoCue, muteState };
  }

  /**
   * Apply a preset to React state AND push it into the live engines so the
   * change is audible immediately, playing or not (FR-4). Each block mirrors
   * the propagation its own change handler uses.
   */
  function applySessionSettings(next: SessionSettings) {
    // Noise: sliders (state) + audible color/EQ; volume only bites while playing.
    setState(next.state);
    const engine = engineRef.current;
    engine?.setColor(next.state.color);
    engine?.setEqCurve(next.state.eqCurve);
    if (playing) engine?.setMasterVolume(next.state.masterVolume);

    // Meditation → meditationRef.updateSettings (mirrors changeVoice).
    setMeditation(next.meditation);
    meditationSettingsRef.current = next.meditation;
    meditationRef.current?.updateSettings(next.meditation);

    // Chords → chordsRef.updateSettings (mirrors changeChord).
    setChords(next.chords);
    chordsSettingsRef.current = next.chords;
    chordsRef.current?.updateSettings(next.chords);

    // Announce → announceRef.updateSettings + resync (mirrors changeAnnounce).
    setAnnounce(next.announce);
    announceSettingsRef.current = next.announce;
    announceRef.current?.updateSettings(next.announce);
    announceRef.current?.resync();

    // Breaks → breakRef.updateSettings (mirrors changeBreakSettings).
    setBreaks(next.breaks);
    breakSettingsRef.current = next.breaks;
    breakRef.current?.updateSettings(next.breaks);

    // ToDo cue: no persistent engine — the cue plays on demand when a reminder
    // comes due, reading the latest todoCue state.
    setTodoCue(next.todoCue);

    // Mute → engine gate (mirrors applyMute).
    applyMute(next.muteState);
  }

  /** Persist a mutated collection and notify the presets store. */
  function commitPresets(next: SessionPreset[]) {
    replacePresets(next);
  }

  function selectPreset(id: string) {
    setSelectedPresetId(id);
    setPresetNameInput(findPreset(presets, id)?.name ?? "");
  }

  function saveNewPreset() {
    const preset = makePreset(presetNameInput, buildCurrentSessionSettings());
    commitPresets(addPreset(presets, preset));
    setSelectedPresetId(preset.id);
    setPresetNameInput(preset.name);
  }

  function updateSelectedPreset() {
    if (!findPreset(presets, selectedPresetId)) return;
    commitPresets(
      updatePreset(presets, selectedPresetId, buildCurrentSessionSettings()),
    );
  }

  function applySelectedPreset() {
    const preset = findPreset(presets, selectedPresetId);
    if (preset) applySessionSettings(preset.settings);
  }

  function renameSelectedPreset() {
    if (!findPreset(presets, selectedPresetId)) return;
    commitPresets(renamePreset(presets, selectedPresetId, presetNameInput));
  }

  function deleteSelectedPreset() {
    const preset = findPreset(presets, selectedPresetId);
    if (!preset) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete preset “${preset.name}”?`)
    ) {
      return;
    }
    commitPresets(deletePreset(presets, selectedPresetId));
    setSelectedPresetId("");
    setPresetNameInput("");
  }

  function dismissBreakBanner(kind: BreakKind) {
    setActiveBreaks((prev) => removeActiveBreak(prev, kind));
  }

  function snoozeBreakBanner(kind: BreakKind) {
    breakRef.current?.snooze(kind);
    setActiveBreaks((prev) => removeActiveBreak(prev, kind));
  }

  function didBreakBanner(kind: BreakKind) {
    updateBreakTallies((prev) => incrementBreakTally(prev, kind));
    setActiveBreaks((prev) => removeActiveBreak(prev, kind));
  }

  function clearOneBreakTally(kind: BreakKind) {
    updateBreakTallies((prev) => clearBreakTally(prev, kind));
  }

  function clearEveryBreakTally() {
    updateBreakTallies(() => clearAllBreakTallies());
  }

  function handleTodoDone(id: string) {
    removeTodo(id);
  }

  function handleTodoDismiss(id: string) {
    dismissTodo(id);
  }

  function handleTodoSnooze(id: string) {
    snoozeTodo(id, TODO_SNOOZE_MIN);
    setTodoClockMs(Date.now());
  }

  return (
    <section className="player">
      <BreakBannerStack
        breaks={activeBreaks}
        onDidIt={didBreakBanner}
        onDismiss={dismissBreakBanner}
        onSnooze={snoozeBreakBanner}
        snoozeMin={breaks.snoozeMin}
      />
      <TodoReminderStack
        reminders={activeTodoReminders}
        onDone={handleTodoDone}
        onDismiss={handleTodoDismiss}
        onSnooze={handleTodoSnooze}
        snoozeMin={TODO_SNOOZE_MIN}
      />
      <div className="transport">
        <div className="transport-controls">
          <button
            type="button"
            className="play"
            onClick={togglePlay}
            disabled={starting}
            aria-pressed={playing}
          >
            {starting ? "Starting…" : playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="stop-all"
            onClick={() => void stopAllSounds()}
            disabled={starting}
          >
            Stop All Sounds
          </button>
          <button
            type="button"
            className="mute-all"
            onClick={() => applyMute(toggleMuteAll(muteState))}
            aria-pressed={isMuteAllActive(muteState)}
            title="Silence all audio without stopping playback"
          >
            {isMuteAllActive(muteState) ? "Unmute All" : "Mute All"}
          </button>
          <button
            type="button"
            className="mute-except-todo"
            onClick={() => applyMute(toggleMuteExceptTodo(muteState))}
            aria-pressed={isExceptTodoActive(muteState)}
            title="Silence everything except ToDo reminder cues"
          >
            Mute All But ToDo
          </button>
        </div>

        <div className="sleep-timer">
          <span className="sleep-icon" aria-hidden="true">
            🌙
          </span>
          <select
            className="sleep-select"
            value={sleepMinutes}
            onChange={(e) => changeSleepMinutes(Number(e.target.value))}
            aria-label="Sleep timer"
          >
            {SLEEP_TIMER_PRESETS.map((preset) => (
              <option key={preset.minutes} value={preset.minutes}>
                {preset.label}
              </option>
            ))}
            {!isSleepPreset(sleepMinutes) && (
              <option value={sleepMinutes}>{sleepMinutes} min</option>
            )}
          </select>
          <input
            type="number"
            className="sleep-custom"
            min={1}
            max={600}
            step={1}
            value={sleepMinutes > 0 ? sleepMinutes : ""}
            placeholder="min"
            onChange={(e) =>
              changeSleepMinutes(e.target.value === "" ? 0 : Number(e.target.value))
            }
            aria-label="Sleep timer custom minutes"
          />
          {sleepRemaining !== null && (
            <span className="sleep-countdown" role="status" aria-live="polite">
              {formatCountdown(sleepRemaining)}
            </span>
          )}
        </div>

        <fieldset className="colors">
          <legend>Noise color</legend>
          {NOISE_COLORS.map((color) => (
            <label key={color.id} title={color.description}>
              <input
                type="radio"
                name="noise-color"
                value={color.id}
                checked={state.color === color.id}
                onChange={() => selectColor(color.id)}
              />
              {color.label}
            </label>
          ))}
        </fieldset>

        <label className="volume">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.masterVolume}
            onChange={(e) => changeMasterVolume(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="eq" role="group" aria-label="10-band equalizer">
        {state.eqCurve.map((band, i) => (
          <label key={band.frequency} className="band">
            <input
              type="range"
              min={EQ_GAIN_MIN_DB}
              max={EQ_GAIN_MAX_DB}
              step={0.5}
              value={band.gainDb}
              onChange={(e) => changeBandGain(i, Number(e.target.value))}
              aria-label={`${formatFrequency(band.frequency)} gain`}
            />
            <span className="freq">{formatFrequency(band.frequency)}</span>
            <span className="gain">{band.gainDb} dB</span>
          </label>
        ))}
      </div>

      <PresetsPanel
        presets={presets}
        selectedId={selectedPresetId}
        nameInput={presetNameInput}
        onNameInputChange={setPresetNameInput}
        onSelect={selectPreset}
        onSaveNew={saveNewPreset}
        onUpdate={updateSelectedPreset}
        onApply={applySelectedPreset}
        onRename={renameSelectedPreset}
        onDelete={deleteSelectedPreset}
      />

      <MeditationPanel
        settings={meditation}
        onChange={changeVoice}
        onPreview={previewVoice}
        previewDisabled={starting}
        playingVoiceIds={new Set(Object.keys(medGlow))}
      />

      <ChordsPanel
        settings={chords}
        onChange={changeChord}
        onPreview={previewChord}
        previewDisabled={starting}
        playingVoiceIds={new Set(Object.keys(chordGlow))}
      />

      <BreakPanel
        settings={breaks}
        tallies={breakTallies}
        dailyGoal={breakDailyGoal}
        onChangeType={changeBreakType}
        onChangeSettings={changeBreakSettings}
        onChangeDailyGoal={setBreakDailyGoal}
        onClearTally={clearOneBreakTally}
        onClearAllTallies={clearEveryBreakTally}
        onPreview={previewBreakCue}
        onToggleNotifications={toggleBreakNotifications}
        previewDisabled={starting}
        notificationHint={notificationHint}
      />

      <TodoPanel
        items={todos}
        onAdd={(text, reminderTime) => {
          addTodo(text, reminderTime);
          setTodoClockMs(Date.now());
        }}
        onUpdate={(id, update) => {
          patchTodo(id, update);
          setTodoClockMs(Date.now());
        }}
        onDelete={(id) => {
          removeTodo(id);
        }}
        cue={todoCue}
        onChangeCue={changeTodoCue}
        onPreviewCue={previewTodoCue}
        previewDisabled={starting}
      />

      <TimeAnnouncePanel
        settings={announce}
        onChange={changeAnnounce}
        onPreview={previewAnnounce}
        previewDisabled={starting}
      />

      <footer className="player-footer">
        <button
          type="button"
          className="about-trigger"
          ref={aboutTriggerRef}
          onClick={() => setAboutOpen(true)}
        >
          About
        </button>
      </footer>

      <AboutDialog open={aboutOpen} onClose={closeAbout} />
    </section>
  );
}
