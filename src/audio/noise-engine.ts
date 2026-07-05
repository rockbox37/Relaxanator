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

  get running(): boolean {
    return this.ctx?.state === "running";
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
    master.gain.value = clampVolume(state.masterVolume);

    let tail: AudioNode = source;
    for (const band of bands) {
      tail.connect(band);
      tail = band;
    }
    tail.connect(master);
    master.connect(ctx.destination);

    this.ctx = ctx;
    this.source = source;
    this.bands = bands;
    this.master = master;
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
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
  }
}
