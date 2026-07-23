import { describe, expect, it, vi } from "vitest";

import type { FeedbackPayload } from "./feedback";
import {
  DEFAULT_FROM_EMAIL,
  RESEND_ENDPOINT,
  readFeedbackEmailConfig,
  sendFeedbackEmail,
  type FeedbackEmailConfig,
} from "./feedback-email";

const CONFIG: FeedbackEmailConfig = {
  apiKey: "re_test_key",
  adminEmail: "admin@relaxanator.com",
  fromEmail: "feedback@relaxanator.com",
};

const PAYLOAD: FeedbackPayload = {
  type: "bug",
  message: "Something is off",
  email: "user@example.com",
};

/** Build a minimal Response-like object for the injected fetch. */
function fakeResponse(init: {
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
}): Response {
  return {
    ok: init.ok,
    status: init.status,
    text: init.text ?? (() => Promise.resolve("")),
  } as unknown as Response;
}

describe("readFeedbackEmailConfig", () => {
  it("returns null when the API key is missing", () => {
    expect(
      readFeedbackEmailConfig({ FEEDBACK_ADMIN_EMAIL: "a@b.com" }),
    ).toBeNull();
  });

  it("returns null when the admin email is missing or blank", () => {
    expect(readFeedbackEmailConfig({ RESEND_API_KEY: "k" })).toBeNull();
    expect(
      readFeedbackEmailConfig({ RESEND_API_KEY: "k", FEEDBACK_ADMIN_EMAIL: "  " }),
    ).toBeNull();
  });

  it("resolves config with the default sender when FROM is unset", () => {
    const config = readFeedbackEmailConfig({
      RESEND_API_KEY: " k ",
      FEEDBACK_ADMIN_EMAIL: " admin@x.com ",
    });
    expect(config).toEqual({
      apiKey: "k",
      adminEmail: "admin@x.com",
      fromEmail: DEFAULT_FROM_EMAIL,
    });
  });

  it("uses a custom FROM address when provided", () => {
    const config = readFeedbackEmailConfig({
      RESEND_API_KEY: "k",
      FEEDBACK_ADMIN_EMAIL: "admin@x.com",
      FEEDBACK_FROM_EMAIL: "noreply@x.com",
    });
    expect(config?.fromEmail).toBe("noreply@x.com");
  });
});

describe("sendFeedbackEmail", () => {
  it("POSTs to Resend with auth, recipient, and reply-to, returning ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200 }));
    const result = await sendFeedbackEmail(
      CONFIG,
      PAYLOAD,
      {},
      fetchMock as unknown as typeof fetch,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${CONFIG.apiKey}`);
    const sent = JSON.parse(init.body);
    expect(sent.to).toEqual([CONFIG.adminEmail]);
    expect(sent.from).toBe(CONFIG.fromEmail);
    expect(sent.reply_to).toBe(PAYLOAD.email);
    expect(sent.subject).toContain("Bug");
  });

  it("omits reply_to when the user left no email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse({ ok: true, status: 200 }));
    await sendFeedbackEmail(
      CONFIG,
      { ...PAYLOAD, email: null },
      {},
      fetchMock as unknown as typeof fetch,
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.reply_to).toBeUndefined();
  });

  it("returns a failure with detail when the provider responds non-2xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 422,
        text: () => Promise.resolve("bad from address"),
      }),
    );
    const result = await sendFeedbackEmail(
      CONFIG,
      PAYLOAD,
      {},
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, status: 422, error: "bad from address" });
  });

  it("falls back to a generic message when the error body is unreadable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error("stream error")),
      }),
    );
    const result = await sendFeedbackEmail(
      CONFIG,
      PAYLOAD,
      {},
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "Email provider returned status 500",
    });
  });

  it("resolves to a failure (not a throw) when the network rejects", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await sendFeedbackEmail(
      CONFIG,
      PAYLOAD,
      {},
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, error: "ECONNREFUSED" });
  });

  it("handles a non-Error rejection value", async () => {
    const fetchMock = vi.fn().mockRejectedValue("weird");
    const result = await sendFeedbackEmail(
      CONFIG,
      PAYLOAD,
      {},
      fetchMock as unknown as typeof fetch,
    );
    expect(result).toEqual({ ok: false, error: "Unknown email error" });
  });
});
