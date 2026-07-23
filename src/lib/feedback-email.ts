/**
 * Swappable email-delivery module for feedback submissions (#132, FR-3).
 *
 * The default provider is Resend, called via its REST API with `fetch` so we
 * add no runtime dependency and the whole send is trivially mockable in tests
 * (NFR-2) — no real network or emails ever run in the suite. To switch
 * providers, replace `sendFeedbackEmail` (or branch inside it); callers only
 * depend on the `SendFeedbackResult` contract.
 *
 * Secrets are read from the environment by `readFeedbackEmailConfig` and passed
 * in explicitly, so this module never touches `process.env` directly and stays
 * pure/deterministic. When required secrets are absent the config reader
 * returns `null`, letting the Route Handler fail safe (FR-5).
 */

import {
  renderFeedbackEmail,
  type FeedbackEmailMeta,
  type FeedbackPayload,
} from "./feedback";

/** Resolved secrets needed to send an admin email. */
export interface FeedbackEmailConfig {
  apiKey: string;
  adminEmail: string;
  fromEmail: string;
}

/** Environment shape we read from (a subset of `process.env`). */
export type FeedbackEmailEnv = Record<string, string | undefined>;

/** Resend transactional-email endpoint. */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Fallback sender. Resend's shared onboarding domain works out of the box for
 * low volume; set `FEEDBACK_FROM_EMAIL` to a verified domain in production.
 */
export const DEFAULT_FROM_EMAIL = "Relaxanator Feedback <onboarding@resend.dev>";

/**
 * Resolve email config from the environment. Returns `null` when either
 * required secret is missing/blank so the caller can respond "not configured"
 * instead of attempting a doomed send (FR-5). `FEEDBACK_FROM_EMAIL` is optional.
 */
export function readFeedbackEmailConfig(
  env: FeedbackEmailEnv,
): FeedbackEmailConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const adminEmail = env.FEEDBACK_ADMIN_EMAIL?.trim();
  if (!apiKey || !adminEmail) return null;
  const fromEmail = env.FEEDBACK_FROM_EMAIL?.trim() || DEFAULT_FROM_EMAIL;
  return { apiKey, adminEmail, fromEmail };
}

export type SendFeedbackResult =
  | { ok: true }
  | { ok: false; status?: number; error: string };

/**
 * Send the admin email for a submission. `fetchImpl` defaults to the global
 * `fetch` but is injectable so tests supply a mock (no network in CI). Any
 * non-2xx response or thrown error resolves to `{ ok: false }` — the route maps
 * that to a friendly 502 without crashing (FR-5).
 */
export async function sendFeedbackEmail(
  config: FeedbackEmailConfig,
  payload: FeedbackPayload,
  meta: FeedbackEmailMeta = {},
  fetchImpl: typeof fetch = fetch,
): Promise<SendFeedbackResult> {
  const email = renderFeedbackEmail(payload, meta);
  const body: Record<string, unknown> = {
    from: config.fromEmail,
    to: [config.adminEmail],
    subject: email.subject,
    text: email.text,
  };
  if (email.replyTo) body.reply_to = email.replyTo;

  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        status: res.status,
        error: detail || `Email provider returned status ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
