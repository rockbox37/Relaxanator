import {
  EQ_BAND_COUNT,
  createFlatEqCurve,
  formatFrequency,
  withBandGain,
} from "@/lib/eq";

// Static "warm" preview curve until the interactive noise engine lands:
// gentle low-end emphasis rolling off toward the top, brown-noise-flavored.
const WARM_GAINS = [4, 3, 2, 1, 0, -1, -2, -3, -4, -5];

const previewCurve = WARM_GAINS.reduce(
  (curve, gainDb, band) => withBandGain(curve, band, gainDb),
  createFlatEqCurve(),
);

export default function Home() {
  return (
    <main>
      <h1>Relaxanator</h1>
      <p>Colored noise, meditation sounds, and break prompts — coming soon.</p>
      <h2>{EQ_BAND_COUNT}-band equalizer</h2>
      <ul>
        {previewCurve.map((band) => (
          <li key={band.frequency}>
            {formatFrequency(band.frequency)}: {band.gainDb} dB
          </li>
        ))}
      </ul>
    </main>
  );
}
