"use client";

import type { ActiveBreak } from "@/lib/break-banner-stack";
import type { BreakKind } from "@/lib/breaks";

interface BreakBannerProps {
  breakPrompt: ActiveBreak;
  onDidIt: (kind: BreakKind) => void;
  onDismiss: (kind: BreakKind) => void;
  onSnooze: (kind: BreakKind) => void;
  snoozeMin: number;
}

export default function BreakBanner({
  breakPrompt,
  onDidIt,
  onDismiss,
  onSnooze,
  snoozeMin,
}: BreakBannerProps) {
  const { kind, message } = breakPrompt;

  return (
    <div
      className="break-banner"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-break-kind={kind}
    >
      <p className="break-banner-message">{message}</p>
      <div className="break-banner-actions">
        <button
          type="button"
          className="break-banner-did"
          onClick={() => onDidIt(kind)}
        >
          I did.
        </button>
        <button
          type="button"
          className="break-banner-snooze"
          onClick={() => onSnooze(kind)}
        >
          Snooze {snoozeMin} min
        </button>
        <button
          type="button"
          className="break-banner-dismiss"
          onClick={() => onDismiss(kind)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

interface BreakBannerStackProps {
  breaks: readonly ActiveBreak[];
  onDidIt: (kind: BreakKind) => void;
  onDismiss: (kind: BreakKind) => void;
  onSnooze: (kind: BreakKind) => void;
  snoozeMin: number;
}

/**
 * Renders concurrent break prompts as a vertical stack (#61).
 * Each banner's I did. / Snooze / Dismiss applies only to that kind.
 */
export function BreakBannerStack({
  breaks,
  onDidIt,
  onDismiss,
  onSnooze,
  snoozeMin,
}: BreakBannerStackProps) {
  if (breaks.length === 0) return null;

  return (
    <div
      className="break-banner-stack"
      role="region"
      aria-label="Break reminders"
    >
      {breaks.map((breakPrompt) => (
        <BreakBanner
          key={breakPrompt.kind}
          breakPrompt={breakPrompt}
          onDidIt={onDidIt}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          snoozeMin={snoozeMin}
        />
      ))}
    </div>
  );
}
