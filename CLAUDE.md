# CLAUDE.md — FoodTrack

Read this before writing any code in this repo. Then read the spec doc for whatever you're building.

## Pending work — read first

**There is unfinished work in `docs/HANDOFF.md`.** If the owner says "continue" (or anything similar), read that file and carry out its steps without asking. Remove this section when the handoff is done.

## What this is

A self-hosted PWA for tracking food, stool, symptoms and wellbeing, which finds statistical associations between what you eat and how your gut behaves, and then helps you test those associations with structured N-of-1 trials.

Under the hood it is a **configurable tracker engine**. Gut health is the first preset, not the architecture.

## Specs — these are the contract

| Doc | When to read it |
|---|---|
| `docs/00-overview.md` | Always. Decisions, scope, non-goals. |
| `docs/01-product-spec.md` | Features, user stories, acceptance criteria. |
| `docs/02-data-model.md` | Any schema or tracker-definition work. |
| `docs/03-api-spec.md` | Any endpoint, sync, or LLM work. |
| `docs/04-analysis-engine.md` | Anything statistical. Read it fully, not partially. |
| `docs/05-ux-design.md` | Any UI work. |
| `docs/06-architecture.md` | Infra, security, testing. |
| `docs/07-build-plan.md` | To know what milestone you're on. |
| `docs/08-user-flows.md` | **Any flow, branch, error, or back button.** Resolves D15–D31. |
| `docs/09-screen-inventory.md` | Every screen and control. The completeness checklist. |
| `docs/deployment.md` | Production: where it runs, how to deploy/verify, known risks. |
| `docs/10-competitive-gaps.md` | Before adding any "new" feature. Resolves D32–D46; lists what we deliberately rejected. |

If a spec is wrong, change the spec in the same commit as the code. Never let them drift.

## The nine rules

1. **Never hard-code a tracker.** `if (tracker_key === 'stool')` in UI or analysis code is a bug. Extend the tracker definition format instead. This is the whole point of the design.

2. **The network is never on the critical path of a save.** Write to IndexedDB, render from IndexedDB, drain the outbox in the background. A save must be visible in under 100 ms with the network off.

3. **Never claim causation.** No user-facing string, and no LLM output, may say a food *causes* anything. Observational data produces suspicions; only trials produce evidence. The copy lint enforces this and must never be disabled.

4. **Never weaken a statistical gate to make a test pass.** In particular, the null-data test (500 simulated no-effect users, under 10% surfacing a medium+ insight) is a release gate. If it fails, the engine is wrong — fix the engine.

5. **The app works with everything external down.** No LLM, no food APIs, no network: logging, viewing and editing all still work. The `deterministic` LLM provider is a real provider, not a stub.

6. **RTL is structural.** Logical CSS properties only — `ps-*`/`pe-*`/`ms-*`/`me-*`, `margin-inline-start`, `text-align: start`. No `left`/`right` anywhere outside the documented allowlist. Enforced by ESLint.

7. **Nothing the user typed is ever silently discarded, and nothing is unreachable.** Every screen declares one of the three unsaved-work behaviours in `08` §1.2. Every enabled tracker is reachable in two taps. Every destructive action has an undo or a typed confirmation. Every error says what happened, what was preserved, and what to do — never just "something went wrong". A disabled control with no adjacent explanation is a bug.

8. **Logging at night is the normal case, not the edge case.** The day builder (`08` §4.15) and the day view (§5.1b) are one screen in two modes, and they are P0. A time the app inferred is marked `slot_estimate` and excluded from the 0–6 h lag window — **never** present an inferred timestamp as exact, in the UI or in the data.

9. **An open-label trial is hypothesis-generating, not confirmatory — and the verdict card must say so.** In the blinded FODMAP reintroduction trial an *inert glucose control* triggered a positive response in **26%** of participants; 37% of self-diagnosed gluten-sensitive people peak on placebo. So roughly one in four "confirmed triggers" from an uncontrolled protocol is false. Designs A–C carry the open-label label, enforced by the copy lint. Design D (blinded challenge, `04` §10.6) requires an inert control period and a server-held allocation key that **never** appears in a sync payload. Every design, blinded or not, ends each period by asking the user which arm they think they got, and the verdict reports the analysis both by allocation and by guess.

## Safety rules that are never negotiable

- Never generate a suggestion to start, stop or change a medication.
- Never name a medical condition in generated copy.
- Red-flag detection (blood, melena, unintended weight loss, persistent severe pain, fever with GI symptoms) always outranks insights in the UI, and only ever says "see a doctor".
- Maximum one active elimination trial; maximum three concurrent eliminations; every elimination has a mandatory scheduled reintroduction.
- Never send stool, symptom, mood or weight data to a remote LLM. Meal text may go to the configured parse provider; narrative generation receives aggregated numbers only.
- **Encryption is L2, envelope-keyed** (`06` §5.3). The narrative layer — meal text, notes, photos, food aliases — is encrypted at the application layer; numeric observation values are not, because the analysis engine reads them. If the KEK is missing or wrong, the API **fails to start**. Never fall back to writing plaintext into an encrypted column.
- Never present a lag window the user picked as a finding. The lag is an **output with uncertainty**, corrected across windows in the same FDR family as everything else. Letting the user fish across lags is what the competition does, and it is uncontrolled multiple testing.
- The passphrase is an **auth credential, not an encryption key**. Never write copy claiming a forgotten passphrase destroys data, and never offer to wipe the database as a "recovery" option. Reset is a server-side CLI command (`06` §5.2).

## Already written — load, don't re-author

`config/trackers/*.json` (14, incl. `migraine` — the M7 genericity proof) · `config/packs/*.json` (4) · `config/foods/seed.json` · `config/food-tags/fodmap.json` + `citations.json` + `tag-labels.json` · `config/analysis.json` · `config/llm.json` · `packages/tokens/tokens.json` · `apps/web/locales/{en,he}.json` (644 keys each).

Two standing rules about them: **`tokens.json` is the single source of truth for the design system** — Tailwind config and CSS variables are generated from it, never hand-edited. And **no user-facing string is written in a component** — it goes in the locale files, both of them, or it doesn't ship.

## Stack

Next.js 15 + React 19 + TypeScript strict · Tailwind v4 · Dexie (IndexedDB) · TanStack Query · Fastify API · PostgreSQL 18 with RLS · hand-written SQL migrations + `pg` (impl-notes I-01) · the `job` table as queue (I-11) · Python 3.12 + FastAPI + numpy/scipy/statsmodels for analysis · encrypted volume for media (I-12) · Docker Compose.

## Commands

```bash
pnpm dev                 # web + api (the api runs the job worker in-process)
docker compose up -d     # full stack including postgres, minio, analysis
pnpm db:migrate          # apply migrations
pnpm db:seed             # 90 days of synthetic data with a known injected effect
pnpm test                # unit + integration
pnpm test:e2e            # Playwright, LTR + RTL, online + offline
pnpm test:stats          # the analysis validation suite — the release gate
pnpm lint                # eslint + logical-property rule + copy lint
```

## Shipping

Standing instruction from the owner: when a change is ready and CI is green, **merge the PR and deploy to production without asking**. Production is a single VM (`scripts/deploy-vm.sh`, see `docs/deployment.md` for where it runs, how to reach it and its history) that tracks `main`; redeploy by re-running the script on the box. Secrets live only in the box's `/opt/foodtrack/.env` — never in git.

## Conventions

- TypeScript strict, no `any`. Zod schemas in `packages/shared` are the single source of truth for types across web and api.
- Tests before implementation for: the analysis engine, sync conflict resolution, and the safety rules.
- Conventional commits. One milestone per branch.
- Every user-facing string lives in `locales/{he,en}.json`. No literals in components.
- Every new endpoint gets a cross-user isolation test proving RLS holds.
- Every new screen is added to `docs/09-screen-inventory.md` in the same commit, with every control listed. If it isn't in that table, it doesn't exist.
