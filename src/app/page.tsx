import NoisePlayer from "@/components/NoisePlayer";

export default function Home() {
  return (
    <main>
      <h1>Relaxanator</h1>
      <p>
        Colored background noise with a 10-band equalizer. Meditation sounds
        and break prompts are on the way.
      </p>
      <NoisePlayer />
    </main>
  );
}
