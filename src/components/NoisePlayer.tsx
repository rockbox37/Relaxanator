"use client";

import { useEffect, useRef, useState } from "react";

import { AnnounceEngine } from "@/audio/announce-engine";
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
  type MeditationSettings,
  type VoiceSettings,
  createDefaultMeditationSettings,
} from "@/lib/meditation";
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

import MeditationPanel from "./MeditationPanel";
import TimeAnnouncePanel from "./TimeAnnouncePanel";

/** Sleep-timer pump cadence — reads the audio clock to drive fade + stop. */
const SLEEP_PUMP_MS = 250;

export default function NoisePlayer() {
  const engineRef = useRef<NoiseEngine | null>(null);
  const meditationRef = useRef<MeditationEngine | null>(null);
  const announceRef = useRef<AnnounceEngine | null>(null);
  const [state, setState] = useState(createDefaultNoiseState);
  const [meditation, setMeditation] = useState<MeditationSettings>(
    createDefaultMeditationSettings,
  );
  const [announce, setAnnounce] = useState<AnnounceSettings>(
    createDefaultAnnounceSettings,
  );
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(SLEEP_TIMER_OFF);
  const [sleepRemaining, setSleepRemaining] = useState<number | null>(null);

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
      announceRef.current?.stop();
      announceRef.current = null;
      meditationRef.current?.stop();
      meditationRef.current = null;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  async function ensureEngines(): Promise<NoiseEngine | null> {
    if (engineRef.current) return engineRef.current;
    if (starting) return null;
    setStarting(true);
    try {
      const engine = new NoiseEngine();
      await engine.init(state);
      engineRef.current = engine;
      if (engine.context && engine.mixBus && engine.announceBus) {
        // Resume during the user gesture before priming output paths.
        await engine.resume();
        engine.primeAudioOutput();

        const meditationEngine = new MeditationEngine(
          engine.context,
          engine.mixBus,
          meditation,
        );
        meditationEngine.start();
        meditationRef.current = meditationEngine;

        const announceEngine = new AnnounceEngine(
          engine.context,
          engine.announceBus,
          announce,
        );
        announceEngine.start();
        announceRef.current = announceEngine;
      }
      return engine;
    } finally {
      setStarting(false);
    }
  }

  /** Resume AudioContext for preview without audible noise when not playing. */
  async function ensurePreviewAudio(): Promise<boolean> {
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
    announceRef.current?.stop();
    announceRef.current?.start();
  }

  async function togglePlay() {
    if (starting) return;
    const engine = await ensureEngines();
    if (!engine) return;
    if (playing) {
      clearSleepTimer();
      await engine.suspend();
      setPlaying(false);
    } else {
      await engine.resume();
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
    announceRef.current?.stop();
    announceRef.current?.start();
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

  function changeAnnounce(update: Partial<AnnounceSettings>) {
    setAnnounce((a) => {
      const next = { ...a, ...update };
      announceRef.current?.updateSettings(next);
      return next;
    });
  }

  async function previewAnnounce() {
    if (!(await ensurePreviewAudio())) return;
    await announceRef.current?.preview();
  }

  return (
    <section className="player">
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

      <MeditationPanel
        settings={meditation}
        onChange={changeVoice}
        onPreview={previewVoice}
        previewDisabled={starting}
      />

      <TimeAnnouncePanel
        settings={announce}
        onChange={changeAnnounce}
        onPreview={previewAnnounce}
        previewDisabled={starting}
      />
    </section>
  );
}
