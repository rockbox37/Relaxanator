/**
 * Pump loop for break prompts: every 200ms it asks the pure scheduler
 * (src/lib/breaks.ts) what falls inside the 600ms lookahead window on the
 * audio clock and fires those cues sample-accurately. Timing therefore
 * stays correct in background tabs (NFR-1), where setInterval is throttled
 * but the AudioContext clock keeps running.
 */
import {
  type BreakDueEvent,
  type BreakFireSchedule,
  type BreakKind,
  type BreakSettings,
  applySnooze,
  breakPromptMessage,
  collectDueBreakEvents,
  initBreakFireSchedule,
} from "@/lib/breaks";
import { showBreakNotification } from "@/lib/break-notifications";

import { playBreakCue } from "./break-cue";

const PUMP_MS = 200;
const LOOKAHEAD_SEC = 0.6;

export type BreakFireHandler = (event: {
  kind: BreakKind;
  message: string;
  whenSec: number;
}) => void;

export class BreakEngine {
  private schedule: BreakFireSchedule = {};
  private settings: BreakSettings;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFire: BreakFireHandler | null = null;
  /** Deduplicate UI/notification for the same audio-clock fire. */
  private lastNotified = new Map<BreakKind, number>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    settings: BreakSettings,
  ) {
    this.settings = settings;
  }

  setOnFire(handler: BreakFireHandler | null): void {
    this.onFire = handler;
  }

  start(): void {
    if (this.timer) return;
    this.schedule = initBreakFireSchedule(this.settings, this.ctx.currentTime);
    this.timer = setInterval(() => this.pump(), PUMP_MS);
  }

  updateSettings(settings: BreakSettings): void {
    this.settings = settings;
  }

  /** Fire the cue immediately (UI preview button). */
  preview(): void {
    playBreakCue(
      this.ctx,
      this.dest,
      this.ctx.currentTime,
      this.settings.cueVolume,
    );
  }

  /**
   * Snooze the next fire for `kind` by the configured snooze duration
   * (FR-4). Safe to call while the pump is running.
   */
  snooze(kind: BreakKind): void {
    this.schedule = applySnooze(
      this.schedule,
      this.settings,
      kind,
      this.ctx.currentTime,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.lastNotified.clear();
  }

  private pump(): void {
    const { events, schedule } = collectDueBreakEvents(
      this.schedule,
      this.settings,
      this.ctx.currentTime,
      LOOKAHEAD_SEC,
    );
    this.schedule = schedule;
    for (const event of events) {
      this.dispatch(event);
    }
  }

  private dispatch(event: BreakDueEvent): void {
    const type = this.settings.types[event.kind];
    if (!type) return;

    playBreakCue(this.ctx, this.dest, event.whenSec, this.settings.cueVolume);

    // Avoid double-firing UI for the same scheduled instant if the pump
    // overlaps (e.g. catch-up + normal). Key on rounded audio-clock time.
    const key = Math.round(event.whenSec * 1000);
    if (this.lastNotified.get(event.kind) === key) return;
    this.lastNotified.set(event.kind, key);

    const message = breakPromptMessage(event.kind, type);
    this.onFire?.({ kind: event.kind, message, whenSec: event.whenSec });

    if (this.settings.notificationsEnabled) {
      // Schedule the Notification API call near the audio cue time. In a
      // background tab the pump may run late; showing immediately is fine
      // once the event is due (whenSec ≈ now).
      showBreakNotification({
        body: message,
        tag: `relaxanator-break-${event.kind}`,
      });
    }
  }
}
