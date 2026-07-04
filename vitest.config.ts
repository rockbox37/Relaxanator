import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Coverage measures pure-logic modules only. UI shells (src/app/) and
      // Web Audio node wiring stay thin and are excluded from the gate; all
      // schedulable/serializable logic lives in src/lib/ and must hit 85%.
      include: ["src/lib/**/*.ts"],
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
