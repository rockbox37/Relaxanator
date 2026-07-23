import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

import { initialFeedbackFormState, type FeedbackFormState } from "@/lib/feedback";
import FeedbackDialog from "./FeedbackDialog";

/**
 * FeedbackDialog is a pure, hookless controlled component (state lives in
 * useFeedbackForm / NoisePlayer), so it can be invoked directly to inspect the
 * returned element tree without a DOM — same smoke-test style as AboutDialog.
 * The submit lifecycle is covered by the reducer tests in src/lib/feedback.
 */

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

function render(overrides: Partial<FeedbackDialogArgs> = {}) {
  const props: FeedbackDialogArgs = {
    open: true,
    onClose: vi.fn(),
    state: initialFeedbackFormState,
    onFieldChange: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return {
    props,
    element: FeedbackDialog(props) as ReactElement<Record<string, unknown>>,
  };
}

interface FeedbackDialogArgs {
  open: boolean;
  onClose: () => void;
  state: FeedbackFormState;
  onFieldChange: (field: string, value: string) => void;
  onSubmit: () => void;
}

describe("FeedbackDialog", () => {
  it("renders nothing when closed", () => {
    expect(FeedbackDialog({ ...render().props, open: false })).toBeNull();
  });

  it("renders an accessible dialog with the required fields", () => {
    const { element } = render();
    expect(element.props.className).toBe("about-overlay");

    const dialog = collectByType(element, "div").find(
      (d) => d.props.role === "dialog",
    );
    expect(dialog).toBeDefined();
    expect(dialog!.props["aria-modal"]).toBe("true");
    expect(dialog!.props["aria-labelledby"]).toBe("feedback-dialog-title");

    // Type radios for each category.
    const radios = collectByType(element, "input").filter(
      (i) => i.props.type === "radio",
    );
    expect(radios.length).toBe(3);

    // Required message textarea.
    const textarea = collectByType(element, "textarea")[0];
    expect(textarea).toBeDefined();
    expect(textarea!.props.required).toBe(true);
    expect(textarea!.props["aria-required"]).toBe("true");

    // Optional email input.
    const email = collectByType(element, "input").find(
      (i) => i.props.type === "email",
    );
    expect(email).toBeDefined();
  });

  it("includes a hidden honeypot field", () => {
    const { element } = render();
    const honeypot = collectByType(element, "input").find(
      (i) => i.props.name === "company",
    );
    expect(honeypot).toBeDefined();
    expect(honeypot!.props.tabIndex).toBe(-1);
    expect(honeypot!.props.autoComplete).toBe("off");
  });

  it("reports edits through onFieldChange", () => {
    const onFieldChange = vi.fn();
    const { element } = render({ onFieldChange });
    const textarea = collectByType(element, "textarea")[0];
    (textarea!.props.onChange as (e: unknown) => void)({
      target: { value: "hi there" },
    });
    expect(onFieldChange).toHaveBeenCalledWith("message", "hi there");
  });

  it("submits via the form and preventDefault", () => {
    const onSubmit = vi.fn();
    const { element } = render({ onSubmit });
    const form = collectByType(element, "form")[0];
    const preventDefault = vi.fn();
    (form!.props.onSubmit as (e: unknown) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("closes via the close button and the backdrop", () => {
    const onClose = vi.fn();
    const { element } = render({ onClose });
    const closeBtn = collectByType(element, "button").find(
      (b) => b.props.className === "about-close",
    );
    (closeBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = {};
    (element.props.onClick as (e: unknown) => void)({
      target: backdrop,
      currentTarget: backdrop,
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the top-level error and preserves the typed message", () => {
    const { element } = render({
      state: {
        ...initialFeedbackFormState,
        status: "error",
        errorMessage: "Network error",
        message: "keep this",
      },
    });
    const alert = collectByType(element, "p").find(
      (p) => p.props.role === "alert",
    );
    expect(collectText(alert).join("")).toContain("Network error");
    const textarea = collectByType(element, "textarea")[0];
    expect(textarea!.props.value).toBe("keep this");
  });

  it("shows an inline field error for the message", () => {
    const { element } = render({
      state: {
        ...initialFeedbackFormState,
        fieldErrors: { message: "Please enter a message." },
      },
    });
    const error = collectByType(element, "p").find(
      (p) => p.props.id === "feedback-message-error",
    );
    expect(error).toBeDefined();
    expect(collectText(error).join("")).toContain("Please enter a message.");
  });

  it("shows a success view with a Close action after sending", () => {
    const onClose = vi.fn();
    const { element } = render({
      onClose,
      state: { ...initialFeedbackFormState, status: "success" },
    });
    const status = collectByType(element, "div").find(
      (d) => d.props.role === "status",
    );
    expect(collectText(status).join("")).toContain("Thanks");
    // No form is rendered on success.
    expect(collectByType(element, "form")).toHaveLength(0);
    const closeBtn = collectByType(element, "button").find(
      (b) => collectText(b).join("") === "Close",
    );
    (closeBtn!.props.onClick as () => void)();
    expect(onClose).toHaveBeenCalled();
  });

  it("disables inputs while submitting", () => {
    const { element } = render({
      state: { ...initialFeedbackFormState, status: "submitting" },
    });
    const textarea = collectByType(element, "textarea")[0];
    expect(textarea!.props.disabled).toBe(true);
    const submit = collectByType(element, "button").find(
      (b) => b.props.type === "submit",
    );
    expect(submit!.props.disabled).toBe(true);
    expect(collectText(submit).join("")).toContain("Sending");
  });
});
