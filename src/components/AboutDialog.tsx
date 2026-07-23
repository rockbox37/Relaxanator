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
        <p className="about-copyright">© Jirius Group LLC</p>
      </div>
    </div>
  );
}
