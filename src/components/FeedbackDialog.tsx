"use client";

import type { FormEvent, MouseEvent } from "react";

import {
  FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABELS,
  MESSAGE_MAX_LENGTH,
  type FeedbackFormState,
} from "@/lib/feedback";

/** Fields the dialog can change; mirrors the reducer's editable fields. */
export type FeedbackField = "type" | "message" | "email" | "company";

interface FeedbackDialogProps {
  /** Whether the feedback modal is open. */
  open: boolean;
  /** Close the modal — wired to the close button and backdrop. */
  onClose: () => void;
  /** Current form state (owned by useFeedbackForm in NoisePlayer). */
  state: FeedbackFormState;
  /** Report an edit to a field. */
  onFieldChange: (field: FeedbackField, value: string) => void;
  /** Submit the form (validation + network live in the hook). */
  onSubmit: () => void;
}

/** Links the dialog to its title for `aria-labelledby`, mirroring AboutDialog. */
const TITLE_ID = "feedback-dialog-title";
const MESSAGE_ID = "feedback-message";
const MESSAGE_ERROR_ID = "feedback-message-error";
const EMAIL_ID = "feedback-email";
const EMAIL_ERROR_ID = "feedback-email-error";

/**
 * Accessible feedback form modal (#132, FR-2). Pure and hookless — all state
 * lives in `useFeedbackForm` (owned by NoisePlayer, which also handles Escape
 * and focus return), matching the AboutDialog / PresetsPanel pattern so this can
 * be unit-tested by direct invocation. On error the fields keep their values so
 * the user never loses their text (FR-5).
 */
export default function FeedbackDialog({
  open,
  onClose,
  state,
  onFieldChange,
  onSubmit,
}: FeedbackDialogProps) {
  if (!open) return null;

  function onBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit();
  }

  const submitting = state.status === "submitting";
  const succeeded = state.status === "success";

  return (
    <div className="about-overlay" onClick={onBackdropClick}>
      <div
        className="about-dialog feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
      >
        <button
          type="button"
          className="about-close"
          onClick={onClose}
          aria-label="Close feedback dialog"
        >
          ×
        </button>
        <h2 id={TITLE_ID} className="about-title">
          Send feedback
        </h2>

        {succeeded ? (
          <div className="feedback-success" role="status">
            <p>Thanks! Your feedback has been sent.</p>
            <button type="button" className="feedback-submit" onClick={onClose}>
              Close
            </button>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={handleSubmit} noValidate>
            <p className="about-blurb">
              Report a bug or suggest a feature. Add your email if you&apos;d
              like a reply.
            </p>

            {state.errorMessage && (
              <p className="feedback-error" role="alert">
                {state.errorMessage}
              </p>
            )}

            <fieldset className="feedback-types">
              <legend>Type</legend>
              {FEEDBACK_TYPES.map((type) => (
                <label key={type}>
                  <input
                    type="radio"
                    name="feedback-type"
                    value={type}
                    checked={state.type === type}
                    onChange={() => onFieldChange("type", type)}
                    disabled={submitting}
                  />
                  {FEEDBACK_TYPE_LABELS[type]}
                </label>
              ))}
            </fieldset>

            <label className="feedback-label" htmlFor={MESSAGE_ID}>
              Message
              <textarea
                id={MESSAGE_ID}
                className="feedback-textarea"
                value={state.message}
                onChange={(e) => onFieldChange("message", e.target.value)}
                required
                maxLength={MESSAGE_MAX_LENGTH}
                rows={5}
                disabled={submitting}
                aria-required="true"
                aria-invalid={Boolean(state.fieldErrors.message)}
                aria-describedby={
                  state.fieldErrors.message ? MESSAGE_ERROR_ID : undefined
                }
              />
            </label>
            {state.fieldErrors.message && (
              <p id={MESSAGE_ERROR_ID} className="feedback-field-error" role="alert">
                {state.fieldErrors.message}
              </p>
            )}

            <label className="feedback-label" htmlFor={EMAIL_ID}>
              Email (optional)
              <input
                id={EMAIL_ID}
                className="feedback-input"
                type="email"
                value={state.email}
                onChange={(e) => onFieldChange("email", e.target.value)}
                placeholder="you@example.com"
                disabled={submitting}
                aria-invalid={Boolean(state.fieldErrors.email)}
                aria-describedby={
                  state.fieldErrors.email ? EMAIL_ERROR_ID : undefined
                }
              />
            </label>
            {state.fieldErrors.email && (
              <p id={EMAIL_ERROR_ID} className="feedback-field-error" role="alert">
                {state.fieldErrors.email}
              </p>
            )}

            {/* Honeypot: hidden from users + assistive tech; bots that fill it
                are silently rejected server-side (FR-4). */}
            <div className="feedback-hp" aria-hidden="true">
              <label htmlFor="feedback-company">Company</label>
              <input
                id="feedback-company"
                type="text"
                name="company"
                tabIndex={-1}
                autoComplete="off"
                value={state.company}
                onChange={(e) => onFieldChange("company", e.target.value)}
              />
            </div>

            <div className="feedback-actions">
              <button
                type="button"
                className="feedback-cancel"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="feedback-submit"
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
