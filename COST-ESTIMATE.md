<!-- Produced from .deft/core/templates/COST-ESTIMATE.md -->
<!-- Methodology: .deft/core/references/cost-models.md (#739 / deft-directive-cost). -->

# Cost & Budget Estimate

> All figures in **US dollars (USD)**. Loose ranges, not exact numbers.
> Built from the approved project spec and the current app shape (offline
> PWA on Fly.io). If the spec or hosting choice changes, redo this
> estimate.

## TL;DR

Most months: about **$0 - $15**. This is a browser-local audio PWA with
no accounts, database, or paid APIs — the bill is mostly Fly.io when
someone hits the site, plus a domain name. Costs go up if the machine
stays warm for long stretches or you add paid review/AI tooling for
development. Worst case for the *app itself*: still usually under about
**$50 / month** unless traffic is huge.

## What you will need to sign up for

- Fly.io account to host the Next.js app (free tier / pay-as-you-go OK for quiet use)
- Domain registrar for `relaxanator.com` (typical: $10 - $20 / year)
- GitHub account for the repo and CI (free tier OK for this project's light workflows)
- _(Optional)_ Greptile or similar for PR bot review — development only, not required to run the app
- _(Optional)_ Cursor / other AI coding tools — development only; not a runtime cost

No accounts needed for end users. No payment processor, email provider,
database, or AI API for the live product.

## Hosting & infrastructure

The app is a Next.js standalone build on Fly.io (`shared-cpu-1x`, 512 MB,
auto-stop when idle, `min_machines_running = 0`). Audio runs in the
browser; settings stay in `localStorage`. Static assets (shell + samples)
are a few megabytes — not a media CDN product.

- **Hosting / app server (Fly.io)**: estimated $0 - $15 / month  
  _(low: mostly idle with auto-stop; typical: light public traffic; high: machine often warm or scaled)_
- **Database**: not used — $0
- **CDN / file storage**: not a separate product; small static files served with the app — estimated $0 - $5 / month at normal traffic
- **Domain & TLS**: ~$1 - $2 / month (annual `.com` cost spread out; TLS via Fly)
- **Email / notifications**: not used server-side (optional browser Notification API is free) — $0
- **GitHub Actions CI**: estimated $0 / month on free allowance for this repo's light PR workflows (e.g. deft-core-guard); watch minutes only if private-repo limits tighten

## API & third-party fees

There are **no usage-based product APIs** in the approved spec. Noise,
EQ, meditation tones, and break prompts are generated or played in the
browser. No LLM, SMS, maps, or payments.

> _Assumption used for the bands below: a quiet-to-moderate public site —
> on the order of tens to a few hundred visits per day, each loading a
> small PWA shell (~few MB of assets once, then offline). Adjust if you
> expect a large launch spike._

- **AI / LLM (product)**: not in scope — $0
- **Image generation**: not in scope — $0
- **Search or embeddings**: not in scope — $0
- **SMS / phone calls**: not in scope — $0
- **Maps / location**: not in scope — $0
- **Payments**: not in scope — $0
- **Dev-only tooling (optional)**: Cursor, Greptile, etc. are human/dev
  subscriptions, not app runtime. Budget separately if you use them
  (often about $0 - $40 / month per person depending on tools) — **not
  included** in the monthly band below.

## Monthly band

Roll-up for **running the live app** (hosting + domain share). Excludes
optional AI/dev subscriptions and unpaid maintainer time.

- **Low** _(idle / demo / mostly local use)_: ~$0 - $5 / month
- **Typical** _(public site on Fly + `relaxanator.com`, quiet-moderate traffic)_: ~$5 - $15 / month
- **High** _(machine stays warm often, traffic spike, or you add paid hosting extras)_: ~$20 - $50 / month

One-time / annual (not in the monthly roll-up above):

- **Domain registration / renewal**: about $10 - $20 / year
- **Initial Fly / DNS setup**: usually $0 beyond time

## Scale considerations

What would push this from typical into high?

- Many simultaneous visitors keeping Fly machines running (auto-stop helps when quiet; constant traffic does not)
- Serving much larger audio sample packs to first-time visitors (today's public audio tree is only a few MB)
- Adding a real backend later (accounts, sync, analytics, email) — that would need a **new** estimate; it is out of the current spec
- Viral launch traffic for a few days (still usually modest dollars for this shape, but the high band covers a busy month)

The high band is **not** more than about 10x typical for the *current*
offline-PWA shape. The big cost surprises for this project would come
from **new** paid services, not from the noise generator itself.

## Build & maintenance time

A rough sense of effort, not a quote. The app is already substantially
implemented (PWA shell, audio engines, Fly deploy path).

- **Build** _(remaining polish / scoped features from the queue)_: about 20 - 80 hours of focused work, depending on how many open stories you take on
- **Maintenance**: about 2 - 8 hours / month after launch (deps, CI, occasional Fly/DNS touch-ups, small bugs)

## Decision point

Pick **one**. The build phase will refuse to start until this is
recorded.

1. **Build** -- proceed to build with this cost expectation.
2. **Rescope** -- keep building but reduce cost first. List the spec
   changes, then redo this estimate.
3. **No-build** -- stop here. Record the reason below.
4. **Skip** -- skip the cost phase. Record a short reason
   (e.g. "hobby project, cost is not a concern", or "cost already
   estimated as part of parent project X").

### Decision recorded

- **Decision**: build
- **Date**: 2026-07-18
- **Recorded by**: Baba
- **Reason**: Operator accepted the cost expectation (typical ~$5–$15/month app runtime) and chose to continue build work.

---

_This estimate is a snapshot. Vendor pricing changes over time. Redo
this file before any major scope change. Methodology lives in
[.deft/core/references/cost-models.md](.deft/core/references/cost-models.md)._
