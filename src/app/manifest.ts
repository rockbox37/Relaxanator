import type { MetadataRoute } from "next";

/**
 * Web app manifest for installability (A2HS / Dock). Icons live under
 * public/icons/; no custom beforeinstallprompt UI is wired (scope lock).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Relaxanator",
    short_name: "Relaxanator",
    description:
      "Colored background noise with an EQ, meditation sounds, and break prompts.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
