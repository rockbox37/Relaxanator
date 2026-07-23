/**
 * Web Audio wiring for the noise engine: AudioWorklet noise source ->
 * 10 peaking BiquadFilters (one per EQ band) -> master gain -> destination.
 *
 * Deliberately thin: all decisions live in src/lib (tested); this class only
 * maps state onto AudioNode parameters. Runs in the browser only.
 */
import { sliderToGain } from "@/lib/audio-taper";
import { EQ_BAND_FREQUENCIES, type EqBand } from "@/lib/eq";
import { type NoiseState, clampVolume, colorToIndex } from "@/lib/noise";

import { createAudioContext, unlockAudioContext } from "./audio-unlock";

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
  /** ToDo-cue bus — routes to output past the mute-group gate (#97). */
  private todoCue: GainNode | null = null;
  /** Mute-group gate: everything except ToDo cues (0 = muted). */
  private mainGroup: GainNode | null = null;
  /** Final output gate: 0 = whole graph silenced. */
  private output: GainNode | null = null;

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
   * first connect. Unity gain: AnnounceEngine ramps its own outputBus.
   */
  get announceBus(): AudioNode | null {
    return this.announceOut;
  }

  /**
   * ToDo-reminder cue bus (#97). Feeds the final output *after* the mute-group
   * gate, so "Mute All But ToDo Reminders" leaves these cues audible while
   * silencing everything else. Still gated by the master output (Mute All).
   */
  get todoCueBus(): AudioNode | null {
    return this.todoCue;
  }

  /**
   * Create the graph. Must be called from a user gesture.
   *
   * iOS Safari (#83): create + unlock (resume + silent buffer) run
   * *before* any await so the gesture chain is not broken by worklet load.
   */
  async init(state: NoiseState): Promise<void> {
    if (this.ctx) return;
    const ctx = createAudioContext();
    // Sync unlock inside the gesture — do not await before this call.
    void unlockAudioContext(ctx);
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
    announceOut.gain.value = 1;

    // Mute stages (#97): the muted group (noise + meditation + breaks +
    // announcements) feeds mainGroup; ToDo cues bypass it. Both meet at the
    // output gate, which silences everything for Mute All.
    const mainGroup = ctx.createGain();
    mainGroup.gain.value = 1;
    const todoCue = ctx.createGain();
    todoCue.gain.value = 1;
    const output = ctx.createGain();
    output.gain.value = 1;

    let tail: AudioNode = source;
    for (const band of bands) {
      tail.connect(band);
      tail = band;
    }
    tail.connect(master);
    master.connect(mix);
    mix.connect(limiter);
    limiter.connect(mainGroup);
    // Announce keeps bypassing the limiter, but joins the muted group.
    announceOut.connect(mainGroup);
    mainGroup.connect(output);
    todoCue.connect(output);
    output.connect(ctx.destination);

    this.ctx = ctx;
    this.source = source;
    this.bands = bands;
    this.master = master;
    this.mix = mix;
    this.announceOut = announceOut;
    this.mainGroup = mainGroup;
    this.todoCue = todoCue;
    this.output = output;

    // Settle resume after async worklet load (desktop + post-gesture await).
    await unlockAudioContext(ctx);
  }

  async resume(): Promise<void> {
    if (!this.ctx) return;
    await unlockAudioContext(this.ctx);
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

  /**
   * Gently ramp every audible bus (noise + meditation via the mix bus, plus
   * the announce bus) down to silence over `durationSec` for the sleep timer
   * (#19). The clock-scheduled ramp stays accurate even in a throttled
   * background tab; the caller suspends once it completes.
   */
  fadeOut(durationSec: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const end = t + Math.max(0.01, durationSec);
    for (const node of [this.mix, this.announceOut]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(0, end);
    }
  }

  /**
   * Restore the mix + announce buses to unity, cancelling any in-flight fade.
   * Called before re-arming or after a hard stop so a later Play/resume is not
   * left silent by a sleep-timer fade that already ramped the buses down.
   */
  resetBuses(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const node of [this.mix, this.announceOut]) {
      if (!node) continue;
      node.gain.cancelScheduledValues(t);
      node.gain.value = 1;
    }
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

  /**
   * Snap every band to a whole curve at once (e.g. when a preset is selected),
   * reusing the smoothed per-band ramp so the transition stays click-free.
   */
  setEqCurve(curve: readonly EqBand[]): void {
    if (!this.ctx) return;
    curve.forEach((band, i) => this.setBandGain(i, band.gainDb));
  }

  setMasterVolume(volume: number): void {
    if (!this.ctx || !this.master) return;
    // Stored volume is the 0..1 slider position; convert to a perceptual
    // (audio-taper) gain here, at the volume->GainNode boundary (FR-2).
    this.master.gain.setTargetAtTime(
      sliderToGain(clampVolume(volume)),
      this.ctx.currentTime,
      SMOOTHING,
    );
  }

  /**
   * Apply mute gains (#97): `output` gates the whole graph, `mainGroup` gates
   * everything except ToDo cues. Smoothed to avoid clicks on toggle.
   */
  setMuteGains(output: number, mainGroup: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.output?.gain.setTargetAtTime(Math.max(0, Math.min(1, output)), t, SMOOTHING);
    this.mainGroup?.gain.setTargetAtTime(
      Math.max(0, Math.min(1, mainGroup)),
      t,
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
    this.todoCue = null;
    this.mainGroup = null;
    this.output = null;
  }
}
