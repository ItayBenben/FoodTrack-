# FoodTrack — build log

## 2026-09-12 · M0 + M1 done (session: Cowork, Claude)

**Code lives in a git repo built in the session** — 2 commits (`feat(m0)`, `feat(m1)`), delivered as `foodtrack.bundle` (full history) + `foodtrack-m0-m1.zip`. GitHub push was not possible from the session (token is repo-scoped and no repo was linked). To push: `git clone foodtrack.bundle foodtrack && cd foodtrack && git remote add origin git@github.com:ItayBenben/foodtrack.git && git push -u origin main`.

### What is in the repo
- Monorepo: `apps/web` (Next 15 + Tailwind v4 from `packages/tokens`), `apps/api` (Fastify + Drizzle + crypto), `apps/analysis` (FastAPI, health only), `packages/{shared,tracker-schema,tokens,eslint-config}`, `config/`, `infra/` (compose, Caddy, postgres init), `.github/workflows/ci.yml`.
- `config/` authored from the specs (was NOT pre-written as addendum v1.5 assumed): 13 trackers / 62 fields, 3 packs, FODMAP table (49 groups) + citations (**all 6 `needs_check`**), `analysis.json`, `llm.json`, `tokens.json`, `locales/{en,he}.json` (841 keys each, parity-linted).
- M1: `0001_init` migration (all of 02 §3–§12) with RLS, triggers, matviews behind security-barrier views; envelope encryption (D28) with fail-closed boot and recovery card CLI; tracker registry with content hashes; observation write path; sync allowlist test; 90-day seed fixture with injected dairy effect (naive lagged RD +0.25 vs −0.05 control). 66 tests green; migration up→down→up proven.
- Verified live: `keys:init` → `db:migrate` → `db:seed` → API boots, `/health/ready` reports postgres+analysis ok; wrong/missing KEK → exit 1 with a named reason.

### Decisions taken where the spec was silent (full list in repo `docs/impl-notes.md`, I-01…I-17)
Notable: hand-written SQL migrations with down files (Drizzle Kit can't express RLS/triggers); matviews readable only through `my_*` scoped views; snapshots and change_log seal narrative fields too; `observation_value.value_enc` for encrypted text values; `def_hash` stored on observations; component depth measured across the whole chain; late free-time logging → `slot_estimate`.

### Environment notes
- Session had no Docker daemon: compose stack is linted (`pnpm compose:lint`) but **not booted**; tests ran on local Postgres 16 via a `uuidv7()` shim. CI uses `postgres:18-alpine`.
- `docs/` in the repo holds `README.md` + `impl-notes.md` only — **copy the spec files from this Project's `specs/` into `docs/`** (names listed in `docs/README.md`).

### Next
M2 (capture core, offline-first): auth unlock, `POST /observations` over `createObservation`, Dexie + outbox, `/sync/push|pull` (pull must `openNarrative` + `toSyncPayload` + `containsForbiddenKey`), PWA shell, Today, stool sheet, check-in, US-08 Playwright offline test.
