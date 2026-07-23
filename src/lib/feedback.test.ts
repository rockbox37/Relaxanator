import { describe, expect, it, vi } from "vitest";

import {
  EMAIL_MAX_LENGTH,
  FEEDBACK_ENDPOINT,
  FEEDBACK_TYPES,
  MESSAGE_MAX_LENGTH,
  createRateLimiter,
  feedbackFormReducer,
  initialFeedbackFormState,
  isFeedbackType,
  isHoneypotTripped,
  isValidEmail,
  normalizeFeedbackInput,
  postFeedback,
  renderFeedbackEmail,
  validateFeedbackInput,
  type FeedbackFormState,
  type FeedbackSubmitBody,
} from "./feedback";

describe("isFeedbackType", () => {
  it("accepts each known type and rejects everything else", () => {
    for (const type of FEEDBACK_TYPES) expect(isFeedbackType(type)).toBe(true);
    expect(isFeedbackType("spam")).toBe(false);
    expect(isFeedbackType(42)).toBe(false);
    expect(isFeedbackType(null)).toBe(false);
    expect(isFeedbackType(undefined)).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts a plausible address", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("  a.b@sub.domain.io  ")).toBe(true);
  });

  it("rejects malformed, empty, and over-long addresses", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("noatsign")).toBe(false);
    expect(isValidEmail("no@domain")).toBe(false);
    expect(isValidEmail("two@@example.com")).toBe(false);
    expect(isValidEmail("spaces in@example.com")).toBe(false);
    const tooLong = `${"a".repeat(EMAIL_MAX_LENGTH)}@example.com`;
    expect(isValidEmail(tooLong)).toBe(false);
  });
});

describe("isHoneypotTripped", () => {
  it("trips only when the hidden company field has content", () => {
    expect(isHoneypotTripped({ company: "" })).toBe(false);
    expect(isHoneypotTripped({ company: "   " })).toBe(false);
    expect(isHoneypotTripped({})).toBe(false);
    expect(isHoneypotTripped({ company: 123 })).toBe(false);
    expect(isHoneypotTripped({ company: "Acme Inc" })).toBe(true);
  });
});

describe("validateFeedbackInput", () => {
  it("passes a well-formed submission with no email", () => {
    const result = validateFeedbackInput({ type: "bug", message: "It broke" });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual({});
  });

  it("passes with a valid optional email", () => {
    const result = validateFeedbackInput({
      type: "feature",
      message: "Add dark mode",
      email: "me@example.com",
    });
    expect(result.ok).toBe(true);
  });

  it("flags a bad type", () => {
    const result = validateFeedbackInput({ type: "nope", message: "hi" });
    expect(result.ok).toBe(false);
    expect(result.errors.type).toBeDefined();
  });

  it("flags an empty / whitespace-only message", () => {
    expect(
      validateFeedbackInput({ type: "bug", message: "   " }).errors.message,
    ).toBeDefined();
    expect(validateFeedbackInput({ type: "bug" }).errors.message).toBeDefined();
    expect(
      validateFeedbackInput({ type: "bug", message: 5 }).errors.message,
    ).toBeDefined();
  });

  it("flags an oversized message", () => {
    const huge = "x".repeat(MESSAGE_MAX_LENGTH + 1);
    const result = validateFeedbackInput({ type: "bug", message: huge });
    expect(result.ok).toBe(false);
    expect(result.errors.message).toContain(String(MESSAGE_MAX_LENGTH));
  });

  it("flags an invalid non-empty email but ignores a blank one", () => {
    expect(
      validateFeedbackInput({ type: "bug", message: "hi", email: "bad" }).errors
        .email,
    ).toBeDefined();
    expect(
      validateFeedbackInput({ type: "bug", message: "hi", email: "   " }).errors
        .email,
    ).toBeUndefined();
  });
});

describe("normalizeFeedbackInput", () => {
  it("trims fields and nulls a blank email", () => {
    const payload = normalizeFeedbackInput({
      type: "other",
      message: "  hello  ",
      email: "   ",
    });
    expect(payload).toEqual({ type: "other", message: "hello", email: null });
  });

  it("keeps a valid email", () => {
    const payload = normalizeFeedbackInput({
      type: "bug",
      message: "x",
      email: " me@example.com ",
    });
    expect(payload.email).toBe("me@example.com");
  });

  it("throws on invalid input", () => {
    expect(() => normalizeFeedbackInput({ type: "bug", message: "" })).toThrow();
  });
});

describe("renderFeedbackEmail", () => {
  it("renders subject, body, and reply-to for a full submission", () => {
    const email = renderFeedbackEmail(
      { type: "bug", message: "Crash on start", email: "u@e.com" },
      { appVersion: "abc123", receivedAt: "2026-07-23T00:00:00Z" },
    );
    expect(email.subject).toBe("[Relaxanator feedback] Bug");
    expect(email.replyTo).toBe("u@e.com");
    expect(email.text).toContain("Type: Bug");
    expect(email.text).toContain("From: u@e.com");
    expect(email.text).toContain("Received: 2026-07-23T00:00:00Z");
    expect(email.text).toContain("App version: abc123");
    expect(email.text).toContain("Crash on start");
  });

  it("handles a missing email and missing meta", () => {
    const email = renderFeedbackEmail({
      type: "feature",
      message: "please",
      email: null,
    });
    expect(email.subject).toBe("[Relaxanator feedback] Feature request");
    expect(email.replyTo).toBeNull();
    expect(email.text).toContain("(no email provided)");
    expect(email.text).not.toContain("Received:");
    expect(email.text).not.toContain("App version:");
  });
});

describe("createRateLimiter", () => {
  it("allows up to `max` per window then blocks", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 100).allowed).toBe(true);
    const blocked = limiter.check("ip", 200);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(800);
  });

  it("resets after the window elapses", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.check("ip", 0).allowed).toBe(true);
    expect(limiter.check("ip", 500).allowed).toBe(false);
    expect(limiter.check("ip", 1000).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 0).allowed).toBe(false);
  });

  it("uses Date.now() when no clock is supplied", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
    expect(limiter.check("live").allowed).toBe(true);
    expect(limiter.check("live").allowed).toBe(false);
  });
});

describe("feedbackFormReducer", () => {
  it("updates a field and clears prior errors", () => {
    const dirty: FeedbackFormState = {
      ...initialFeedbackFormState,
      status: "error",
      errorMessage: "boom",
      fieldErrors: { message: "required", email: "bad" },
    };
    const next = feedbackFormReducer(dirty, {
      kind: "setField",
      field: "message",
      value: "hello",
    });
    expect(next.message).toBe("hello");
    expect(next.status).toBe("idle");
    expect(next.errorMessage).toBeNull();
    expect(next.fieldErrors.message).toBeUndefined();
    expect(next.fieldErrors.email).toBe("bad");
  });

  it("coerces a valid type value and updates the honeypot without field errors", () => {
    const typed = feedbackFormReducer(initialFeedbackFormState, {
      kind: "setField",
      field: "type",
      value: "feature",
    });
    expect(typed.type).toBe("feature");
    const hp = feedbackFormReducer(initialFeedbackFormState, {
      kind: "setField",
      field: "company",
      value: "bot",
    });
    expect(hp.company).toBe("bot");
  });

  it("keeps status while submitting even on field edits", () => {
    const submitting: FeedbackFormState = {
      ...initialFeedbackFormState,
      status: "submitting",
    };
    const next = feedbackFormReducer(submitting, {
      kind: "setField",
      field: "email",
      value: "a@b.co",
    });
    expect(next.status).toBe("submitting");
  });

  it("moves through submitStart → submitSuccess", () => {
    const started = feedbackFormReducer(
      { ...initialFeedbackFormState, message: "hi" },
      { kind: "submitStart" },
    );
    expect(started.status).toBe("submitting");
    const done = feedbackFormReducer(started, { kind: "submitSuccess" });
    expect(done.status).toBe("success");
    expect(done.message).toBe("");
  });

  it("preserves input on submitError (FR-5)", () => {
    const state: FeedbackFormState = {
      ...initialFeedbackFormState,
      message: "keep me",
      email: "me@e.com",
    };
    const errored = feedbackFormReducer(state, {
      kind: "submitError",
      message: "Network down",
    });
    expect(errored.status).toBe("error");
    expect(errored.message).toBe("keep me");
    expect(errored.email).toBe("me@e.com");
    expect(errored.errorMessage).toBe("Network down");
  });

  it("records validation failures without clearing input", () => {
    const state: FeedbackFormState = { ...initialFeedbackFormState, message: "" };
    const failed = feedbackFormReducer(state, {
      kind: "validationFailed",
      errors: { message: "required" },
    });
    expect(failed.status).toBe("idle");
    expect(failed.fieldErrors.message).toBe("required");
  });

  it("resets to the initial state", () => {
    const state: FeedbackFormState = {
      ...initialFeedbackFormState,
      message: "typed",
      status: "error",
    };
    expect(feedbackFormReducer(state, { kind: "reset" })).toEqual(
      initialFeedbackFormState,
    );
  });

  it("returns state unchanged for an unknown action", () => {
    const next = feedbackFormReducer(initialFeedbackFormState, {
      // @ts-expect-error exercising the default branch
      kind: "unknown",
    });
    expect(next).toBe(initialFeedbackFormState);
  });
});

describe("postFeedback", () => {
  const BODY: FeedbackSubmitBody = {
    type: "bug",
    message: "broke",
    email: "",
    company: "",
  };

  function response(init: {
    ok: boolean;
    json?: () => Promise<unknown>;
  }): Response {
    return {
      ok: init.ok,
      json: init.json ?? (() => Promise.resolve({})),
    } as unknown as Response;
  }

  it("POSTs to the endpoint and returns submitSuccess on ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true }));
    const action = await postFeedback(BODY, fetchMock as unknown as typeof fetch);
    expect(action).toEqual({ kind: "submitSuccess" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(FEEDBACK_ENDPOINT);
    expect(JSON.parse(init.body)).toEqual(BODY);
  });

  it("maps server field errors to a validationFailed action", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ok: false,
        json: () => Promise.resolve({ fieldErrors: { message: "required" } }),
      }),
    );
    const action = await postFeedback(BODY, fetchMock as unknown as typeof fetch);
    expect(action).toEqual({
      kind: "validationFailed",
      errors: { message: "required" },
    });
  });

  it("uses a server error message when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ ok: false, json: () => Promise.resolve({ error: "nope" }) }),
    );
    const action = await postFeedback(BODY, fetchMock as unknown as typeof fetch);
    expect(action).toEqual({ kind: "submitError", message: "nope" });
  });

  it("falls back to a friendly message on a non-JSON error body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ ok: false, json: () => Promise.reject(new Error("bad json")) }),
    );
    const action = await postFeedback(BODY, fetchMock as unknown as typeof fetch);
    expect(action.kind).toBe("submitError");
    expect((action as { message: string }).message).toMatch(/went wrong/i);
  });

  it("returns a network submitError (not a throw) when fetch rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    const action = await postFeedback(BODY, fetchMock as unknown as typeof fetch);
    expect(action.kind).toBe("submitError");
    expect((action as { message: string }).message).toMatch(/network/i);
  });
});
