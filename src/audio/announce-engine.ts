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
} from "@/lib/announce";
import { scheduleAnnounceWord } from "@/audio/announce-voice";

const PUMP_MS = 500;
const LOOKAHEAD_MS = 1500;
const WORD_GAP_SEC = 0.12;

export class AnnounceEngine {
  private settings: AnnounceSettings;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduledBoundaryMs = 0;
  private buffers = new Map<string, Map<string, AudioBuffer>>();

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
  }

  private async preload(voiceId: string): Promise<void> {
    const voice = getAnnounceVoice(voiceId);
    if (this.buffers.has(voice.dir)) return;
    const words = new Map<string, AudioBuffer>();
    this.buffers.set(voice.dir, words);
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
  }

  private async pump(): Promise<void> {
    if (!this.settings.enabled || this.ctx.state !== "running") return;
    const nowMs = Date.now();
    const boundaryMs = nextBoundaryMs(nowMs, this.settings.intervalMin);
    if (boundaryMs - nowMs > LOOKAHEAD_MS) return;
    if (boundaryMs === this.scheduledBoundaryMs) return;
    this.scheduledBoundaryMs = boundaryMs;

    const boundary = new Date(boundaryMs);
    const when = this.ctx.currentTime + (boundaryMs - nowMs) / 1000;
    await this.speak(
      timeTokens(boundary.getHours(), boundary.getMinutes()),
      when,
    );
  }

  private async speak(tokens: string[], when: number): Promise<void> {
    const voice = getAnnounceVoice(this.settings.voiceId);
    await this.preload(voice.id);
    const words = this.buffers.get(voice.dir);
    if (!words) return;

    const gain = this.ctx.createGain();
    gain.gain.value = this.settings.volume;
    gain.connect(this.dest);

    let at = Math.max(when, this.ctx.currentTime);
    let lastNode: AudioNode | null = null;
    for (const token of tokens) {
      const buffer = words.get(token);
      if (!buffer) continue;
      const { stopAt, lastNode: node } = scheduleAnnounceWord(
        this.ctx,
        buffer,
        gain,
        at,
        voice,
        1,
      );
      at = stopAt + WORD_GAP_SEC;
      lastNode = node;
    }
    if (lastNode && "onended" in lastNode) {
      (lastNode as AudioScheduledSourceNode).onended = () => gain.disconnect();
    } else {
      gain.disconnect();
    }
  }
}
