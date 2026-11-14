# FoodTrack

A self-hosted, installable web app (PWA) that makes it take under a minute a day to record what you ate, how your gut
behaved and how you felt — and then finds which foods tend to come before bad days, says how sure it is, and helps you
test a suspicion with a structured N-of-1 trial.

Hebrew and English, right-to-left first. Works offline. Your data stays on your server; the narrative layer (meal text,
notes, photos) is encrypted at rest.

> FoodTrack is a wellness tool, not a medical device. It never diagnoses anything.

## What's in the box

| | |
|---|---|
| `apps/web` | Next.js 15 PWA — Dexie (IndexedDB) offline store and outbox, service worker, Tailwind v4 from design tokens |
| `apps/api` | Fastify API + background worker — auth, sync, the meal parser, trials, exports, push reminders |
| `apps/analysis` | Python (FastAPI, numpy/scipy/statsmodels) — the association engine and Bayesian trial verdicts |
| `packages/` | `shared` (zod schemas, day maths, copy rules) · `tracker-schema` (the tracker meta-schema) · `tokens` |
| `config/` | 14 tracker definitions, 4 packs, 131 seed foods, FODMAP classes, engine parameters — trackers are data, not code |
| `docs/` | the specifications (the contract), `impl-notes.md` (decisions taken while building), `runbook.md`, `deployment.md` (production: where it runs, how to deploy and verify) |

## Run it

```bash
cp .env.example .env && docker compose up -d     # see docs/runbook.md for first-install key setup
```

Local development without Docker (Postgres 16+ and Python 3.12+ on the machine):

```bash
pnpm install
scripts/dev-db.sh && pnpm db:migrate && pnpm keys:init && pnpm db:seed   # demo user, 90 days, passphrase "foodtrack demo passphrase"
python -m venv .venv && .venv/bin/pip install -r apps/analysis/requirements.txt
(cd apps/analysis && ../../.venv/bin/uvicorn main:app --port 8000) &
pnpm dev                                                                  # web :3000, api :4000
```

## Tests

```bash
pnpm lint            # eslint + the RTL logical-property rule + the copy lint (no causal or diagnostic language)
pnpm test            # unit + integration against real Postgres with RLS
pnpm test:e2e        # Playwright, LTR + RTL, online + offline (US-02, US-04, US-08, meals)
pnpm test:stats      # the release gate: 500 simulated no-effect users, < 10% may surface a medium+ insight
```
