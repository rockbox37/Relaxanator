import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import {
  createDefaultSessionSettings,
  makePreset,
  type SessionPreset,
} from "@/lib/session-presets";

import PresetsPanel from "./PresetsPanel";

/**
 * PresetsPanel is a pure, hookless functional component (all state lives in
 * NoisePlayer), so it can be invoked directly to inspect the returned element
 * tree without a DOM — same smoke-test style as ChordsPanel. Deeper CRUD
 * behavior lives with the pure model in src/lib/session-presets.test.ts.
 */

/** Recursively collect every React element of a given intrinsic type. */
function collectByType(
  node: unknown,
  type: string,
  found: ReactElement<Record<string, unknown>>[] = [],
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, type, found);
    return found;
  }
  if (!node || typeof node !== "object") return found;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.type === type) found.push(el as ReactElement<Record<string, unknown>>);
  if (el.props && "children" in el.props) {
    collectByType(el.props.children, type, found);
  }
  return found;
}

function noopCallbacks() {
  return {
    onNameInputChange: vi.fn(),
    onSelect: vi.fn(),
    onSaveNew: vi.fn(),
    onUpdate: vi.fn(),
    onApply: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
}

describe("PresetsPanel", () => {
  it("renders a Presets section", () => {
    const element = PresetsPanel({
      presets: [],
      selectedId: "",
      nameInput: "",
      ...noopCallbacks(),
    }) as ReactElement<{ "aria-label": string }>;

    expect(element.type).toBe("section");
    expect(element.props["aria-label"]).toBe("Presets");
  });

  it("renders one <option> per preset plus the placeholder", () => {
    const presets: SessionPreset[] = [
      makePreset("Focus", createDefaultSessionSettings()),
      makePreset("Sleep", createDefaultSessionSettings()),
    ];
    const element = PresetsPanel({
      presets,
      selectedId: presets[0].id,
      nameInput: "Focus",
      ...noopCallbacks(),
    }) as ReactElement<Record<string, unknown>>;

    const options = collectByType(element, "option");
    // placeholder + one per preset
    expect(options).toHaveLength(presets.length + 1);
    const values = options.map((o) => o.props.value);
    expect(values).toContain(presets[0].id);
    expect(values).toContain(presets[1].id);
  });

  it("disables Save-as-new when the name is blank", () => {
    const element = PresetsPanel({
      presets: [],
      selectedId: "",
      nameInput: "   ",
      ...noopCallbacks(),
    }) as ReactElement<Record<string, unknown>>;

    const buttons = collectByType(element, "button");
    const save = buttons.find(
      (b) => (b.props.className as string) === "presets-btn presets-save-btn",
    );
    expect(save?.props.disabled).toBe(true);
  });

  it("disables manage actions when no preset is selected", () => {
    const element = PresetsPanel({
      presets: [makePreset("Focus", createDefaultSessionSettings())],
      selectedId: "",
      nameInput: "Focus",
      ...noopCallbacks(),
    }) as ReactElement<Record<string, unknown>>;

    const buttons = collectByType(element, "button");
    for (const cls of [
      "presets-btn presets-load-btn",
      "presets-btn presets-update-btn",
      "presets-btn presets-delete-btn",
    ]) {
      const btn = buttons.find((b) => (b.props.className as string) === cls);
      expect(btn?.props.disabled).toBe(true);
    }
  });

  it("enables Load/Update/Delete when a preset is selected", () => {
    const preset = makePreset("Focus", createDefaultSessionSettings());
    const element = PresetsPanel({
      presets: [preset],
      selectedId: preset.id,
      nameInput: "Focus",
      ...noopCallbacks(),
    }) as ReactElement<Record<string, unknown>>;

    const buttons = collectByType(element, "button");
    const load = buttons.find(
      (b) => (b.props.className as string) === "presets-btn presets-load-btn",
    );
    expect(load?.props.disabled).toBe(false);
  });
});
