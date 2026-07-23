# Relaxanator

Offline-capable web app that generates colored background noise (brown, pink,
white) shaped by a 10-band graphic equalizer, layered with configurable
periodic meditation sounds and break prompts. All user data stays in the
browser — no accounts, no backend state.

## Development

```sh
npm install
npm run dev        # http://localhost:3000
task check         # quality gate: lint + typecheck + tests (85% coverage)
```

Work is tracked as scope xBRIEFs under `xbrief/` (Deft Directive); run
`deft triage:queue` for the ranked queue.

## Feedback form (email delivery)

The in-app feedback form (top-right speech-bubble icon and the "Send feedback"
link in the About dialog) POSTs to the `POST /api/feedback` Route Handler, which
emails submissions to the site admin via [Resend](https://resend.com) (called
over its REST API with `fetch` — no extra runtime dependency).

Email delivery is configured entirely through environment variables; **no
secrets are committed**. The app builds and runs without them — when they are
unset the route fails safe with a clear "not configured" response (HTTP 503) and
the form shows a friendly error without losing the user's text.

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | yes | Resend API key used to send the email. |
| `FEEDBACK_ADMIN_EMAIL` | yes | Destination address that receives submissions. |
| `FEEDBACK_FROM_EMAIL` | no | Verified sender (defaults to Resend's shared `onboarding@resend.dev`; set a verified-domain address in production). |
| `NEXT_PUBLIC_COMMIT_SHA` | no | Included in the email body for triage. |

Set them as Fly secrets (restart happens automatically):

```sh
fly secrets set \
  RESEND_API_KEY=re_xxxxxxxx \
  FEEDBACK_ADMIN_EMAIL=you@example.com \
  FEEDBACK_FROM_EMAIL="Relaxanator Feedback <feedback@your-verified-domain.com>"
```

For local development, put the same keys in `.env.local` (git-ignored).

Anti-abuse: a hidden honeypot field plus per-IP rate limiting (5 submissions /
10 minutes) and server-side validation (type + non-empty, bounded message)
guard the endpoint.

## Deployment (Fly.io)

The app deploys to https://relaxanator.fly.dev as a Next.js standalone build
(see `Dockerfile` and `fly.toml`; machines auto-stop when idle).

```sh
fly deploy         # build remotely and release
fly status         # verify machines + health checks
```
