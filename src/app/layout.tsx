import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import SerwistProvider from "@/components/SerwistProvider";
import StarfieldBackground from "@/components/StarfieldBackground";

import "./globals.css";

const APP_NAME = "Relaxanator";
const APP_DESCRIPTION =
  "Colored background noise with an EQ, meditation sounds, and break prompts.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SerwistProvider swUrl="/serwist/sw.js">
          <StarfieldBackground />
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
