/**
 * AudioWorklet shim around noise-dsp.js. Runs only inside an
 * AudioWorkletGlobalScope (loaded via audioWorklet.addModule); all testable
 * math lives in noise-dsp.js, so this file is excluded from coverage.
 */
/* global AudioWorkletProcessor, registerProcessor */
import { NOISE_COLOR_ORDER, createGenerator } from "./noise-dsp.js";

const CROSSFADE_SAMPLES = 2048;

class NoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "color",
        defaultValue: 0,
        minValue: 0,
        maxValue: NOISE_COLOR_ORDER.length - 1,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.colorIndex = 0;
    this.generator = createGenerator(0);
    this.fadingOut = null;
    this.fadeRemaining = 0;
  }

  process(_inputs, outputs, parameters) {
    const requested = Math.round(parameters.color[0]);
    if (requested !== this.colorIndex) {
      // Crossfade old -> new generator to keep the color switch click-free.
      this.fadingOut = this.generator;
      this.fadeRemaining = CROSSFADE_SAMPLES;
      this.generator = createGenerator(requested);
      this.colorIndex = requested;
    }

    const channel = outputs[0][0];
    for (let i = 0; i < channel.length; i += 1) {
      let sample = this.generator();
      if (this.fadeRemaining > 0 && this.fadingOut) {
        const mix = this.fadeRemaining / CROSSFADE_SAMPLES;
        sample = sample * (1 - mix) + this.fadingOut() * mix;
        this.fadeRemaining -= 1;
      }
      channel[i] = sample;
    }
    // Copy channel 0 to any additional channels.
    for (let c = 1; c < outputs[0].length; c += 1) {
      outputs[0][c].set(channel);
    }
    return true;
  }
}

registerProcessor("noise-processor", NoiseProcessor);
