/**
 * POST /api/feedback — accepts a feedback submission and emails it to the site
 * admin (#132, FR-3/FR-4/FR-5). Runs on the Node runtime so it can read secrets
 * and use `fetch` inside the Fly.io standalone server.
 *
 * Order of checks: parse → honeypot → validate → rate-limit → config → send.
 * The handler always returns JSON and never throws to the client; when email
 * isn't configured or the provider fails it fails safe with a clear status so
 * the client can show a friendly message without losing the user's input.
 */

import {
  createRateLimiter,
  isHoneypotTripped,
  normalizeFeedbackInput,
  validateFeedbackInput,
  type FeedbackInput,
} from "@/lib/feedback";
import {
  readFeedbackEmailConfig,
  sendFeedbackEmail,
} from "@/lib/feedback-email";

/** Secrets + `fetch` are only available on the Node runtime, not the Edge. */
export const runtime = "nodejs";
/** Never statically optimize — every submission is a fresh POST. */
export const dynamic = "force-dynamic";

/** At most 5 submissions per IP per 10 minutes (FR-4). Process-local state. */
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const rateLimiter = createRateLimiter({ windowMs: RATE_WINDOW_MS, max: RATE_MAX });

/** Cap the raw body we'll parse so a huge POST can't exhaust memory (FR-4). */
const MAX_BODY_BYTES = 64 * 1024;

/** Best-effort client IP for rate limiting behind Fly's proxy. */
function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("fly-client-ip") ?? "unknown";
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request): Promise<Response> {
  // Reject oversized bodies up front when the client declares a length.
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "Message is too large." }, 413);
  }

  let input: FeedbackInput;
  try {
    const raw: unknown = await req.json();
    if (!raw || typeof raw !== "object") {
      return json({ ok: false, error: "Invalid request body." }, 400);
    }
    input = raw as FeedbackInput;
  } catch {
    return json({ ok: false, error: "Invalid request body." }, 400);
  }

  // Honeypot: respond with a benign success so bots don't learn about the trap.
  if (isHoneypotTripped(input)) {
    return json({ ok: true }, 200);
  }

  const validation = validateFeedbackInput(input);
  if (!validation.ok) {
    return json(
      { ok: false, error: "Please fix the highlighted fields.", fieldErrors: validation.errors },
      400,
    );
  }

  const limit = rateLimiter.check(clientIp(req));
  if (!limit.allowed) {
    return json(
      { ok: false, error: "Too many submissions. Please try again later." },
      429,
    );
  }

  const config = readFeedbackEmailConfig(process.env);
  if (!config) {
    // Fail safe: env not configured — no crash, clear signal (FR-5).
    return json(
      { ok: false, error: "Feedback email is not configured on the server." },
      503,
    );
  }

  const payload = normalizeFeedbackInput(input);
  const result = await sendFeedbackEmail(config, payload, {
    receivedAt: new Date().toISOString(),
    appVersion: process.env.NEXT_PUBLIC_COMMIT_SHA?.trim() || undefined,
  });

  if (!result.ok) {
    return json(
      { ok: false, error: "Could not send your feedback right now. Please try again." },
      502,
    );
  }

  return json({ ok: true }, 200);
}
