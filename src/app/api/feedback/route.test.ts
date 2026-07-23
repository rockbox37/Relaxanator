import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the network send; keep the real (pure) config reader. The mock fn
// is created via vi.hoisted so it's available inside the hoisted vi.mock factory.
const { sendFeedbackEmail } = vi.hoisted(() => ({ sendFeedbackEmail: vi.fn() }));
vi.mock("@/lib/feedback-email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/feedback-email")>();
  return { ...actual, sendFeedbackEmail };
});

import { POST } from "./route";

/** Build a POST Request with a JSON body and a unique IP for rate isolation. */
function post(body: unknown, ip = `ip-${Math.random()}`): Request {
  return new Request("http://localhost/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

const VALID = { type: "bug", message: "It crashed", email: "u@e.com" };

beforeEach(() => {
  sendFeedbackEmail.mockReset();
  sendFeedbackEmail.mockResolvedValue({ ok: true });
  process.env.RESEND_API_KEY = "re_test";
  process.env.FEEDBACK_ADMIN_EMAIL = "admin@relaxanator.com";
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  delete process.env.FEEDBACK_ADMIN_EMAIL;
  delete process.env.FEEDBACK_FROM_EMAIL;
});

describe("POST /api/feedback", () => {
  it("sends the email and returns 200 for a valid submission", async () => {
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sendFeedbackEmail).toHaveBeenCalledTimes(1);
    const [, payload] = sendFeedbackEmail.mock.calls[0];
    expect(payload).toEqual({ type: "bug", message: "It crashed", email: "u@e.com" });
  });

  it("rejects an unparseable body with 400", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "ip-bad" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("rejects a non-object JSON body with 400", async () => {
    const res = await POST(post("just a string"));
    expect(res.status).toBe(400);
  });

  it("silently accepts (200) a honeypot hit without sending", async () => {
    const res = await POST(post({ ...VALID, company: "Acme" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 400 with field errors for invalid input", async () => {
    const res = await POST(post({ type: "bug", message: "" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.fieldErrors.message).toBeDefined();
    expect(sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 503 when email is not configured (fail safe)", async () => {
    delete process.env.RESEND_API_KEY;
    const res = await POST(post(VALID));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toMatch(/not configured/i);
    expect(sendFeedbackEmail).not.toHaveBeenCalled();
  });

  it("returns 502 when the provider fails", async () => {
    sendFeedbackEmail.mockResolvedValue({ ok: false, error: "boom" });
    const res = await POST(post(VALID));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns 413 when the declared body is too large", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "ip-big",
        "content-length": String(200 * 1024),
      },
      body: JSON.stringify(VALID),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it("rate-limits repeated submissions from one IP with 429", async () => {
    const ip = "ip-rate-limited";
    let last: Response | undefined;
    for (let i = 0; i < 6; i += 1) {
      last = await POST(post(VALID, ip));
    }
    expect(last!.status).toBe(429);
  });

  it("uses fly-client-ip when x-forwarded-for is absent", async () => {
    const req = new Request("http://localhost/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json", "fly-client-ip": "5.6.7.8" },
      body: JSON.stringify(VALID),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
