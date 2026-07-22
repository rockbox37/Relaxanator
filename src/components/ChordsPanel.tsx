"use client";

import {
  CHORD_MAX_INTERVAL_MIN,
  CHORD_MIN_INTERVAL_MIN,
  CHORD_TIMBRES,
  CHORD_VOICES,
  type ChordSettings,
  type ChordTimbreCategory,
  type ChordVoiceSettings,
  MAX_TEMPO_BPM,
  MIN_TEMPO_BPM,
  clampChordIntervalMin,
  clampTempoBpm,
} from "@/lib/chords";

interface ChordsPanelProps {
  settings: ChordSettings;
  onChange: (voiceId: string, update: Partial<ChordVoiceSettings>) => void;
  onPreview: (voiceId: string) => void;
  previewDisabled?: boolean;
}

const TIMBRE_GROUPS: { category: ChordTimbreCategory; label: string }[] = [
  { category: "electric-piano", label: "Electric pianos" },
  { category: "harpsichord", label: "Harpsichords" },
  { category: "piano", label: "Pianos" },
  { category: "synth-pad", label: "Airy synths & pads" },
];

export default function ChordsPanel({
  settings,
  onChange,
  onPreview,
  previewDisabled = false,
}: ChordsPanelProps) {
  return (
    <section className="meditation chords" aria-label="Chords">
      <h2>Chords</h2>
      <ul className="voices">
        {CHORD_VOICES.map((voice) => {
          const state = settings[voice.id];
          const arpeggiated = state.mode === "arpeggiated";
          return (
            <li key={voice.id} className="voice">
              <label className="voice-enable" title={voice.description}>
                <input
                  type="checkbox"
                  checked={state.enabled}
                  onChange={(e) => onChange(voice.id, { enabled: e.target.checked })}
                />
                {voice.label}
              </label>

              <label className="voice-mode" title="Play all notes at once or spread them out">
                <select
                  value={state.mode}
                  onChange={(e) =>
                    onChange(voice.id, {
                      mode: e.target.value === "arpeggiated" ? "arpeggiated" : "block",
                    })
                  }
                  aria-label={`${voice.label} playback mode`}
                >
                  <option value="block">Block</option>
                  <option value="arpeggiated">Arpeggiated</option>
                </select>
              </label>

              <label
                className="voice-tempo"
                title={
                  arpeggiated
                    ? "Arpeggio tempo (beats per minute)"
                    : "Tempo — sets progression pace (BPM)"
                }
              >
                <input
                  type="number"
                  min={MIN_TEMPO_BPM}
                  max={MAX_TEMPO_BPM}
                  step={1}
                  value={state.tempoBpm}
                  onChange={(e) =>
                    onChange(voice.id, { tempoBpm: clampTempoBpm(Number(e.target.value)) })
                  }
                  aria-label={`${voice.label} tempo in BPM`}
                />
                bpm
              </label>

              <label className="voice-timbre" title="Instrument sound">
                <select
                  value={state.timbreId}
                  onChange={(e) =>
                    onChange(voice.id, { timbreId: e.target.value as ChordVoiceSettings["timbreId"] })
                  }
                  aria-label={`${voice.label} instrument`}
                >
                  {TIMBRE_GROUPS.map((group) => (
                    <optgroup key={group.category} label={group.label}>
                      {CHORD_TIMBRES.filter((t) => t.category === group.category).map(
                        (timbre) => (
                          <option key={timbre.id} value={timbre.id} title={timbre.description}>
                            {timbre.label}
                          </option>
                        ),
                      )}
                    </optgroup>
                  ))}
                </select>
              </label>

              <label className="voice-interval">
                every
                <input
                  type="number"
                  min={CHORD_MIN_INTERVAL_MIN}
                  max={CHORD_MAX_INTERVAL_MIN}
                  step={0.5}
                  value={state.intervalMin}
                  onChange={(e) =>
                    onChange(voice.id, {
                      intervalMin: clampChordIntervalMin(Number(e.target.value)),
                    })
                  }
                  aria-label={`${voice.label} repeat interval in minutes`}
                />
                min
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
