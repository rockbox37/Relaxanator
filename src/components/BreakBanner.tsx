"use client";

import type { BreakKind } from "@/lib/breaks";

export interface ActiveBreak {
  kind: BreakKind;
  message: string;
}

interface BreakBannerProps {
  breakPrompt: ActiveBreak | null;
  onDismiss: () => void;
  onSnooze: () => void;
  snoozeMin: number;
}

export default function BreakBanner({
  breakPrompt,
  onDismiss,
  onSnooze,
  snoozeMin,
}: BreakBannerProps) {
  if (!breakPrompt) return null;

  return (
    <div
      className="break-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="break-banner-message">{breakPrompt.message}</p>
      <div className="break-banner-actions">
        <button type="button" className="break-banner-snooze" onClick={onSnooze}>
          Snooze {snoozeMin} min
        </button>
        <button type="button" className="break-banner-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
