"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
} from "react";

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
import { CUE_SOUNDS } from "@/lib/cue-sounds";
import { createCelebratePulseScheduler } from "@/lib/celebrate-pulse";

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

/** Festive goal-met mark — papel picado / fiesta energy (#81), splashier at ~22px (#86). */
function GoalCelebrateIcon() {
  return (
    <svg
      className="break-tally-celebrate-icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M1.5 4.5h21"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {/* Papel picado pennants */}
      <path fill="#F45B69" d="M2 4.7h4.8L4.4 11.1 2 4.7z" />
      <path fill="#F4A261" d="M6.8 4.7h4.8L9.2 11.1 6.8 4.7z" />
      <path fill="#E9C46A" d="M11.6 4.7h4.8L14 11.1 11.6 4.7z" />
      <path fill="#2A9D8F" d="M16.4 4.7H21.2L18.8 11.1 16.4 4.7z" />
      {/* Tiny cutouts */}
      <circle cx="4.4" cy="6.6" r="0.55" fill="rgba(18,20,26,0.55)" />
      <circle cx="9.2" cy="6.6" r="0.55" fill="rgba(18,20,26,0.55)" />
      <circle cx="14" cy="6.6" r="0.55" fill="rgba(18,20,26,0.55)" />
      <circle cx="18.8" cy="6.6" r="0.55" fill="rgba(18,20,26,0.55)" />
      {/* Confetti sparkles */}
      <circle cx="4.2" cy="14.2" r="1.15" fill="#E76F51" />
      <circle cx="19.6" cy="13.6" r="1" fill="#457B9D" />
      <circle cx="7.8" cy="17.8" r="0.7" fill="#F45B69" />
      <circle cx="16.4" cy="18.2" r="0.65" fill="#2A9D8F" />
      <path
        fill="#E9C46A"
        d="M12 11.2l0.75 2.35 2.4.7-2.4.7L12 17.3l-.75-2.35-2.4-.7 2.4-.7L12 11.2z"
      />
      <path
        fill="#F4A261"
        d="M20.2 17.4l0.35 1.1 1.1.32-1.1.32-.35 1.1-.35-1.1-1.1-.32 1.1-.32.35-1.1z"
      />
    </svg>
  );
}

/**
 * Goal-met celebrate mark: splashier icon, grow→shrink on meet, occasional
 * replay while still met. Stops on unmount (clear/reset drops below goal).
 * Honors prefers-reduced-motion (static icon only).
 */
function GoalCelebrateMark() {
  const [pulseClass, setPulseClass] = useState("");

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let replay = false;
    let scheduler = createCelebratePulseScheduler({
      onPulse: () => {},
      prefersReducedMotion: true,
    });

    const triggerPulse = () => {
      if (cancelled) return;
      // Retrigger CSS animation by clearing then re-adding the class.
      setPulseClass("");
      requestAnimationFrame(() => {
        if (cancelled) return;
        setPulseClass(replay ? "is-replay-pulse" : "is-meet-pulse");
        replay = true;
      });
    };

    const restart = (reduced: boolean) => {
      scheduler.stop();
      if (reduced) {
        setPulseClass("");
        return;
      }
      replay = false;
      scheduler = createCelebratePulseScheduler({
        onPulse: triggerPulse,
        prefersReducedMotion: false,
        pulseOnStart: true,
      });
      scheduler.start();
    };

    const onMotionChange = () => restart(motionQuery.matches);

    restart(motionQuery.matches);

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", onMotionChange);
    } else {
      motionQuery.addListener(onMotionChange);
    }

    return () => {
      cancelled = true;
      scheduler.stop();
      if (typeof motionQuery.removeEventListener === "function") {
        motionQuery.removeEventListener("change", onMotionChange);
      } else {
        motionQuery.removeListener(onMotionChange);
      }
    };
  }, []);

  const className = pulseClass
    ? `break-tally-celebrate ${pulseClass}`
    : "break-tally-celebrate";

  return (
    <span className={className} title="Daily goal met">
      <GoalCelebrateIcon />
    </span>
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
                    placeholder="do a little dance"
                  />
                </label>
              )}
            </li>
          );
        })}
      </ul>

      <div className="voice break-globals">
        <label className="voice-interval">
          Cue
          <select
            value={settings.cueSoundId}
            onChange={(e) =>
              onChangeSettings({ cueSoundId: e.target.value as BreakSettings["cueSoundId"] })
            }
            aria-label="Break cue sound"
          >
            {CUE_SOUNDS.map((sound) => (
              <option key={sound.id} value={sound.id} title={sound.description}>
                {sound.label}
              </option>
            ))}
          </select>
        </label>

        <label className="voice-volume">
          Volume
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
                  {goalMet && <GoalCelebrateMark />}
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
