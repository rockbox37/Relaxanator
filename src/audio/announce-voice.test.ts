import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { HAL_OUTPUT_GAIN } from "./announce-voice";
import { ANNOUNCE_WORDS } from "../lib/announce";

describe("announce voice routing", () => {
  it("does not attenuate HAL beyond plain voice level", () => {
    expect(HAL_OUTPUT_GAIN).toBe(1);
  });
});

describe("HAL word sprites", () => {
  /** macOS `say` in a sandbox emits 4096-byte FLLR silence — real sprites are much larger. */
  const MIN_HAL_SPRITE_BYTES = 8000;

  it("ships non-silent Ralph TTS sprites for every word", () => {
    for (const word of ANNOUNCE_WORDS) {
      const path = join(process.cwd(), "public/audio/tts/hal", `${word}.wav`);
      const bytes = readFileSync(path);
      expect(bytes.byteLength, `${word}.wav`).toBeGreaterThan(MIN_HAL_SPRITE_BYTES);
    }
  });
});
