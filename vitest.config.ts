import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Coverage measures pure-logic modules only. UI shells (src/app/),
      // Web Audio wiring (src/audio/), and the AudioWorklet shim
      // (noise-processor.js, runs only in an AudioWorkletGlobalScope) stay
      // thin and are excluded from the gate; all schedulable/serializable
      // logic lives in src/lib/ and public/worklets/noise-dsp.js at 85%+.
      include: ["src/lib/**/*.ts", "public/worklets/noise-dsp.js"],
      exclude: ["src/lib/**/*.test.ts"],
      thresholds: {
        perFile: true,
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
