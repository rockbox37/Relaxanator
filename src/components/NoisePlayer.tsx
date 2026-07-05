"use client";

import { useEffect, useRef, useState } from "react";

import { NoiseEngine } from "@/audio/noise-engine";
import {
  EQ_GAIN_MAX_DB,
  EQ_GAIN_MIN_DB,
  formatFrequency,
  withBandGain,
} from "@/lib/eq";
import {
  NOISE_COLORS,
  type NoiseColor,
  clampVolume,
  createDefaultNoiseState,
} from "@/lib/noise";

export default function NoisePlayer() {
  const engineRef = useRef<NoiseEngine | null>(null);
  const [state, setState] = useState(createDefaultNoiseState);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  async function togglePlay() {
    if (starting) return;
    if (!engineRef.current) {
      setStarting(true);
      try {
        const engine = new NoiseEngine();
        await engine.init(state);
        engineRef.current = engine;
      } finally {
        setStarting(false);
      }
    }
    if (playing) {
      await engineRef.current?.suspend();
      setPlaying(false);
    } else {
      await engineRef.current?.resume();
      setPlaying(true);
    }
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
    engineRef.current?.setMasterVolume(clamped);
  }

  return (
    <section className="player">
      <div className="transport">
        <button
          type="button"
          className="play"
          onClick={togglePlay}
          disabled={starting}
          aria-pressed={playing}
        >
          {starting ? "Starting…" : playing ? "Pause" : "Play"}
        </button>

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
    </section>
  );
}
