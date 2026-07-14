"use client";

import type { CSSProperties } from "react";

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
import {
  MAX_BREAK_DAILY_GOAL,
  MIN_BREAK_DAILY_GOAL,
  breakGoalProgressRatio,
  isBreakDailyGoalMet,
} from "@/lib/break-daily-goal";
import type { BreakTallies } from "@/lib/break-tallies";

interface BreakPanelProps {
  settings: BreakSettings;
  tallies: BreakTallies;
  dailyGoal: number;
  onChangeType: (kind: BreakKind, update: Partial<BreakTypeSettings>) => void;
  onChangeSettings: (update: Partial<BreakSettings>) => void;
  onChangeDailyGoal: (goal: number) => void;
  onClearTally: (kind: BreakKind) => void;
  onClearAllTallies: () => void;
  onPreview: () => void;
  onToggleNotifications: (enabled: boolean) => void;
  previewDisabled?: boolean;
  notificationHint?: string;
}

function GoalCelebrateIcon() {
  return (
    <svg
      className="break-tally-celebrate-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 2.2l1.35 6.05 5.65 2.55-5.65 2.55L12 19.4l-1.35-6.05L5 10.8l5.65-2.55L12 2.2z"
      />
      <circle cx="4.2" cy="5.2" r="1.1" fill="currentColor" opacity="0.85" />
      <circle cx="19.5" cy="4.8" r="0.9" fill="currentColor" opacity="0.75" />
      <circle cx="20.2" cy="14.5" r="1" fill="currentColor" opacity="0.8" />
    </svg>
  );
}

export default function BreakPanel({
  settings,
  tallies,
  dailyGoal,
  onChangeType,
  onChangeSettings,
  onChangeDailyGoal,
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

        <label className="break-daily-goal">
          <span className="break-daily-goal-label">Daily Goal</span>
          <input
            type="range"
            min={MIN_BREAK_DAILY_GOAL}
            max={MAX_BREAK_DAILY_GOAL}
            step={1}
            value={dailyGoal}
            onChange={(e) => onChangeDailyGoal(Number(e.target.value))}
            aria-label="Daily goal per break category"
            aria-valuemin={MIN_BREAK_DAILY_GOAL}
            aria-valuemax={MAX_BREAK_DAILY_GOAL}
            aria-valuenow={dailyGoal}
            aria-valuetext={`${dailyGoal} per category`}
          />
          <span className="break-daily-goal-value" aria-hidden="true">
            {dailyGoal}
          </span>
        </label>

        <ul className="break-tally-list">
          {BREAK_TYPES.map((def) => {
            const count = tallies[def.id] ?? 0;
            const progress = breakGoalProgressRatio(count, dailyGoal);
            const goalMet = isBreakDailyGoalMet(count, dailyGoal);
            return (
              <li key={def.id} className="break-tally-row">
                <div className="break-tally-meta">
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
                </div>
                <div
                  className={
                    goalMet
                      ? "break-tally-bar is-met"
                      : "break-tally-bar"
                  }
                  style={
                    {
                      ["--progress" as string]: progress,
                    } as CSSProperties
                  }
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={dailyGoal}
                  aria-valuenow={Math.min(count, dailyGoal)}
                  aria-label={`${def.label} ${count} of ${dailyGoal} toward daily goal`}
                >
                  <div className="break-tally-bar-track">
                    <div className="break-tally-bar-fill" />
                  </div>
                  {goalMet && (
                    <span className="break-tally-celebrate" title="Daily goal met">
                      <GoalCelebrateIcon />
                    </span>
                  )}
                </div>
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
