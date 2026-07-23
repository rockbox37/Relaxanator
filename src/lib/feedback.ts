/**
 * Pure feedback-form logic (#132) — validation, payload shaping, the client
 * form state machine, an in-memory rate limiter, and the admin email body
 * renderer. Everything here is deterministic and framework-free so it can be
 * unit-tested directly (NFR-2) and shared between the client component
 * (FeedbackDialog / useFeedbackForm) and the server Route Handler
 * (app/api/feedback). No network, DOM, or env access lives here.
 */

/** The three feedback categories a user can pick (FR-2). */
export const FEEDBACK_TYPES = ["bug", "feature", "other"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

/** Human labels for the type selector / email subject. */
export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug",
  feature: "Feature request",
  other: "Other",
};

/** A message must have at least one non-whitespace character (FR-2). */
export const MESSAGE_MIN_LENGTH = 1;
/**
 * Upper bound so an abusive client can't post a giant body (FR-4). Generous
 * enough for a detailed bug report but bounded for email + storage sanity.
 */
export const MESSAGE_MAX_LENGTH = 5000;
/** RFC 5321 caps an address at 254 chars; reject anything longer (FR-4). */
export const EMAIL_MAX_LENGTH = 254;

/** Raw, untrusted input shape (from the client body or the form state). */
export interface FeedbackInput {
  type?: unknown;
  message?: unknown;
  email?: unknown;
  /** Honeypot: a hidden field real users never fill (FR-4). */
  company?: unknown;
}

/** Cleaned, validated submission ready to email. */
export interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  /** Optional reply-to address; `null` when the user left it blank. */
  email: string | null;
}

/** Per-field validation errors, keyed by the field they belong to. */
export interface FeedbackFieldErrors {
  type?: string;
  message?: string;
  email?: string;
}

export interface FeedbackValidation {
  ok: boolean;
  errors: FeedbackFieldErrors;
}

/** Type guard: is `value` one of the known feedback categories? */
export function isFeedbackType(value: unknown): value is FeedbackType {
  return (
    typeof value === "string" &&
    (FEEDBACK_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Deliberately simple email shape check (not full RFC 5322): one `@`, at least
 * one char before it, and a dotted domain after it. Mirrors the client-side
 * "basic email format" requirement (FR-2) and guards the reply-to server-side.
 */
export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > EMAIL_MAX_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Honeypot trip: the hidden `company` field must stay empty. A non-empty value
 * means a bot filled every field, so we silently reject (FR-4).
 */
export function isHoneypotTripped(input: FeedbackInput): boolean {
  return typeof input.company === "string" && input.company.trim().length > 0;
}

/**
 * Validate raw input for both the client (inline field errors) and the server
 * (reject bad requests). Honeypot is handled separately by the caller so the
 * server can respond with a benign success without leaking the trap.
 */
export function validateFeedbackInput(input: FeedbackInput): FeedbackValidation {
  const errors: FeedbackFieldErrors = {};

  if (!isFeedbackType(input.type)) {
    errors.type = "Choose a feedback type.";
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length < MESSAGE_MIN_LENGTH) {
    errors.message = "Please enter a message.";
  } else if (message.length > MESSAGE_MAX_LENGTH) {
    errors.message = `Message must be ${MESSAGE_MAX_LENGTH} characters or fewer.`;
  }

  // Email is optional — only validate a non-empty value.
  if (typeof input.email === "string" && input.email.trim().length > 0) {
    if (!isValidEmail(input.email)) {
      errors.email = "Enter a valid email address, or leave it blank.";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

/**
 * Coerce validated input into a clean payload. Throws if the input is invalid,
 * so callers must `validateFeedbackInput` first (the server does both).
 */
export function normalizeFeedbackInput(input: FeedbackInput): FeedbackPayload {
  const validation = validateFeedbackInput(input);
  if (!validation.ok) {
    throw new Error("Cannot normalize invalid feedback input.");
  }
  const type = input.type as FeedbackType;
  const message = (input.message as string).trim();
  const rawEmail = typeof input.email === "string" ? input.email.trim() : "";
  return { type, message, email: rawEmail.length > 0 ? rawEmail : null };
}

/* --------------------------------------------------------------------- *
 * Admin email rendering
 * --------------------------------------------------------------------- */

export interface FeedbackEmailMeta {
  /** App version/release for triage context (optional). */
  appVersion?: string;
  /** ISO timestamp the submission was received. */
  receivedAt?: string;
}

export interface RenderedFeedbackEmail {
  subject: string;
  text: string;
  /** Reply-to the user's address when provided, so the admin can respond. */
  replyTo: string | null;
}

/** Build the plain-text admin email for a submission (pure; no send). */
export function renderFeedbackEmail(
  payload: FeedbackPayload,
  meta: FeedbackEmailMeta = {},
): RenderedFeedbackEmail {
  const label = FEEDBACK_TYPE_LABELS[payload.type];
  const subject = `[Relaxanator feedback] ${label}`;
  const lines = [
    `Type: ${label}`,
    `From: ${payload.email ?? "(no email provided)"}`,
  ];
  if (meta.receivedAt) lines.push(`Received: ${meta.receivedAt}`);
  if (meta.appVersion) lines.push(`App version: ${meta.appVersion}`);
  lines.push("", "Message:", payload.message);
  return { subject, text: lines.join("\n"), replyTo: payload.email };
}

/* --------------------------------------------------------------------- *
 * In-memory fixed-window rate limiter (FR-4)
 * --------------------------------------------------------------------- */

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the window resets (only meaningful when blocked). */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

export interface RateLimiterOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max allowed requests per key within a window. */
  max: number;
}

/**
 * Create a per-key fixed-window limiter. Deterministic when `now` is supplied,
 * so tests can advance time without real clocks. State is process-local (fine
 * for a single Fly machine; a shared store would be needed to scale out).
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max } = options;
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const entry = hits.get(key);
      if (!entry || now >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (entry.count >= max) {
        return { allowed: false, retryAfterMs: Math.max(0, entry.resetAt - now) };
      }
      entry.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

/* --------------------------------------------------------------------- *
 * Client form state machine (used by useFeedbackForm; pure + testable)
 * --------------------------------------------------------------------- */

export type FeedbackStatus = "idle" | "submitting" | "success" | "error";

export interface FeedbackFormState {
  type: FeedbackType;
  message: string;
  email: string;
  /** Honeypot value — bound to a hidden input, always "" for real users. */
  company: string;
  status: FeedbackStatus;
  /** Top-level error banner text (network/server), distinct from field errors. */
  errorMessage: string | null;
  fieldErrors: FeedbackFieldErrors;
}

export const initialFeedbackFormState: FeedbackFormState = {
  type: "bug",
  message: "",
  email: "",
  company: "",
  status: "idle",
  errorMessage: null,
  fieldErrors: {},
};

export type FeedbackFormAction =
  | { kind: "setField"; field: "type" | "message" | "email" | "company"; value: string }
  | { kind: "submitStart" }
  | { kind: "validationFailed"; errors: FeedbackFieldErrors }
  | { kind: "submitSuccess" }
  | { kind: "submitError"; message: string }
  | { kind: "reset" };

/** Where the client POSTs submissions (matches the Route Handler path). */
export const FEEDBACK_ENDPOINT = "/api/feedback";

/** The JSON body the client sends to the feedback endpoint. */
export interface FeedbackSubmitBody {
  type: FeedbackType;
  message: string;
  email: string;
  /** Honeypot — always "" for real users (FR-4). */
  company: string;
}

/**
 * POST a submission and map the HTTP response onto a reducer action. Network
 * errors never throw — they resolve to a `submitError` action so the caller can
 * dispatch it and preserve the user's input (FR-5). `fetchImpl` is injectable so
 * this is fully testable with a mock (no real network in the suite, NFR-2).
 */
export async function postFeedback(
  body: FeedbackSubmitBody,
  fetchImpl: typeof fetch = fetch,
): Promise<FeedbackFormAction> {
  try {
    const res = await fetchImpl(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { kind: "submitSuccess" };

    let message = "Something went wrong. Please try again.";
    try {
      const data = (await res.json()) as {
        error?: string;
        fieldErrors?: FeedbackFieldErrors;
      };
      if (data.fieldErrors && Object.keys(data.fieldErrors).length > 0) {
        return { kind: "validationFailed", errors: data.fieldErrors };
      }
      if (typeof data.error === "string" && data.error) message = data.error;
    } catch {
      // Non-JSON error body — keep the friendly default.
    }
    return { kind: "submitError", message };
  } catch {
    return {
      kind: "submitError",
      message: "Network error — please check your connection and try again.",
    };
  }
}

/**
 * Reducer for the feedback form. Editing any field while an error is showing
 * clears the banner and that field's inline error, and a successful submit
 * returns to a fresh form — but the user's text is preserved on `submitError`
 * (FR-5) so nothing is lost when the network/provider fails.
 */
export function feedbackFormReducer(
  state: FeedbackFormState,
  action: FeedbackFormAction,
): FeedbackFormState {
  switch (action.kind) {
    case "setField": {
      const field = action.field;
      const nextFieldErrors = { ...state.fieldErrors };
      if (field === "type" || field === "message" || field === "email") {
        delete nextFieldErrors[field];
      }
      return {
        ...state,
        [field]: action.value,
        // Leaving success/error the moment the user edits keeps the UI honest.
        status: state.status === "submitting" ? state.status : "idle",
        errorMessage: null,
        fieldErrors: nextFieldErrors,
      };
    }
    case "submitStart":
      return {
        ...state,
        status: "submitting",
        errorMessage: null,
        fieldErrors: {},
      };
    case "validationFailed":
      return {
        ...state,
        status: "idle",
        fieldErrors: action.errors,
      };
    case "submitSuccess":
      // Fresh form, but stay on the success screen until the dialog closes.
      return { ...initialFeedbackFormState, status: "success" };
    case "submitError":
      // Preserve every field the user typed (FR-5).
      return {
        ...state,
        status: "error",
        errorMessage: action.message,
      };
    case "reset":
      return { ...initialFeedbackFormState };
    default:
      return state;
  }
}
