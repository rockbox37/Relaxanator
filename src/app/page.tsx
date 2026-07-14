import Image from "next/image";

import NoisePlayer from "@/components/NoisePlayer";

export default function Home() {
  return (
    <main>
      <header className="app-header">
        <Image
          className="app-logo"
          src="/logo.png"
          alt="Relaxanator logo: a lotus flower resting in an open hand"
          width={64}
          height={64}
          priority
        />
        <h1>Relaxanator ... Your work companion!</h1>
      </header>
      <p>
        Colored background noise with a 10-band equalizer, meditation sounds,
        break prompts, a ToDo list with optional reminders, and optional time
        announcements.
      </p>
      <NoisePlayer />
    </main>
  );
}
