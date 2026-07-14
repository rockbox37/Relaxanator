"use client";

import {
  BREAK_TYPES,
  MAX_BREAK_INTERVAL_MIN,
  MAX_SNOOZE_MIN,
  MIN_BREAK_INTERVAL_MIN,
  MIN_SNOOZE_MIN,
  type BreakKind,
  type BreakSettings,
  type BreakTypeSettings,
  clampBreakIntervalMin,
  clampSnoozeMin,
} from "@/lib/breaks";
import type { BreakTallies } from "@/lib/break-tallies";

interface BreakPanelProps {
  settings: BreakSettings;
  tallies: BreakTallies;
  onChangeType: (kind: BreakKind, update: Partial<BreakTypeSettings>) => void;
  onChangeSettings: (update: Partial<BreakSettings>) => void;
  onClearTally: (kind: BreakKind) => void;
  onClearAllTallies: () => void;
  onPreview: () => void;
  onToggleNotifications: (enabled: boolean) => void;
  previewDisabled?: boolean;
  notificationHint?: string;
}

export default function BreakPanel({
  settings,
  tallies,
  onChangeType,
  onChangeSettings,
  onClearTally,
  onClearAllTallies,
  onPreview,
  onToggleNotifications,
  previewDisabled = false,
  notificationHint,
}: BreakPanelProps) {
  const totalCompleted = BREAK_TYPES.reduce(
    (sum, def) => sum + (tallies[def.id] ?? 0),
    0,
  );

  return (
    <section className="meditation breaks" aria-label="Break prompts">
      <h2>Break prompts</h2>
      <ul className="voices">
        {BREAK_TYPES.map((def) => {
          const state = settings.types[def.id];
          return (
            <li key={def.id} className="voice">
              <label className="voice-enable" title={def.description}>
                <input
                  type="checkbox"
                  checked={state.enabled}
                  onChange={(e) =>
                    onChangeType(def.id, { enabled: e.target.checked })
                  }
                />
                {def.label}
              </label>

              <label className="voice-interval">
                every
                <input
                  type="number"
                  min={MIN_BREAK_INTERVAL_MIN}
                  max={MAX_BREAK_INTERVAL_MIN}
                  step={1}
                  value={state.intervalMin}
                  onChange={(e) =>
                    onChangeType(def.id, {
                      intervalMin: clampBreakIntervalMin(Number(e.target.value)),
                    })
                  }
                  aria-label={`${def.label} interval in minutes`}
                />
                min
              </label>

              {def.id === "custom" && (
                <label className="voice-interval break-custom-label">
                  label
                  <input
                    type="text"
                    maxLength={40}
                    value={state.customLabel}
                    onChange={(e) =>
                      onChangeType(def.id, { customLabel: e.target.value })
                    }
                    aria-label="Custom break label"
                    placeholder="Break"
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <div className="voice break-globals">
        <label className="voice-volume">
          Cue
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.cueVolume}
            onChange={(e) =>
              onChangeSettings({ cueVolume: Number(e.target.value) })
            }
            aria-label="Break cue volume"
          />
        </label>

        <label className="voice-interval">
          snooze
          <input
            type="number"
            min={MIN_SNOOZE_MIN}
            max={MAX_SNOOZE_MIN}
            step={1}
            value={settings.snoozeMin}
            onChange={(e) =>
              onChangeSettings({
                snoozeMin: clampSnoozeMin(Number(e.target.value)),
              })
            }
            aria-label="Snooze minutes"
          />
          min
        </label>

        <label className="voice-enable" title="Optional browser notifications">
          <input
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={(e) => onToggleNotifications(e.target.checked)}
          />
          Notifications
        </label>

        <button
          type="button"
          className="voice-preview"
          onClick={onPreview}
          disabled={previewDisabled}
          title="Play break cue now"
        >
          ♪
        </button>
      </div>

      <div className="break-tallies" aria-label="Completed breaks">
        <div className="break-tallies-header">
          <h3>Completed</h3>
          <button
            type="button"
            className="break-tally-clear-all"
            onClick={onClearAllTallies}
            disabled={totalCompleted === 0}
          >
            Clear all
          </button>
        </div>
        <ul className="break-tally-list">
          {BREAK_TYPES.map((def) => {
            const count = tallies[def.id] ?? 0;
            return (
              <li key={def.id} className="break-tally-row">
                <span className="break-tally-label">{def.label}</span>
                <span
                  className="break-tally-count"
                  aria-label={`${def.label} completed ${count}`}
                >
                  {count}
                </span>
                <button
                  type="button"
                  className="break-tally-clear"
                  onClick={() => onClearTally(def.id)}
                  disabled={count === 0}
                  aria-label={`Clear ${def.label} tally`}
                >
                  Clear
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {notificationHint && (
        <p className="announce-note" role="status">
          {notificationHint}
        </p>
      )}
    </section>
  );
}
