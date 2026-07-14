/**
 * Playback wiring for time announcements (#17). A 500ms pump watches the
 * wall clock; when the next boundary falls inside a full-interval lookahead
 * window it maps that wall-clock instant onto the audio clock and schedules
 * the word sprites sample-accurately. Scheduling onto the audio clock early
 * (up to one full interval ahead) keeps announcements reliable in throttled
 * background tabs, where setInterval may fire far less often than PUMP_MS. A
 * capped miss-grace catch-up covers the case where the pump overslept past
 * the boundary. Word sprites are decoded once per voice.
 */
import {
  ANNOUNCE_WORDS,
  type AnnounceSettings,
  getAnnounceVoice,
  missedBoundaryMs,
  nextBoundaryMs,
  scheduleLookaheadMs,
  scheduleMissGraceMs,
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
/**
 * Minimum schedule lookahead (ms). Prefer {@link scheduleLookaheadMs} — a fixed
 * 60s window is not enough when background timers sleep for most of an
 * interval (see #47 residual after PR #46).
 */
export const LOOKAHEAD_MS = 60_000;
/** Minimum miss-grace floor (ms). Prefer {@link scheduleMissGraceMs}. */
export const MISS_GRACE_MS = 60_000;

/** Fade-in when the announce bus first carries audible output. */
export const FIRST_OUTPUT_RAMP_SEC = 0.1;

/** Delay before the first word — lets the bus ramp settle. */
export const FIRST_OUTPUT_SETTLE_SEC = 0.05;

export class AnnounceEngine {
  private settings: AnnounceSettings;
  private timer: ReturnType<typeof setInterval> | null = null;
  /**
   * Wall-clock boundary currently reserved for an in-flight / pending audio
   * schedule. Cleared by {@link resync} so a resume can re-map wall→audio.
   */
  private scheduledBoundaryMs = 0;
  /**
   * Highest boundary successfully spoken or enqueued. Survives {@link resync}
   * so miss-grace catch-up cannot re-fire a mark after lookahead has already
   * advanced to a later reservation (#62).
   */
  private committedBoundaryMs = 0;
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
  /** True while pump() is awaiting speak — prevents overlapping schedules. */
  private scheduling = false;
  /**
   * BufferSources enqueued onto the audio clock for pending phrases.
   * Cleared on {@link resync} / {@link stop} so a remapped schedule cannot
   * leave an orphan copy of the same boundary sounding (#73).
   */
  private pendingSources: AudioBufferSourceNode[] = [];

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
    // Don't wait a full PUMP_MS before the first schedule attempt.
    void this.pump();
  }

  updateSettings(settings: AnnounceSettings): void {
    const voiceChanged = settings.voiceId !== this.settings.voiceId;
    const intervalChanged = settings.intervalMin !== this.settings.intervalMin;
    const enabledNow = settings.enabled && !this.settings.enabled;
    this.settings = settings;
    if (voiceChanged) {
      this.vocoderPrimed = false;
      void this.preload(settings.voiceId);
    }
    // Interval change invalidates a boundary reserved for the old cadence.
    if (intervalChanged) {
      this.scheduledBoundaryMs = 0;
      this.committedBoundaryMs = 0;
    }
    if (enabledNow || intervalChanged) void this.pump();
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

  /**
   * Drop the pending wall→audio reservation so the next pump can re-map.
   * Call after AudioContext resume: a long suspend freezes the audio clock
   * while wall time advances, so a far-ahead schedule would otherwise fire at
   * the wrong civil time. Does not clear {@link committedBoundaryMs} — already
   * spoken / enqueued marks must not re-enter miss-grace catch-up (#62).
   * Cancels orphan BufferSources from the prior mapping first (#73).
   */
  resync(): void {
    this.cancelPendingSources();
    this.scheduledBoundaryMs = 0;
    void this.pump();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.scheduledBoundaryMs = 0;
    this.committedBoundaryMs = 0;
    this.hasScheduledOutput = false;
    this.vocoderPrimed = false;
    this.scheduling = false;
    this.speakGeneration += 1;
    this.cancelPendingSources();
    const t = this.ctx.currentTime;
    this.outputBus.gain.cancelScheduledValues(t);
    this.outputBus.gain.setValueAtTime(0, t);
  }

  /** Stop any audio-clock schedules that have not yet finished playing. */
  private cancelPendingSources(): void {
    for (const source of this.pendingSources) {
      try {
        source.stop();
      } catch {
        // Already stopped / never started — ignore.
      }
    }
    this.pendingSources = [];
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
    if (this.scheduling) return;

    const nowMs = Date.now();
    const intervalMin = this.settings.intervalMin;
    const lookaheadMs = scheduleLookaheadMs(intervalMin);
    const missGraceMs = scheduleMissGraceMs(intervalMin);
    const missed = missedBoundaryMs(nowMs, intervalMin, missGraceMs);
    // Catch up only when the missed mark is strictly after anything we have
    // already committed. Comparing only to scheduledBoundaryMs (#46) lets
    // full-interval lookahead advance the reservation to the *next* mark,
    // after which miss-grace re-selects the earlier mark every other pump (#62).
    const boundaryMs =
      missed !== null && missed > this.committedBoundaryMs
        ? missed
        : nextBoundaryMs(nowMs, intervalMin);

    if (boundaryMs === this.scheduledBoundaryMs) return;
    // Past marks already committed: never re-speak. Future marks equal to
    // committed are only re-armed when resync cleared the pending reservation
    // (scheduledBoundaryMs === 0) so wall→audio can be remapped.
    if (boundaryMs < this.committedBoundaryMs) return;
    if (
      boundaryMs === this.committedBoundaryMs &&
      (boundaryMs <= nowMs || this.scheduledBoundaryMs !== 0)
    ) {
      return;
    }
    if (boundaryMs > nowMs && boundaryMs - nowMs > lookaheadMs) return;

    // Reserve before awaiting preload so concurrent pumps don't double-speak.
    this.scheduledBoundaryMs = boundaryMs;
    this.scheduling = true;
    try {
      const boundary = new Date(boundaryMs);
      const when =
        boundaryMs <= nowMs
          ? this.ctx.currentTime + 0.05
          : this.ctx.currentTime + (boundaryMs - nowMs) / 1000;
      const scheduled = await this.speak(
        timeTokens(boundary.getHours(), boundary.getMinutes(), {
          hour12: !systemPrefers24Hour(),
        }),
        when,
      );
      if (!scheduled) {
        this.scheduledBoundaryMs = 0;
      } else {
        this.committedBoundaryMs = Math.max(
          this.committedBoundaryMs,
          boundaryMs,
        );
      }
    } finally {
      this.scheduling = false;
    }
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
      const { stopAt, lastNode } = scheduleAnnounceWord(
        this.ctx,
        buffer,
        this.outputBus,
        cursor,
        voice,
        1,
        firstOutput && firstWord,
      );
      this.pendingSources.push(lastNode);
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
