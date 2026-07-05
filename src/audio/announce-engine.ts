/**
 * Playback wiring for time announcements (#17). A 500ms pump watches the
 * wall clock; when the next boundary falls inside the lookahead window it
 * maps that wall-clock instant onto the audio clock and schedules the word
 * sprites sample-accurately, so the announcement lands on the boundary even
 * in throttled background tabs. Word sprites are decoded once per voice.
 */
import {
  ANNOUNCE_WORDS,
  type AnnounceSettings,
  getAnnounceVoice,
  nextBoundaryMs,
  timeTokens,
  wordGapAfterToken,
} from "@/lib/announce";
import { scheduleAnnounceWord } from "@/audio/announce-voice";

const PUMP_MS = 500;
const LOOKAHEAD_MS = 1500;

/** Fade-in when the announce bus first connects to a cold mix/limiter chain. */
export const FIRST_OUTPUT_RAMP_SEC = 0.1;

/** Delay before the first word — lets the bus ramp and limiter settle. */
export const FIRST_OUTPUT_SETTLE_SEC = 0.05;

export class AnnounceEngine {
  private settings: AnnounceSettings;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledBoundaryMs = 0;
  private buffers = new Map<string, Map<string, AudioBuffer>>();
  /** In-flight sprite loads — speak/preview must await these, not an empty map. */
  private preloadJobs = new Map<string, Promise<void>>();
  /** False until the first phrase is queued — drives bus warm-up ramp. */
  private hasScheduledOutput = false;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
    settings: AnnounceSettings,
  ) {
    this.settings = settings;
  }

  start(): void {
    if (this.timer) return;
    void this.preload(this.settings.voiceId);
    this.timer = setInterval(() => void this.pump(), PUMP_MS);
  }

  updateSettings(settings: AnnounceSettings): void {
    const voiceChanged = settings.voiceId !== this.settings.voiceId;
    this.settings = settings;
    if (voiceChanged) void this.preload(settings.voiceId);
  }

  /** Speak the upcoming boundary's time immediately (UI preview). */
  async preview(): Promise<void> {
    const boundary = new Date(
      nextBoundaryMs(Date.now(), this.settings.intervalMin),
    );
    await this.speak(
      timeTokens(boundary.getHours(), boundary.getMinutes()),
      this.ctx.currentTime + 0.05,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scheduledBoundaryMs = 0;
    this.hasScheduledOutput = false;
  }

  private async preload(voiceId: string): Promise<void> {
    const voice = getAnnounceVoice(voiceId);
    if (this.buffers.has(voice.dir)) return;

    let job = this.preloadJobs.get(voice.dir);
    if (!job) {
      job = this.loadVoiceBuffers(voice);
      this.preloadJobs.set(voice.dir, job);
      void job.finally(() => this.preloadJobs.delete(voice.dir));
    }
    await job;
  }

  private async loadVoiceBuffers(voice: ReturnType<typeof getAnnounceVoice>): Promise<void> {
    const words = new Map<string, AudioBuffer>();
    await Promise.all(
      ANNOUNCE_WORDS.map(async (word) => {
        try {
          const res = await fetch(`/audio/tts/${voice.dir}/${word}.wav`);
          if (!res.ok) return;
          words.set(word, await this.ctx.decodeAudioData(await res.arrayBuffer()));
        } catch {
          // Missing sprite: the word is skipped at speak time.
        }
      }),
    );
    this.buffers.set(voice.dir, words);
  }

  private async pump(): Promise<void> {
    if (!this.settings.enabled || this.ctx.state !== "running") return;
    const nowMs = Date.now();
    const boundaryMs = nextBoundaryMs(nowMs, this.settings.intervalMin);
    if (boundaryMs - nowMs > LOOKAHEAD_MS) return;
    if (boundaryMs === this.scheduledBoundaryMs) return;

    const boundary = new Date(boundaryMs);
    const when = this.ctx.currentTime + (boundaryMs - nowMs) / 1000;
    const scheduled = await this.speak(
      timeTokens(boundary.getHours(), boundary.getMinutes()),
      when,
    );
    if (scheduled) this.scheduledBoundaryMs = boundaryMs;
  }

  private async speak(tokens: string[], when: number): Promise<boolean> {
    const voice = getAnnounceVoice(this.settings.voiceId);
    await this.preload(voice.id);
    const words = this.buffers.get(voice.dir);
    if (!words) return false;

    const at = Math.max(when, this.ctx.currentTime);
    const firstOutput = !this.hasScheduledOutput;

    const gain = this.ctx.createGain();
    if (firstOutput) {
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(
        this.settings.volume,
        at + FIRST_OUTPUT_RAMP_SEC,
      );
    } else {
      gain.gain.value = this.settings.volume;
    }
    gain.connect(this.dest);

    let cursor = firstOutput ? at + FIRST_OUTPUT_SETTLE_SEC : at;
    let lastNode: AudioNode | null = null;
    let scheduled = false;
    let firstWord = true;
    for (const token of tokens) {
      const buffer = words.get(token);
      if (!buffer) continue;
      scheduled = true;
      const { stopAt, lastNode: node } = scheduleAnnounceWord(
        this.ctx,
        buffer,
        gain,
        cursor,
        voice,
        1,
        firstOutput && firstWord,
      );
      firstWord = false;
      cursor = stopAt + wordGapAfterToken(token);
      lastNode = node;
    }
    if (!scheduled) {
      gain.disconnect();
      return false;
    }
    this.hasScheduledOutput = true;
    if (lastNode && "onended" in lastNode) {
      (lastNode as AudioScheduledSourceNode).onended = () => gain.disconnect();
    } else {
      gain.disconnect();
    }
    return true;
  }
}
