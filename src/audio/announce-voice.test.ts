import { describe, expect, it } from "vitest";

import { VOCODER_CARRIER_WAVE } from "./announce-voice";

describe("announce vocoder carrier", () => {
  it("uses a sawtooth carrier, not square", () => {
    expect(VOCODER_CARRIER_WAVE).toBe("sawtooth");
    expect(VOCODER_CARRIER_WAVE).not.toBe("square");
  });
});
