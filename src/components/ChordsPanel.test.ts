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
