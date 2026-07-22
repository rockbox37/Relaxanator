"use client";

import {
  MAX_INTERVAL_MIN,
  MEDITATION_VOICES,
  MIN_INTERVAL_MIN,
  type MeditationSettings,
  type VoiceSettings,
  clampIntervalMin,
} from "@/lib/meditation";

interface MeditationPanelProps {
  settings: MeditationSettings;
  onChange: (voiceId: string, update: Partial<VoiceSettings>) => void;
  onPreview: (voiceId: string) => void;
  previewDisabled?: boolean;
  /** voiceIds currently lit by the "just played" glow (#104). */
  playingVoiceIds?: ReadonlySet<string>;
}

export default function MeditationPanel({
  settings,
  onChange,
  onPreview,
  previewDisabled = false,
  playingVoiceIds,
}: MeditationPanelProps) {
  return (
    <section className="meditation" aria-label="Meditation sounds">
      <h2>Meditation sounds</h2>
      <ul className="voices">
        {MEDITATION_VOICES.map((voice) => {
          const state = settings[voice.id];
          const playing = playingVoiceIds?.has(voice.id) ?? false;
          return (
            <li
              key={voice.id}
              className={playing ? "voice voice--playing" : "voice"}
            >
              <label className="voice-enable" title={voice.description}>
                <input
                  type="checkbox"
                  checked={state.enabled}
                  onChange={(e) => onChange(voice.id, { enabled: e.target.checked })}
                />
                {voice.label}
              </label>

              <label className="voice-interval">
                every
                <input
                  type="number"
                  min={MIN_INTERVAL_MIN}
                  max={MAX_INTERVAL_MIN}
                  step={0.5}
                  value={state.intervalMin}
                  onChange={(e) =>
                    onChange(voice.id, {
                      intervalMin: clampIntervalMin(Number(e.target.value)),
                    })
                  }
                  aria-label={`${voice.label} interval in minutes`}
                />
                min
              </label>

              <label
                className="voice-jitter"
                title={
                  state.syncToClock
                    ? "Disabled while synced to the clock"
                    : "Vary each interval by up to ±15%"
                }
              >
                <input
                  type="checkbox"
                  checked={state.jitter && !state.syncToClock}
                  disabled={state.syncToClock}
                  onChange={(e) => onChange(voice.id, { jitter: e.target.checked })}
                />
                vary
              </label>

              <label
                className="voice-sync"
                title="Ring on the wall clock, anchored to the top of the hour (e.g. :00, :05, :10…)"
              >
                <input
                  type="checkbox"
                  checked={state.syncToClock}
                  onChange={(e) => onChange(voice.id, { syncToClock: e.target.checked })}
                />
                clock
              </label>

              <label className="voice-volume">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={state.volume}
                  onChange={(e) => onChange(voice.id, { volume: Number(e.target.value) })}
                  aria-label={`${voice.label} volume`}
                />
              </label>

              <button
                type="button"
                className="voice-preview"
                onClick={() => onPreview(voice.id)}
                disabled={previewDisabled}
                title={`Play ${voice.label} now`}
              >
                ♪
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
