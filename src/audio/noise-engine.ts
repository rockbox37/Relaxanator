/**
 * Web Audio wiring for the noise engine: AudioWorklet noise source ->
 * 10 peaking BiquadFilters (one per EQ band) -> master gain -> destination.
 *
 * Deliberately thin: all decisions live in src/lib (tested); this class only
 * maps state onto AudioNode parameters. Runs in the browser only.
 */
import { EQ_BAND_FREQUENCIES } from "@/lib/eq";
import { type NoiseState, clampVolume, colorToIndex } from "@/lib/noise";

/** Seconds for setTargetAtTime smoothing — click-free slider drags. */
const SMOOTHING = 0.05;
/** Q for octave-spaced graphic-EQ peaking filters. */
const BAND_Q = 1.41;

export class NoiseEngine {
  private ctx: AudioContext | null = null;
  private source: AudioWorkletNode | null = null;
  private bands: BiquadFilterNode[] = [];
  private master: GainNode | null = null;
  private mix: GainNode | null = null;
  private announceOut: GainNode | null = null;

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Shared AudioContext, available after init(). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * Mix bus other sound layers (meditation voices) connect into. Sits
   * before the output limiter so layered sounds share its headroom.
   */
  get mixBus(): AudioNode | null {
    return this.mix;
  }

  /**
   * Permanent announce output bus — wired directly to the destination,
   * bypassing the noise limiter so TTS never hits a cold compressor on
   * first connect. Gain stays at 0 until AnnounceEngine ramps it.
   */
  get announceBus(): AudioNode | null {
    return this.announceOut;
  }

  /** Create the graph. Must be called from a user gesture. */
  async init(state: NoiseState): Promise<void> {
    if (this.ctx) return;
    const ctx = new AudioContext();
    await ctx.audioWorklet.addModule("/worklets/noise-processor.js");

    const source = new AudioWorkletNode(ctx, "noise-processor", {
      numberOfInputs: 0,
      outputChannelCount: [2],
    });
    source.parameters
      .get("color")
      ?.setValueAtTime(colorToIndex(state.color), ctx.currentTime);

    const bands = EQ_BAND_FREQUENCIES.map((frequency, i) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = BAND_Q;
      filter.gain.value = state.eqCurve[i]?.gainDb ?? 0;
      return filter;
    });

    const master = ctx.createGain();
    master.gain.value = 0;

    // Everything meets at the mix bus, then a gentle limiter keeps layered
    // sounds (noise + meditation voices) from clipping the output.
    const mix = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    const announceOut = ctx.createGain();
    announceOut.gain.value = 0;

    let tail: AudioNode = source;
    for (const band of bands) {
      tail.connect(band);
      tail = band;
    }
    tail.connect(master);
    master.connect(mix);
    mix.connect(limiter);
    limiter.connect(ctx.destination);
    announceOut.connect(ctx.destination);

    this.ctx = ctx;
    this.source = source;
    this.bands = bands;
    this.master = master;
    this.mix = mix;
    this.announceOut = announceOut;
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
  }

  /**
   * Prime the hardware output and both downstream paths (mix limiter + announce
   * bus) with near-silent signal during the user gesture so the first audible
   * vocoder word does not pop the destination or a cold graph edge.
   */
  primeAudioOutput(): void {
    const ctx = this.ctx;
    const mix = this.mix;
    const announceOut = this.announceOut;
    if (!ctx || !mix || !announceOut || ctx.state !== "running") return;

    const t = ctx.currentTime;
    const tickSec = 0.01;

    // Wake the audio device / destination (ctx.resume() click mitigation).
    const osc = ctx.createOscillator();
    const silent = ctx.createGain();
    silent.gain.value = 0;
    osc.connect(silent).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1 / ctx.sampleRate);

    const frames = Math.max(1, Math.ceil(ctx.sampleRate * tickSec));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      samples[i] = (Math.random() * 2 - 1) * 0.0001;
    }

    const primeMix = (dest: AudioNode) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.01;
      source.connect(gain).connect(dest);
      source.start(t);
      source.stop(t + tickSec);
    };

    primeMix(mix);
    primeMix(announceOut);
  }

  /** @deprecated Use {@link primeAudioOutput} — kept for call-site clarity. */
  primeLimiter(): void {
    this.primeAudioOutput();
  }

  async suspend(): Promise<void> {
    await this.ctx?.suspend();
  }

  setColor(color: NoiseState["color"]): void {
    if (!this.ctx || !this.source) return;
    this.source.parameters
      .get("color")
      ?.setValueAtTime(colorToIndex(color), this.ctx.currentTime);
  }

  setBandGain(bandIndex: number, gainDb: number): void {
    const band = this.bands[bandIndex];
    if (!this.ctx || !band) return;
    band.gain.setTargetAtTime(gainDb, this.ctx.currentTime, SMOOTHING);
  }

  setMasterVolume(volume: number): void {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(
      clampVolume(volume),
      this.ctx.currentTime,
      SMOOTHING,
    );
  }

  async dispose(): Promise<void> {
    await this.ctx?.close();
    this.ctx = null;
    this.source = null;
    this.bands = [];
    this.master = null;
    this.mix = null;
    this.announceOut = null;
  }
}
