"use client";

import { SerwistProvider as SerwistReactProvider } from "@serwist/turbopack/react";
import type { ComponentProps, ReactNode } from "react";

type Props = ComponentProps<typeof SerwistReactProvider> & {
  children: ReactNode;
};

/** Client bridge so the root layout can register the service worker. */
export default function SerwistProvider(props: Props) {
  return <SerwistReactProvider {...props} />;
}
