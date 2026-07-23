import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { CHORD_VOICES, createDefaultChordSettings } from "@/lib/chords";

import ChordsPanel from "./ChordsPanel";

/**
 * ChordsPanel is a pure, hookless functional component, so it can be invoked
 * directly to inspect the returned React element tree without a DOM. This is a
 * smoke test: it confirms the section renders one row per chord voice. Deeper
 * interaction behavior lives with the pure model in src/lib/chords.test.ts.
 */
describe("ChordsPanel", () => {
  it("renders a Chords section with one row per registered voice", () => {
    const element = ChordsPanel({
      settings: createDefaultChordSettings(),
      onChange: vi.fn(),
      onPreview: vi.fn(),
    }) as ReactElement<{
      "aria-label": string;
      children: ReactElement[];
    }>;

    expect(element.type).toBe("section");
    expect(element.props["aria-label"]).toBe("Chords");

    // Children are [<h2>, <ul>]; the <ul> maps every voice to an <li>.
    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{ children: unknown[] }>;
    expect(list).toBeDefined();
    expect(list.props.children).toHaveLength(CHORD_VOICES.length);
  });

  it("renders a Guitars optgroup with the guitar timbres in the picker", () => {
    const element = ChordsPanel({
      settings: createDefaultChordSettings(),
      onChange: vi.fn(),
      onPreview: vi.fn(),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{
      children: ReactElement<{ children: ReactElement[] }>[];
    }>;
    const firstRow = list.props.children[0];

    // Walk the row's <label>s to the instrument <select>.
    const labels = firstRow.props.children as ReactElement<{
      className?: string;
      children: ReactElement<{ children: ReactElement[] }>;
    }>[];
    const timbreLabel = labels.find(
      (label) => label?.props?.className === "voice-timbre",
    );
    expect(timbreLabel).toBeDefined();

    const select = timbreLabel!.props.children;
    const optgroups = select.props.children as ReactElement<{
      label: string;
      children: ReactElement<{ value: string }>[];
    }>[];
    const guitars = optgroups.find((group) => group.props.label === "Guitars");
    expect(guitars).toBeDefined();

    const values = guitars!.props.children.map((option) => option.props.value);
    expect(values).toEqual(
      expect.arrayContaining([
        "nylon-guitar",
        "steel-guitar",
        "clean-electric",
        "jazz-guitar",
        "metal-guitar",
        "twelve-string",
      ]),
    );
  });

  it("offers Block / Arpeggiated / Strum in every voice's mode picker", () => {
    const element = ChordsPanel({
      settings: createDefaultChordSettings(),
      onChange: vi.fn(),
      onPreview: vi.fn(),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{
      children: ReactElement<{ children: ReactElement[] }>[];
    }>;
    const firstRow = list.props.children[0];

    const labels = firstRow.props.children as ReactElement<{
      className?: string;
      children: ReactElement<{ children: ReactElement<{ value: string }>[] }>;
    }>[];
    const modeLabel = labels.find(
      (label) => label?.props?.className === "voice-mode",
    );
    expect(modeLabel).toBeDefined();

    const select = modeLabel!.props.children;
    const values = select.props.children.map((option) => option.props.value);
    expect(values).toEqual(["block", "arpeggiated", "strum"]);
  });

  it("renders a per-voice Loop toggle that reflects state and fires onChange", () => {
    const onChange = vi.fn();
    const settings = createDefaultChordSettings();
    settings[CHORD_VOICES[0].id].loop = true; // first row is looping
    const element = ChordsPanel({
      settings,
      onChange,
      onPreview: vi.fn(),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{
      children: ReactElement<{ children: ReactElement[] }>[];
    }>;

    // Every voice row carries a loop toggle...
    const rows = list.props.children;
    for (const row of rows) {
      const labels = row.props.children as ReactElement<{ className?: string }>[];
      expect(
        labels.some((label) => label?.props?.className === "voice-loop"),
      ).toBe(true);
    }

    // ...the first row's toggle is checked (loop on) and wired to onChange.
    const firstRowLabels = rows[0].props.children as ReactElement<{
      className?: string;
      children: [
        ReactElement<{
          type: string;
          checked: boolean;
          onChange: (e: { target: { checked: boolean } }) => void;
        }>,
        string,
      ];
    }>[];
    const loopLabel = firstRowLabels.find(
      (label) => label?.props?.className === "voice-loop",
    );
    expect(loopLabel).toBeDefined();
    // The label's children are [<input>, "loop"]; the toggle is the input.
    const input = loopLabel!.props.children[0];
    expect(input.props.type).toBe("checkbox");
    expect(input.props.checked).toBe(true);

    input.props.onChange({ target: { checked: false } });
    expect(onChange).toHaveBeenCalledWith(CHORD_VOICES[0].id, { loop: false });
  });

  it("disables the minutes-interval input while looping and keeps it enabled otherwise", () => {
    const settings = createDefaultChordSettings();
    settings[CHORD_VOICES[0].id].loop = true; // first row loops
    settings[CHORD_VOICES[1].id].loop = false; // second row does not
    const priorInterval = settings[CHORD_VOICES[0].id].intervalMin;

    const element = ChordsPanel({
      settings,
      onChange: vi.fn(),
      onPreview: vi.fn(),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{
      children: ReactElement<{ children: ReactElement[] }>[];
    }>;
    const rows = list.props.children;

    const intervalInput = (
      row: ReactElement<{ children: ReactElement[] }>,
    ) => {
      const labels = row.props.children as ReactElement<{
        className?: string;
        children: ReactElement<{ disabled?: boolean; value: number }>[];
      }>[];
      const intervalLabel = labels.find(
        (label) => label?.props?.className === "voice-interval",
      );
      expect(intervalLabel).toBeDefined();
      // Label children are ["every", <input>, "min"]; the input is index 1.
      return intervalLabel!.props.children[1];
    };

    const loopingInput = intervalInput(rows[0]);
    const idleInput = intervalInput(rows[1]);

    expect(loopingInput.props.disabled).toBe(true);
    expect(idleInput.props.disabled).toBe(false);

    // Disabling must not clear the stored interval value (FR-4).
    expect(loopingInput.props.value).toBe(priorInterval);
  });

  it("adds the .voice--looping border only when a voice has loop && enabled", () => {
    const settings = createDefaultChordSettings();
    settings[CHORD_VOICES[0].id].loop = true;
    settings[CHORD_VOICES[0].id].enabled = true; // looping AND active -> border
    settings[CHORD_VOICES[1].id].loop = true;
    settings[CHORD_VOICES[1].id].enabled = false; // looping but off -> no border
    settings[CHORD_VOICES[2].id].loop = false;
    settings[CHORD_VOICES[2].id].enabled = true; // active but not looping -> none

    const element = ChordsPanel({
      settings,
      onChange: vi.fn(),
      onPreview: vi.fn(),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{ children: ReactElement<{ className: string }>[] }>;
    const rows = list.props.children;

    const hasLoopBorder = (row: ReactElement<{ className: string }>) =>
      row.props.className.split(" ").includes("voice--looping");

    expect(hasLoopBorder(rows[0])).toBe(true);
    expect(hasLoopBorder(rows[1])).toBe(false);
    expect(hasLoopBorder(rows[2])).toBe(false);
    // Exactly the one loop && enabled row gets the border.
    expect(rows.filter(hasLoopBorder)).toHaveLength(1);
  });

  it("lets the loop border coexist with the .voice--playing glow", () => {
    const litLoopingId = CHORD_VOICES[0].id;
    const settings = createDefaultChordSettings();
    settings[litLoopingId].loop = true;
    settings[litLoopingId].enabled = true;

    const element = ChordsPanel({
      settings,
      onChange: vi.fn(),
      onPreview: vi.fn(),
      playingVoiceIds: new Set([litLoopingId]),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{ children: ReactElement<{ className: string }>[] }>;
    const classes = list.props.children[0].props.className.split(" ");

    // Both classes are present on the same row without clobbering each other.
    expect(classes).toContain("voice--playing");
    expect(classes).toContain("voice--looping");
  });

  it("adds the .voice--playing glow class only to lit rows (#104)", () => {
    const litId = CHORD_VOICES[0].id;
    const element = ChordsPanel({
      settings: createDefaultChordSettings(),
      onChange: vi.fn(),
      onPreview: vi.fn(),
      playingVoiceIds: new Set([litId]),
    }) as ReactElement<{ children: ReactElement[] }>;

    const list = element.props.children.find(
      (child) => child?.type === "ul",
    ) as ReactElement<{ children: ReactElement<{ className: string }>[] }>;
    const rows = list.props.children;

    expect(rows[0].props.className).toBe("voice voice--playing");
    // Exactly the one lit row gets the glow class; the rest stay plain.
    const litRows = rows.filter(
      (row) => row.props.className === "voice voice--playing",
    );
    expect(litRows).toHaveLength(1);
  });
});
