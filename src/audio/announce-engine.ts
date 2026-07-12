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
  systemPrefers24Hour,
  timeTokens,
  wordGapAfterToken,
} from "@/lib/announce";
import { fadeInDecodedBuffer } from "@/audio/announce-buffer";
import {
  VOCODER_DETUNE_CENTS,
  scheduleAnnounceWord,
} from "@/audio/announce-voice";

const PUMP_MS = 500;
const LOOKAHEAD_MS = 1500;

/** Fade-in when the announce bus first carries audible output. */
export const FIRST_OUTPUT_RAMP_SEC = 0.1;

/** Delay before the first word — lets the bus ramp settle. */
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
  /** Always connected to dest — never connect/disconnect per phrase. */
  private readonly outputBus: GainNode;
  private vocoderPrimed = false;
  /** Bumped on stop() so in-flight speak() aborts after preload. */
  private speakGeneration = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    dest: AudioNode,
    settings: AnnounceSettings,
  ) {
    this.settings = settings;
    this.outputBus = ctx.createGain();
    this.outputBus.gain.value = 0;
    this.outputBus.connect(dest);
  }

  start(): void {
    if (this.timer) return;
    void this.preload(this.settings.voiceId);
    this.timer = setInterval(() => void this.pump(), PUMP_MS);
  }

  updateSettings(settings: AnnounceSettings): void {
    const voiceChanged = settings.voiceId !== this.settings.voiceId;
    this.settings = settings;
    if (voiceChanged) {
      this.vocoderPrimed = false;
      void this.preload(settings.voiceId);
    }
  }

  /** Speak the current wall-clock time immediately (UI preview / audition). */
  async preview(): Promise<void> {
    const now = new Date();
    await this.speak(
      timeTokens(now.getHours(), now.getMinutes(), {
        hour12: !systemPrefers24Hour(),
      }),
      this.ctx.currentTime + 0.05,
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scheduledBoundaryMs = 0;
    this.hasScheduledOutput = false;
    this.vocoderPrimed = false;
    this.speakGeneration += 1;
    this.outputBus.gain.value = 0;
  }

  private async preload(voiceId: string): Promise<void> {
    const voice = getAnnounceVoice(voiceId);
    if (this.buffers.has(voice.dir)) {
      this.primeVocoderPath(voice);
      return;
    }

    let job = this.preloadJobs.get(voice.dir);
    if (!job) {
      job = this.loadVoiceBuffers(voice);
      this.preloadJobs.set(voice.dir, job);
      void job.finally(() => this.preloadJobs.delete(voice.dir));
    }
    await job;
    this.primeVocoderPath(voice);
  }

  private async loadVoiceBuffers(voice: ReturnType<typeof getAnnounceVoice>): Promise<void> {
    const words = new Map<string, AudioBuffer>();
    await Promise.all(
      ANNOUNCE_WORDS.map(async (word) => {
        try {
          const res = await fetch(`/audio/tts/${voice.dir}/${word}.wav`);
          if (!res.ok) return;
          const raw = await this.ctx.decodeAudioData(await res.arrayBuffer());
          words.set(word, fadeInDecodedBuffer(raw));
        } catch {
          // Missing sprite: the word is skipped at speak time.
        }
      }),
    );
    this.buffers.set(voice.dir, words);
  }

  /**
   * Warm the vocoder detune + playbackRate resampler with a sub-audible blip
   * routed through the permanent bus so the first real "its" does not pop.
   */
  private primeVocoderPath(voice: ReturnType<typeof getAnnounceVoice>): void {
    if (this.vocoderPrimed || voice.id !== "vocoder") return;
    if (this.ctx.state !== "running") return;

    const buffer = this.buffers.get(voice.dir)?.get("its");
    if (!buffer) return;

    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = voice.playbackRate;
    source.detune.value = VOCODER_DETUNE_CENTS;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.00001;
    source.connect(gain).connect(this.outputBus);
    source.start(t, 0, 0.002);
    source.stop(t + 0.003);

    this.vocoderPrimed = true;
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
      timeTokens(boundary.getHours(), boundary.getMinutes(), {
        hour12: !systemPrefers24Hour(),
      }),
      when,
    );
    if (scheduled) this.scheduledBoundaryMs = boundaryMs;
  }

  private async speak(tokens: string[], when: number): Promise<boolean> {
    const generation = this.speakGeneration;
    const voice = getAnnounceVoice(this.settings.voiceId);
    await this.preload(voice.id);
    if (generation !== this.speakGeneration) return false;
    const words = this.buffers.get(voice.dir);
    if (!words) return false;

    const at = Math.max(when, this.ctx.currentTime);
    const firstOutput = !this.hasScheduledOutput;

    if (firstOutput) {
      this.outputBus.gain.cancelScheduledValues(at);
      this.outputBus.gain.setValueAtTime(0, at);
      this.outputBus.gain.linearRampToValueAtTime(
        this.settings.volume,
        at + FIRST_OUTPUT_RAMP_SEC,
      );
    } else {
      this.outputBus.gain.setValueAtTime(this.settings.volume, at);
    }

    let cursor = firstOutput ? at + FIRST_OUTPUT_SETTLE_SEC : at;
    let scheduled = false;
    let firstWord = true;
    for (const token of tokens) {
      const buffer = words.get(token);
      if (!buffer) continue;
      scheduled = true;
      const { stopAt } = scheduleAnnounceWord(
        this.ctx,
        buffer,
        this.outputBus,
        cursor,
        voice,
        1,
        firstOutput && firstWord,
      );
      firstWord = false;
      cursor = stopAt + wordGapAfterToken(token);
    }
    if (!scheduled) {
      if (firstOutput) {
        this.outputBus.gain.cancelScheduledValues(at);
        this.outputBus.gain.setValueAtTime(0, at);
      }
      return false;
    }
    this.hasScheduledOutput = true;
    return true;
  }
}
