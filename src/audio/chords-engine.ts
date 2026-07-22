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

import { playChordVoice } from "./chord-voices";

const PUMP_MS = 200;
const LOOKAHEAD_SEC = 0.6;

const VOICE_BY_ID = new Map<string, ChordVoiceDef>(
  CHORD_VOICES.map((v) => [v.id, v]),
);

export class ChordsEngine {
  private schedule: ChordFireSchedule = {};
  private settings: ChordSettings;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    settings: ChordSettings,
  ) {
    this.settings = settings;
  }

  start(): void {
    if (this.timer) return;
    this.schedule = initChordSchedule(this.settings, this.ctx.currentTime);
    this.timer = setInterval(() => this.pump(), PUMP_MS);
  }

  updateSettings(settings: ChordSettings): void {
    this.settings = settings;
  }

  /** Play a voice immediately from now (UI preview button). */
  preview(voiceId: string): void {
    const voice = VOICE_BY_ID.get(voiceId);
    const settings = this.settings[voiceId];
    if (!voice || !settings) return;
    const events = buildChordPlan(voice, settings, this.ctx.currentTime);
    playChordVoice(settings.timbreId, this.ctx, this.dest, events, settings.volume);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private pump(): void {
    const { events, schedule } = collectDueChordEvents(
      this.schedule,
      this.settings,
      this.ctx.currentTime,
      LOOKAHEAD_SEC,
    );
    this.schedule = schedule;
    for (const event of events) {
      const voice = VOICE_BY_ID.get(event.voiceId);
      const settings = this.settings[event.voiceId];
      if (!voice || !settings) continue;
      const plan = buildChordPlan(voice, settings, event.whenSec);
      playChordVoice(settings.timbreId, this.ctx, this.dest, plan, settings.volume);
    }
  }
}
