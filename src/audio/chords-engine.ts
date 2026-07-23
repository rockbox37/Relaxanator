/**
 * Pump loop wiring for the chord section (#chords): every 200ms it asks the
 * pure scheduler (src/lib/chords.ts) which voices fall inside the lookahead
 * window on the audio clock, expands each due voice into its note play-plan,
 * and schedules the whole phrase sample-accurately through its timbre. Mirrors
 * MeditationEngine so timing stays correct in throttled background tabs.
 *
 * Unlike a meditation one-shot, a chord voice can span several seconds (a
 * progression). The entire phrase is scheduled ahead on the audio clock the
 * moment the voice fires, so it plays out precisely even if later pumps are
 * throttled.
 */
import {
  CHORD_VOICES,
  type ChordFireSchedule,
  type ChordSettings,
  type ChordVoiceDef,
  buildChordPlan,
  collectDueChordEvents,
  initChordSchedule,
} from "@/lib/chords";
import { sliderToGain } from "@/lib/audio-taper";
import type { VoiceFireEvent } from "@/lib/sound-glow";

import { playChordVoice } from "./chord-voices";

const PUMP_MS = 200;
const LOOKAHEAD_SEC = 0.6;

const VOICE_BY_ID = new Map<string, ChordVoiceDef>(
  CHORD_VOICES.map((v) => [v.id, v]),
);

/**
 * Voice resolver handed to the pure scheduler so a looping voice can derive its
 * bar-length re-trigger interval from the plan (see `chordLoopIntervalSec`).
 */
const resolveVoice = (voiceId: string): ChordVoiceDef | undefined =>
  VOICE_BY_ID.get(voiceId);

export class ChordsEngine {
  private schedule: ChordFireSchedule = {};
  private settings: ChordSettings;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onFire: ((event: VoiceFireEvent) => void) | null = null;
  /** Pending "voice heard" callbacks, cleared on stop so none fire late. */
  private fireTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    settings: ChordSettings,
  ) {
    this.settings = settings;
  }

  start(): void {
    if (this.timer) return;
    this.schedule = initChordSchedule(
      this.settings,
      this.ctx.currentTime,
      resolveVoice,
    );
    this.timer = setInterval(() => this.pump(), PUMP_MS);
  }

  updateSettings(settings: ChordSettings): void {
    this.settings = settings;
  }

  /** Register a callback fired when a voice is actually heard (for UI glow). */
  setOnFire(cb: (event: VoiceFireEvent) => void): void {
    this.onFire = cb;
  }

  /** Defer `onFire` until the scheduled audio-clock time `whenSec` is reached. */
  private notifyFireAt(voiceId: string, whenSec: number): void {
    if (!this.onFire) return;
    const delayMs = Math.max(0, (whenSec - this.ctx.currentTime) * 1000);
    const timer = setTimeout(() => {
      this.fireTimers.delete(timer);
      this.onFire?.({ voiceId, whenSec });
    }, delayMs);
    this.fireTimers.add(timer);
  }

  /** Play a voice immediately from now (UI preview button). */
  preview(voiceId: string): void {
    const voice = VOICE_BY_ID.get(voiceId);
    const settings = this.settings[voiceId];
    if (!voice || !settings) return;
    const events = buildChordPlan(voice, settings, this.ctx.currentTime);
    // settings.volume is the stored 0..1 slider position; taper it to a
    // perceptual gain at the engine->synth boundary (FR-2).
    playChordVoice(
      settings.timbreId,
      this.ctx,
      this.dest,
      events,
      sliderToGain(settings.volume),
    );
    this.onFire?.({ voiceId, whenSec: this.ctx.currentTime });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const timer of this.fireTimers) clearTimeout(timer);
    this.fireTimers.clear();
  }

  private pump(): void {
    const { events, schedule } = collectDueChordEvents(
      this.schedule,
      this.settings,
      this.ctx.currentTime,
      LOOKAHEAD_SEC,
      resolveVoice,
    );
    this.schedule = schedule;
    for (const event of events) {
      const voice = VOICE_BY_ID.get(event.voiceId);
      const settings = this.settings[event.voiceId];
      if (!voice || !settings) continue;
      const plan = buildChordPlan(voice, settings, event.whenSec);
      playChordVoice(
        settings.timbreId,
        this.ctx,
        this.dest,
        plan,
        sliderToGain(settings.volume),
      );
      this.notifyFireAt(event.voiceId, event.whenSec);
    }
  }
}
