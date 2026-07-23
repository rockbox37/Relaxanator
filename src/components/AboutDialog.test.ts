import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import AboutDialog from "./AboutDialog";

/**
 * AboutDialog is a pure, hookless functional component (open state and Escape /
 * focus handling live in NoisePlayer), so it can be invoked directly to inspect
 * the returned element tree without a DOM — same smoke-test style as
 * ChordsPanel / PresetsPanel.
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

/** Flatten all string text within a node tree into one string. */
function collectText(node: unknown, parts: string[] = []): string[] {
  if (node == null || typeof node === "boolean") return parts;
  if (typeof node === "string" || typeof node === "number") {
    parts.push(String(node));
    return parts;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, parts);
    return parts;
  }
  if (typeof node !== "object") return parts;
  const el = node as ReactElement<{ children?: unknown }>;
  if (el.props && "children" in el.props) collectText(el.props.children, parts);
  return parts;
}

describe("AboutDialog", () => {
  it("renders nothing when closed", () => {
    const result = AboutDialog({ open: false, onClose: vi.fn() });
    expect(result).toBeNull();
  });

  it("renders an accessible dialog with the app blurb when open", () => {
    const element = AboutDialog({
      open: true,
      onClose: vi.fn(),
    }) as ReactElement<Record<string, unknown>>;

    // Overlay wrapper is the backdrop.
    expect(element.type).toBe("div");
    expect(element.props.className).toBe("about-overlay");

    // The inner dialog carries the required role / aria attributes (FR-5).
    const dialog = collectByType(element, "div").find(
      (d) => d.props.role === "dialog",
    );
    expect(dialog).toBeDefined();
    expect(dialog!.props["aria-modal"]).toBe("true");
    expect(dialog!.props["aria-labelledby"]).toBe("about-dialog-title");

    // The title element the dialog points at exists.
    const title = collectByType(element, "h2").find(
      (h) => h.props.id === "about-dialog-title",
    );
    expect(title).toBeDefined();

    // Blurb mentions what the app does.
    const text = collectText(element).join(" ");
    expect(text).toMatch(/offline/i);
    expect(text).toMatch(/noise/i);
    expect(text).toMatch(/meditation/i);
  });

  it("shows the '© Jirius Group LLC' copyright line at the bottom", () => {
    const element = AboutDialog({
      open: true,
      onClose: vi.fn(),
    }) as ReactElement<Record<string, unknown>>;

    const copyright = collectByType(element, "p").find((p) =>
      collectText(p).join("").includes("Jirius Group LLC"),
    );
    expect(copyright).toBeDefined();
    expect(collectText(copyright).join("")).toBe("© Jirius Group LLC");
  });

  it("closes via the close button", () => {
    const onClose = vi.fn();
    const element = AboutDialog({
      open: true,
      onClose,
    }) as ReactElement<Record<string, unknown>>;

    const closeBtn = collectByType(element, "button").find(
      (b) => b.props.className === "about-close",
    );
    expect(closeBtn).toBeDefined();
    expect(closeBtn!.props["aria-label"]).toBe("Close About dialog");
    (closeBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop itself is clicked, not the dialog content", () => {
    const onClose = vi.fn();
    const element = AboutDialog({
      open: true,
      onClose,
    }) as ReactElement<{ onClick: (e: unknown) => void }>;

    const onClick = element.props.onClick;
    // Click on the backdrop (target === currentTarget) dismisses.
    const backdrop = {};
    onClick({ target: backdrop, currentTarget: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Click originating inside the dialog does not dismiss.
    onClick({ target: {}, currentTarget: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
