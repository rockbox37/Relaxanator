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

interface BreakPanelProps {
  settings: BreakSettings;
  onChangeType: (kind: BreakKind, update: Partial<BreakTypeSettings>) => void;
  onChangeSettings: (update: Partial<BreakSettings>) => void;
  onPreview: () => void;
  onToggleNotifications: (enabled: boolean) => void;
  previewDisabled?: boolean;
  notificationHint?: string;
}

export default function BreakPanel({
  settings,
  onChangeType,
  onChangeSettings,
  onPreview,
  onToggleNotifications,
  previewDisabled = false,
  notificationHint,
}: BreakPanelProps) {
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

      {notificationHint && (
        <p className="announce-note" role="status">
          {notificationHint}
        </p>
      )}
    </section>
  );
}
