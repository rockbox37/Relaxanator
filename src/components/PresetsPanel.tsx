"use client";

import {
  PRESET_NAME_MAX_LEN,
  type SessionPreset,
} from "@/lib/session-presets";

interface PresetsPanelProps {
  presets: SessionPreset[];
  /** Currently highlighted preset id ("" when none is chosen). */
  selectedId: string;
  /** Text in the name field — the name used by "Save as new" and "Rename". */
  nameInput: string;
  onNameInputChange: (name: string) => void;
  onSelect: (id: string) => void;
  /** Capture the current session as a brand-new named preset. */
  onSaveNew: () => void;
  /** Overwrite the selected preset with the current session. */
  onUpdate: () => void;
  /** Apply the selected preset to state + live engines. */
  onApply: () => void;
  /** Rename the selected preset to the current name field. */
  onRename: () => void;
  /** Delete the selected preset (the parent confirms first). */
  onDelete: () => void;
}

/**
 * Whole-session presets UI (#6). Presentational + hookless — all state lives in
 * NoisePlayer so this mirrors the direct-invocation test style of ChordsPanel /
 * MeditationPanel. Lets the user save the current session as a named preset and
 * later load / update / rename / delete it.
 */
export default function PresetsPanel({
  presets,
  selectedId,
  nameInput,
  onNameInputChange,
  onSelect,
  onSaveNew,
  onUpdate,
  onApply,
  onRename,
  onDelete,
}: PresetsPanelProps) {
  const hasSelection = presets.some((p) => p.id === selectedId);
  const canSave = nameInput.trim().length > 0;

  return (
    <section className="meditation presets" aria-label="Presets">
      <h2>Session presets</h2>
      <p className="presets-note">
        Save the whole session — noise, meditation, chords, announcements, break
        prompts, ToDo cue, and mute — as a named preset you can recall later.
      </p>

      <div className="presets-row presets-save">
        <input
          type="text"
          className="presets-name"
          value={nameInput}
          placeholder="Preset name"
          maxLength={PRESET_NAME_MAX_LEN}
          onChange={(e) => onNameInputChange(e.target.value)}
          aria-label="Preset name"
        />
        <button
          type="button"
          className="presets-btn presets-save-btn"
          onClick={onSaveNew}
          disabled={!canSave}
          title="Save the current session as a new preset"
        >
          Save as new
        </button>
      </div>

      <div className="presets-row presets-manage">
        <label className="presets-select">
          Saved
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value)}
            aria-label="Saved presets"
          >
            <option value="">
              {presets.length > 0 ? "— choose a preset —" : "No saved presets"}
            </option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>

        <div className="presets-actions">
          <button
            type="button"
            className="presets-btn presets-load-btn"
            onClick={onApply}
            disabled={!hasSelection}
            title="Apply this preset now"
          >
            Load
          </button>
          <button
            type="button"
            className="presets-btn presets-update-btn"
            onClick={onUpdate}
            disabled={!hasSelection}
            title="Overwrite this preset with the current session"
          >
            Update
          </button>
          <button
            type="button"
            className="presets-btn presets-rename-btn"
            onClick={onRename}
            disabled={!hasSelection || !canSave}
            title="Rename this preset to the name above"
          >
            Rename
          </button>
          <button
            type="button"
            className="presets-btn presets-delete-btn"
            onClick={onDelete}
            disabled={!hasSelection}
            title="Delete this preset"
          >
            Delete
          </button>
        </div>
      </div>
    </section>
  );
}
