"use client";

import {
  ANNOUNCE_INTERVALS,
  ANNOUNCE_VOICES,
  type AnnounceSettings,
} from "@/lib/announce";

interface TimeAnnouncePanelProps {
  settings: AnnounceSettings;
  onChange: (update: Partial<AnnounceSettings>) => void;
  onPreview: () => void;
  previewDisabled?: boolean;
}

export default function TimeAnnouncePanel({
  settings,
  onChange,
  onPreview,
  previewDisabled = false,
}: TimeAnnouncePanelProps) {
  return (
    <section className="meditation announce" aria-label="Time announcements">
      <h2>Time announcements</h2>
      <div className="voice">
        <label className="voice-enable">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          Announce
        </label>

        <label className="voice-interval">
          <select
            value={settings.intervalMin}
            onChange={(e) => onChange({ intervalMin: Number(e.target.value) })}
            aria-label="Announcement interval"
          >
            {ANNOUNCE_INTERVALS.map((interval) => (
              <option key={interval.minutes} value={interval.minutes}>
                {interval.label}
              </option>
            ))}
          </select>
        </label>

        <label className="voice-interval">
          <select
            value={settings.voiceId}
            onChange={(e) => onChange({ voiceId: e.target.value })}
            aria-label="Announcement voice"
          >
            {ANNOUNCE_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))}
          </select>
        </label>

        <label className="voice-volume">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={settings.volume}
            onChange={(e) => onChange({ volume: Number(e.target.value) })}
            aria-label="Announcement volume"
          />
        </label>

        <button
          type="button"
          className="voice-preview"
          onClick={onPreview}
          disabled={previewDisabled}
          title="Hear the next announcement now"
        >
          ♪
        </button>
      </div>
      <p className="announce-note">
        Synced to the clock — first announcement lands on the next boundary,
        not when you enable it.
      </p>
    </section>
  );
}
