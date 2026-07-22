/**
 * Pump loop wiring for meditation sounds: every 200ms it asks the pure
 * scheduler (src/lib/meditation.ts) what falls inside the 600ms lookahead
 * window on the audio clock and schedules those voices sample-accurately.
 * Timing therefore stays correct in background tabs, where setInterval is
 * throttled but the AudioContext clock keeps running.
 */
import {
  type FireSchedule,
  MEDITATION_VOICES,
  type MeditationSettings,
  collectDueEvents,
  initFireSchedule,
} from "@/lib/meditation";
import type { VoiceFireEvent } from "@/lib/sound-glow";

import { playVoice } from "./voices";

const PUMP_MS = 200;
const LOOKAHEAD_SEC = 0.6;

const VOICE_SYNTH = new Map(MEDITATION_VOICES.map((v) => [v.id, v.synth]));

export class MeditationEngine {
  private schedule: FireSchedule = {};
  private settings: MeditationSettings;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFire: ((event: VoiceFireEvent) => void) | null = null;
  /** Pending "voice heard" callbacks, cleared on stop so none fire late. */
  private fireTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    settings: MeditationSettings,
  ) {
    this.settings = settings;
  }

  /** Register a callback fired when a voice is actually heard (for UI glow). */
  setOnFire(cb: (event: VoiceFireEvent) => void): void {
    this.onFire = cb;
  }

  /**
   * Defer `onFire` until the scheduled audio-clock time `whenSec` is reached,
   * so the row lights up in sync with what's heard rather than when it was
   * scheduled (up to LOOKAHEAD_SEC early).
   */
  private notifyFireAt(voiceId: string, whenSec: number): void {
    if (!this.onFire) return;
    const delayMs = Math.max(0, (whenSec - this.ctx.currentTime) * 1000);
    const timer = setTimeout(() => {
      this.fireTimers.delete(timer);
      this.onFire?.({ voiceId, whenSec });
    }, delayMs);
    this.fireTimers.add(timer);
  }

  start(): void {
    if (this.timer) return;
    this.schedule = initFireSchedule(
      this.settings,
      this.ctx.currentTime,
      Date.now(),
    );
    this.timer = setInterval(() => this.pump(), PUMP_MS);
  }

  updateSettings(settings: MeditationSettings): void {
    this.settings = settings;
  }

  /** Fire a voice immediately (UI preview button). */
  preview(voiceId: string): void {
    const synth = VOICE_SYNTH.get(voiceId);
    const voice = this.settings[voiceId];
    if (!synth || !voice) return;
    playVoice(synth, this.ctx, this.dest, this.ctx.currentTime, voice.volume);
    this.onFire?.({ voiceId, whenSec: this.ctx.currentTime });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const timer of this.fireTimers) clearTimeout(timer);
    this.fireTimers.clear();
  }

  private pump(): void {
    const { events, schedule } = collectDueEvents(
      this.schedule,
      this.settings,
      this.ctx.currentTime,
      LOOKAHEAD_SEC,
      Date.now(),
    );
    this.schedule = schedule;
    for (const event of events) {
      const synth = VOICE_SYNTH.get(event.voiceId);
      const voice = this.settings[event.voiceId];
      if (synth && voice) {
        playVoice(synth, this.ctx, this.dest, event.whenSec, voice.volume);
        this.notifyFireAt(event.voiceId, event.whenSec);
      }
    }
  }
}
