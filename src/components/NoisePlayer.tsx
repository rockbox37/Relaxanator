"use client";

import { useEffect, useRef, useState } from "react";

import { AnnounceEngine } from "@/audio/announce-engine";
import { MeditationEngine } from "@/audio/meditation-engine";
import { NoiseEngine } from "@/audio/noise-engine";
import {
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
} from "@/lib/noise";

import MeditationPanel from "./MeditationPanel";
import TimeAnnouncePanel from "./TimeAnnouncePanel";

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

  useEffect(() => {
    return () => {
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
      if (engine.context && engine.mixBus) {
        // Resume during the user gesture before routing announce into the mix bus.
        await engine.resume();

        const meditationEngine = new MeditationEngine(
          engine.context,
          engine.mixBus,
          meditation,
        );
        meditationEngine.start();
        meditationRef.current = meditationEngine;

        const announceEngine = new AnnounceEngine(
          engine.context,
          engine.mixBus,
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

  async function togglePlay() {
    if (starting) return;
    const engine = await ensureEngines();
    if (!engine) return;
    if (playing) {
      await engine.suspend();
      setPlaying(false);
    } else {
      await engine.resume();
      engine.setMasterVolume(state.masterVolume);
      setPlaying(true);
    }
  }

  /** Silence everything immediately; Play and preview can resume afterward. */
  async function stopAllSounds() {
    if (starting) return;
    const engine = engineRef.current;
    if (!engine) return;

    await engine.suspend();
    engine.setMasterVolume(0);
    setPlaying(false);

    meditationRef.current?.stop();
    meditationRef.current?.start();
    announceRef.current?.stop();
    announceRef.current?.start();
  }

  function selectColor(color: NoiseColor) {
    setState((s) => ({ ...s, color }));
    engineRef.current?.setColor(color);
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
