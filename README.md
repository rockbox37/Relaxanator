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

## Deployment (Fly.io)

The app deploys to https://relaxanator.fly.dev as a Next.js standalone build
(see `Dockerfile` and `fly.toml`; machines auto-stop when idle).

```sh
fly deploy         # build remotely and release
fly status         # verify machines + health checks
```
