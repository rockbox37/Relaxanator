"use client";

import type { MouseEvent } from "react";

interface AboutDialogProps {
  /** Whether the About modal is currently open. */
  open: boolean;
  /** Close the modal — wired to the close button and the backdrop. */
  onClose: () => void;
}

/** Stable id linking the dialog to its title for `aria-labelledby` (FR-5). */
const TITLE_ID = "about-dialog-title";

/** Jirius Group LLC website — opened in a new tab from the copyright line (FR-3). */
const JIRIUS_URL = "https://jiriusgroup.com/";

/**
 * The app's real feature set, one card per feature (FR-1 / FR-2). Names and
 * one-line descriptions are verified against the codebase (src/lib + *Panel.tsx)
 * so nothing here is invented.
 */
const FEATURES: readonly { name: string; description: string }[] = [
  {
    name: "Colored noise",
    description: "EQ-shaped brown, pink, and white noise.",
  },
  {
    name: "Meditation sounds",
    description: "Scheduled bells, chimes, and drones — clock-syncable.",
  },
  {
    name: "Chords",
    description:
      "Single chords and progressions; pick a timbre, block/arpeggio/strum, loop.",
  },
  {
    name: "Break reminders",
    description: "Periodic prompts to stretch, walk, hydrate, or pause.",
  },
  {
    name: "To-do list",
    description: "A simple task list with optional local reminders.",
  },
  {
    name: "Time announcements",
    description: "A spoken robot voice reads the time so you don't lose track.",
  },
  {
    name: "Sleep timer",
    description: "Gently fade out and stop after a set duration.",
  },
  {
    name: "Session presets",
    description: "Save and restore a favorite setup in one action.",
  },
];

/**
 * About modal overlay describing the app with a copyright line (#134).
 *
 * Kept hookless/pure so it can be unit-tested by direct invocation like the
 * other panels (ChordsPanel / PresetsPanel) in this node test environment.
 * The owning NoisePlayer holds the open state and handles Escape-to-close and
 * returning focus to the trigger, so this component only renders and reports
 * dismissal via `onClose` (close button + backdrop click).
 */
export default function AboutDialog({ open, onClose }: AboutDialogProps) {
  if (!open) return null;

  // Dismiss only when the backdrop itself is clicked — not content within it.
  function onBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    // Backdrop: click-to-dismiss. Keyboard users dismiss via Escape (handled
    // in NoisePlayer) or the visible close button, so a static-element click
    // handler here is intentional and accessible.
    <div className="about-overlay" onClick={onBackdropClick}>
      <div
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <button
          type="button"
          className="about-close"
          onClick={onClose}
          aria-label="Close About dialog"
        >
          ×
        </button>
        <h2 id={TITLE_ID} className="about-title">
          About Relaxanator
        </h2>
        <p className="about-blurb">
          Relaxanator is an offline-capable app that generates EQ-shaped colored
          noise — brown, pink, or white — alongside scheduled meditation sounds,
          chord ambiences, and break prompts, to help you focus, relax, and
          rest.
        </p>
        <ul className="about-features" aria-label="Features">
          {FEATURES.map((feature) => (
            <li key={feature.name} className="about-feature">
              <span className="about-feature-name">{feature.name}</span>
              <span className="about-feature-desc">{feature.description}</span>
            </li>
          ))}
        </ul>
        <p className="about-copyright">
          ©{" "}
          <a
            className="about-link"
            href={JIRIUS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Jirius Group LLC
          </a>
        </p>
      </div>
    </div>
  );
}
