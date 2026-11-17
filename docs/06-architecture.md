# FoodTrack — Technical Architecture

Version 1.3 · 2026-08-21

---

## 1. Stack

| Layer | Choice | Why this one |
|---|---|---|
| Frontend | **Next.js 15 (App Router) + React 19, TypeScript strict** | One framework for PWA + API routes; RSC keeps the initial bundle small; excellent PWA story. |
| Styling | **Tailwind CSS v4** with logical-property preset + CSS custom properties from `tokens.json` | Logical properties are first-class in v4, which is exactly what D9 needs. |
| State | **TanStack Query** (server state) + **Zustand** (UI state) + **Dexie** (IndexedDB) | Query handles cache/retry; Dexie is the offline source of truth. No Redux. |
| Backend | **Fastify + TypeScript** (separate service, not Next API routes) | The analysis engine and job workers need a long-lived process; keeping the API separate makes that clean and lets a native client point at it directly. |
| DB | **PostgreSQL 18** + `pgvector` (future food similarity) | RLS gives real tenant isolation; materialised views serve the rollups; JSONB covers the EAV tail. |
| ORM | **Drizzle** | Typed SQL that doesn't hide the query. Analysis code needs raw SQL anyway; Drizzle doesn't fight it. |
| Jobs | **pg-boss** | Postgres-backed queue. One less service to run at this scale. |
| Analysis | **Python 3.12 service** (FastAPI) with numpy / scipy / statsmodels / arviz + PyMC | The statistics in `04-analysis-engine.md` (block bootstrap, penalised regression, Beta-Binomial posteriors) are a bad fit for TypeScript. Called over HTTP from the API. |
| Object store | **MinIO** (S3-compatible) | Photos on your own disk, S3 API for portability. |
| LLM | **Provider interface**, default Anthropic API, optional Ollama/vLLM | D4. `deterministic` fallback always present. |
| Auth | **Lucia-style sessions** or Auth.js with credentials + optional OIDC | Argon2id, refresh rotation, reuse detection. |
| Deploy | **Docker Compose**, Caddy for TLS | Single-box, one `docker compose up`. |
| Observability | Pino → Loki, Prometheus + Grafana, Sentry (self-hosted optional) | |

### Why a separate Python service

It is the one place a second language earns its keep. Bayesian posteriors, block bootstrap, and penalised regression are all one line each in Python and a week each in TypeScript. The interface is narrow (four endpoints), stateless, and reads the same Postgres — so it never becomes a distributed-systems problem.

```
POST /analyze/associations   { user_id, from, to, params }  → associations[]
POST /analyze/trial          { trial_id }                   → verdict
POST /analyze/power          { user_id, exposure, outcome }  → days needed
GET  /health
```

---

## 2. System diagram

```
                    ┌──────────────────────────────┐
                    │   PWA (Next.js, service      │
                    │   worker, IndexedDB outbox)  │
                    └──────────────┬───────────────┘
                                   │ HTTPS / SSE
                          ┌────────▼─────────┐
                          │      Caddy       │  TLS, HTTP/3
                          └────────┬─────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │   API (Fastify)              │
                    │   auth · observations · meals│
                    │   sync · trials · export     │
                    └───┬──────────┬───────────┬───┘
                        │          │           │
          ┌─────────────▼───┐  ┌───▼─────┐  ┌──▼──────────────┐
          │  PostgreSQL 18  │  │  MinIO  │  │ LLM provider    │
          │  + RLS + matviews│  │ photos  │  │ Anthropic/Ollama│
          └─────────▲───────┘  └─────────┘  └─────────────────┘
                    │
          ┌─────────┴────────┐        ┌─────────────────────┐
          │  Worker (pg-boss)│───────►│ Analysis (FastAPI)  │
          │  parse · analyse │        │ numpy/scipy/PyMC    │
          │  narrate · export│        └─────────────────────┘
          └──────────────────┘
```

---

## 3. Repository layout

Monorepo, pnpm workspaces + Turborepo.

```
foodtrack/
├─ CLAUDE.md                    ← read this first, every session
├─ docs/                        ← these specs, kept in the repo
├─ apps/
│  ├─ web/                      Next.js PWA
│  │  ├─ app/                   routes: (tabs)/today, timeline, insights, more
│  │  ├─ components/            design-system components
│  │  ├─ lib/db/                Dexie schema, outbox, sync client
│  │  ├─ lib/trackers/          renders forms from tracker definitions
│  │  ├─ locales/               he.json, en.json
│  │  └─ public/                manifest, icons, service worker
│  ├─ api/                      Fastify
│  │  ├─ src/routes/            one file per resource group
│  │  ├─ src/services/          meal-parsing, sync, trials, safety, export
│  │  ├─ src/llm/               provider interface + implementations
│  │  ├─ src/db/                drizzle schema, migrations, RLS helpers
│  │  └─ src/workers/           pg-boss handlers
│  └─ analysis/                 Python FastAPI
│     ├─ engine/                associations.py, trials.py, power.py, bootstrap.py
│     ├─ tests/                 synthetic-data validation suite
│     └─ pyproject.toml
├─ packages/
│  ├─ shared/                   TS types shared by web + api (zod schemas)
│  ├─ tracker-schema/           meta-schema + validator for definitions
│  └─ tokens/                   design tokens → tailwind + CSS vars
├─ config/
│  ├─ trackers/                 *.json  ← the tracker definitions
│  ├─ packs/                    gut-health.json, body.json, energy.json
│  ├─ food-tags/                fodmap.json + citations.json
│  └─ llm.json
├─ docker-compose.yml
├─ docker-compose.dev.yml
└─ .env.example
```

**Type flow:** `packages/shared` holds zod schemas; the API validates with them, the web app infers TS types from them, and the tracker meta-schema validates config at startup in both. One definition, three consumers, no drift.

---

## 4. Offline architecture

The hard part of this app, and the thing most likely to be got wrong. The rule:

> **IndexedDB is the source of truth for the UI. The server is the source of truth for history. They reconcile; neither blocks the other.**

**Write path**
```
user taps Save
  → write to Dexie (observations + outbox), synchronously
  → UI re-renders from Dexie                       [< 100 ms, always]
  → outbox drain runs (debounced 1 s, or on reconnect)
  → POST /sync/push
  → on success: mark outbox row done, update local revision
  → on 409 conflict: apply server field values, keep local in revision history, toast if user-visible
  → on network error / 5xx / 408 / 429: leave in outbox, exponential backoff (1s → 60s cap), survives restart;
    the sync sheet shows the last error under "retrying"; "Retry all now" skips the backoff wait
  → on any other 4xx for the request, or a mutation in `rejected`: mark it failed with the reason — never
    retry the same bytes forever. It stays on the device; "Retry failed" re-queues it
```

**Read path**
```
screen mounts
  → read Dexie immediately, render
  → TanStack Query fires GET /sync/pull?since=last_seq
  → apply changes to Dexie
  → UI updates reactively via Dexie live queries
```

**Service worker** (Workbox): app shell precached; API GETs stale-while-revalidate; API writes never cached (they go through the outbox, not the SW); photos cache-first with an LRU cap of 200 MB.

**Testing offline is mandatory, not optional.** Playwright suite with `context.setOffline(true)` covering: log while offline → restart the app → reconnect → assert it synced exactly once, with no duplicate.

---

## 5. Security

### Threat model (what actually matters for a self-hosted personal health app)

| Threat | Mitigation |
|---|---|
| Instance exposed to the internet, weak auth | Argon2id (m=64MB, t=3, p=4), rate limiting + lockout, mandatory strong passphrase at setup, optional TOTP 2FA |
| Cross-user data leak (once multi-user) | Postgres RLS on every user table; the app role is **never** superuser; an integration test asserts user B cannot read user A's rows through every endpoint. **The Python analysis service connects with the same non-superuser role and sets `app.user_id` per transaction** — it is not exempt from RLS just because it is internal. |
| Stolen device | Optional app passcode/biometric on resume; IndexedDB cleared on logout; short access-token lifetime |
| Photo leakage | MinIO not publicly exposed; all media served through presigned, short-lived, user-scoped URLs |
| Health data reaching a third-party LLM | Provider interface with an explicit `dataEgress` flag surfaced in the UI; stool/symptom/mood/weight data never sent to a remote model for parsing; narrative payloads are aggregated numbers only |
| XSS → data exfiltration | Strict CSP (no `unsafe-inline`, nonce-based), React escaping, DOMPurify on any user HTML, `HttpOnly` cookies |
| CSRF | SameSite=Strict cookies + origin check on state-changing requests |
| SQL injection | Parameterised queries only; the analysis service builds no SQL from user input |
| Prompt injection via meal text | Meal text is data, not instruction: it goes in a delimited block with a fixed system prompt; the parser output is schema-validated and any non-conforming response is discarded, never executed or echoed |
| Backup theft | Backups encrypted with age/gpg before leaving the host |
| Dependency compromise | Lockfiles, `pnpm audit` + `pip-audit` in CI, Dependabot, pinned base images by digest |

### 5.1 What the passphrase protects — and the stronger option

**Correction to an earlier draft of these specs.** Version 1.1 §3.1 of `08-user-flows.md` claimed that forgetting the passphrase destroyed the data. That was wrong, and it described an architecture this spec does not use.

In the specified design the passphrase is **authentication only** — Argon2id-hashed, compared at unlock. The database is ordinary Postgres. Anyone with shell access to the host can read every row, and a forgotten passphrase costs nothing but a CLI reset. That is the correct trade for this app, and it should be stated plainly rather than dressed up.

The reason it is the correct trade is not convenience — it is that **the analysis engine has to read the data**. `daily_rollup`, `daily_exposure`, the association queries and the Bayesian trial models all run SQL and numpy over the observation store, server-side, on a schedule, while the user's phone is asleep. Encrypt those values with a key only the client holds and the entire engine stops working. There is no version of this product where the server cannot read the numbers.

**Three levels are available. The middle one is a real option, not a compromise for its own sake.**

| | What it protects | What it costs |
|---|---|---|
| **L1 — as specified** | App access. Disk-level encryption covers a stolen laptop or a decommissioned drive. Backups encrypted with age/gpg cover a stolen backup. | Nothing. A `pg_dump` taken by someone with host access is readable. |
| **L2 — selective field encryption** | The *narrative* layer: meal free-text, notes, photos. Encrypted with a key in `.env` (or a KMS), decrypted by the API on read. A stolen dump reveals Bristol scores and severity numbers, not "went to my brother's, ate too much at the barbecue" or a photo of your kitchen. | Modest. Numeric fields stay in the clear so the engine keeps working. Loses SQL search over meal text — the personal-library lookup moves to a decrypt-then-match path, which is fine at personal scale. Key loss means those fields are gone, so the key needs a backup discipline. |
| **L3 — end-to-end encryption** | Everything, including from the server operator. | Very high. The analysis engine cannot run server-side at all; it would have to move into the client and run only while the app is open on a device holding the key. Trial evaluation, scheduled analysis, the clinician PDF and push-triggered insights all break. Forgetting the passphrase genuinely does destroy the data, and *then* a printed recovery key becomes mandatory. |

**Chosen: L2, with an escrowed key (D28).** The instance runs on a public-internet VPS, so a stolen dump or a compromised host is a real threat rather than a theoretical one, and the narrative layer is the part that would actually hurt. L3 is incompatible with what this product does; noting it here so nobody re-litigates it mid-build.


### 5.3 Field encryption — what, how, and how it is recovered (D28)

**Envelope encryption.** Two keys, deliberately:

```
KEK  (key encryption key)   32 bytes, from FOODTRACK_KEK in .env
  └─ wraps ─► DEK (data encryption key)  32 bytes, stored wrapped in the `crypto_key` table
                └─ encrypts ─► the sensitive columns and media objects
```

This split is what makes the key both rotatable and recoverable. Rotating the KEK re-wraps one small blob and takes milliseconds. The DEK — the thing that actually protects the data — never changes unless you deliberately rotate it, so a printed copy stays valid.

**Algorithm:** XChaCha20-Poly1305, random 24-byte nonce per value, with the AAD bound to `table || column || row_id`. That binding matters: without it, ciphertext could be copied from one row into another and would still decrypt. Media objects are encrypted with a per-object key, itself wrapped by the DEK, so a single photo can be deleted or shared without touching anything else.

**What is encrypted** — the narrative layer, the part that reads like a diary:

| Encrypted | Left in clear (the engine reads these) |
|---|---|
| `observation.note` | every numeric `observation_value` |
| `meal_item.raw_text` | timestamps, `local_day`, tracker keys |
| `user_food.alias` (+ blind index, below) | `food_id`, tags, nutrients |
| `user_profile.conditions_note` | Bristol scores, severities, weights |
| `trial.abandon_reason`, `trial_day.note` | trial phases, adherence, verdicts |
| `association.narrative` | effect sizes, intervals, q-values |
| all media objects (photos) | `media` metadata: size, mime, created_at |

**Be honest about what this leaks.** Someone holding a stolen dump still sees the *shape* of your life: that you logged a Bristol 7 on the 14th, a bloating 8/10 that evening, and your weight trend. They do not see "went to my brother's, ate too much at the barbecue", the photo of your kitchen, or the note you wrote about a bad week. That is the trade L2 makes, and the settings screen states it in exactly those terms rather than implying more.

**The searchability problem, and its answer.** The meal parser's fastest path is a trigram match against `user_food.alias` — which no longer works once the column is ciphertext. Two mechanisms replace it:

1. **Blind index** — `alias_bidx = HMAC-SHA256(index_key, normalize(alias))`, stored alongside. Gives exact and normalized-form matching in SQL, which covers most repeat logging.
2. **Decrypt-then-match** — for fuzzy matching, the user's alias set (a few thousand rows at most) is decrypted into a per-request in-memory index and matched there. At personal scale this is single-digit milliseconds and is not worth optimising further.

The `index_key` is derived from the DEK by HKDF, so it is covered by the same recovery card and rotates with it.

**Fail closed.** If `FOODTRACK_KEK` is missing, malformed, or does not unwrap the stored DEK, the API **refuses to start** and says so. It must never fall back to writing plaintext into encrypted columns — a half-encrypted table is worse than either state, and silent degradation here would be discovered months later.

### 5.4 Key lifecycle and the recovery card

```bash
pnpm keys:init        # first install. Generates KEK + DEK, writes KEK to .env,
                      # stores the wrapped DEK, prints the RECOVERY CARD once.
pnpm keys:show        # reprints the card. Requires the current KEK. Logged.
pnpm keys:verify      # paste a card back in; confirms it unwraps the live DEK.
pnpm keys:rotate-kek  # new KEK, re-wraps the DEK. Fast. Old cards stop working.
pnpm keys:rotate-dek  # new DEK, re-encrypts every row. Slow, resumable, backgrounded.
pnpm keys:check       # startup self-test: unwrap, encrypt, decrypt, compare.
```

The **recovery card** is a printable block containing the KEK, the wrapped DEK, the algorithm identifier, the creation date, and a checksum over all of it:

```
──── FoodTrack recovery card ─────────────────────────
 created  2026-08-21
 alg      xchacha20poly1305 / hkdf-sha256 / v1
 kek      base64:…
 dek(w)   base64:…
 check    7F3A-91C4-2E08
 Keep this off the machine that runs FoodTrack.
 Anyone holding this card and a database dump can
 read the encrypted fields.
──────────────────────────────────────────────────────
```

Two rules, both stated on the card itself: it must not live on the VPS, and it must not live in the same place as the backups. A recovery card stored next to the dump it protects is a decorative object.

**Verified restore is a release gate.** CI performs a full drill on every release: spin a clean instance, restore an encrypted `pg_dump` and the MinIO bucket, supply only the recovery card, and assert that a meal's `raw_text` and a photo both come back readable. An untested key-recovery path is not a recovery path, in exactly the way an untested backup is not a backup.

### 5.5 Public-internet VPS hardening

The instance is reachable from the internet, so these move from "nice" to "required":

| Area | Requirement |
|---|---|
| Exposure | Only Caddy publishes ports (80/443). Postgres, MinIO, the analysis service and the worker bind to the internal Docker network only, never to `0.0.0.0`. Verified by a compose lint in CI. |
| TLS | Caddy automatic certificates, HSTS with `preload`, TLS 1.3 minimum, OCSP stapling. |
| The reset endpoint | `/auth/reset-passphrase` is refused at the Caddy layer by path, **and** rejects any request whose source is outside the Docker network. Two independent controls, because one misconfigured route would otherwise expose it. |
| 2FA | TOTP is **strongly recommended** at setup rather than merely offered, and the setup screen says why: this instance is reachable by anyone who finds the domain. |
| Brute force | Per-IP rate limits at Caddy in front of the app's own per-account lockout. CrowdSec or fail2ban on the auth log. |
| SSH | Key-only, no password auth, no root login, non-default port, and ideally reachable only over Tailscale/WireGuard. |
| Updates | Unattended security upgrades on the host; base images pinned by digest and rebuilt on a schedule, not left to rot. |
| Information leakage | `/health` returns liveness only — no version, no dependency list. `/metrics` is bound to the internal network and never routed by Caddy. |
| Backups | Encrypted with age *in addition to* field encryption, and shipped somewhere that is not the same provider as the VPS. |
| Belt and braces | Optional but recommended: put the whole thing behind a Cloudflare Tunnel or expose it only on a Tailscale IP, so the origin has no public surface at all. The spec does not require it; the runbook explains it. |

### 5.2 Passphrase reset runbook

```bash
# on the host running FoodTrack
docker compose exec api pnpm reset-passphrase
# → prints a single-use URL, valid 15 minutes, bound to the local network
```

The endpoint is bound to the Docker network and refuses requests arriving through Caddy, so a reset cannot be triggered from the internet. It revokes all sessions and touches no data. `restore.sh` and this command are the two runbook entries that must be tested before the first real week of use — an untested recovery path is not a recovery path.

### Secrets
`.env` only, never committed. `.env.example` documents every variable. Required: `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY` (optional), `MINIO_*`, `ANALYSIS_URL`, `OFF_USER_AGENT`, `FDC_API_KEY`.

---

## 6. Deployment

`docker-compose.yml` services: `caddy`, `web`, `api`, `worker`, `analysis`, `postgres`, `minio`, (optional) `ollama`, (optional) `grafana` + `loki` + `prometheus`.

```yaml
# shape only — full file generated during M0
services:
  postgres:
    image: postgres:18-alpine
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck: { test: ["CMD-SHELL","pg_isready -U foodtrack"], interval: 10s }
  api:
    build: ./apps/api
    depends_on: { postgres: { condition: service_healthy } }
    environment: [DATABASE_URL, SESSION_SECRET, ANALYSIS_URL, MINIO_ENDPOINT]
  analysis:
    build: ./apps/analysis
    environment: [DATABASE_URL]
  worker:
    build: ./apps/api
    command: ["node","dist/workers/index.js"]
  web:
    build: ./apps/web
    environment: [NEXT_PUBLIC_API_URL]
  caddy:
    image: caddy:2-alpine
    ports: ["80:80","443:443"]
    volumes: [./Caddyfile:/etc/caddy/Caddyfile, caddydata:/data]
```

**Resource envelope:** comfortable on 2 vCPU / 4 GB RAM without a local LLM. Add 8–16 GB and a GPU if you run Ollama locally.

**Backups:** nightly `pg_dump` + MinIO sync to an encrypted off-box target; a `restore.sh` that is *actually tested* in CI against a scratch volume. An untested backup is not a backup.

**Migrations:** Drizzle Kit, forward-only, run automatically on API start behind an advisory lock so a multi-replica start can't race.

---

## 7. Testing strategy

| Level | Tool | Coverage target |
|---|---|---|
| Unit (TS) | Vitest | 80% on services; 100% on sync conflict resolution and day-boundary maths |
| Unit (Python) | pytest | 90% on the engine; the synthetic-data suite is a gate, not a nicety |
| Contract | zod schemas shared between API and client + generated OpenAPI; schemathesis fuzzes the API | every endpoint |
| Integration | Testcontainers Postgres, real RLS | every route, plus a cross-user isolation test per endpoint |
| E2E | Playwright, real Chromium | the 5 critical flows, in LTR **and** RTL, online **and** offline |
| Visual | Playwright screenshots per component × 4 (light/dark × LTR/RTL) | the design system |
| A11y | axe-core in Playwright | every screen, zero serious violations |
| Perf | Lighthouse CI against the §7 budgets in `05-ux-design.md` | blocks merge on regression |
| Copy | custom lint for banned causal/diagnostic phrases across locale files and LLM output | blocks merge |

**Statistical acceptance gate:** the null-data test (500 simulated no-effect users, < 10% surfacing any medium+ insight) runs in CI and blocks release. This is the test that keeps the app honest.

---

## 8. CI/CD

GitHub Actions: lint (ESLint + logical-property rule + copy lint) → typecheck → unit → integration (Testcontainers) → build → E2E (Playwright, LTR+RTL, online+offline) → a11y → Lighthouse → statistical gate → build and push images → deploy on tag.

---

## 9. Third-party data integration

| Source | Use | Constraints to respect |
|---|---|---|
| **Open Food Facts** | Packaged products, barcode lookup (Phase 4) | Read needs a custom `User-Agent` in the form `FoodTrack/1.0 (email)`. 15 req/min/IP for product reads, 10 req/min/IP for search — so **cache aggressively into the local `food` table and never call it on the request path**. Data is ODbL: attribute it, and share back any corrections. |
| **USDA FoodData Central** | Generic/whole foods and nutrients | data.gov API key required; 1,000 req/hour/IP. Seed Foundation Foods + SR Legacy offline into `food`/`food_nutrient` at build time rather than querying live. |
| **Israeli National Nutrition Database (צמרת)** | Israeli foods and local products | Distributed as downloadable datasets on data.gov.il, not a live API. One-time ETL into `food` with `source='tzameret'`. This is what makes Hebrew food logging actually work. |
| **FODMAP classification** | `food_tag` values | Do **not** copy Monash's dataset — it is commercially licensed. Ship a self-authored coarse high/moderate/low table with a citation key per row in `config/food-tags/citations.json`. Coarse is sufficient: the engine works at the tag level anyway. |

**Design rule:** the app must be fully functional with **zero** external food APIs reachable. Seeded data plus the LLM plus the user's own library covers everything; external sources are enrichment.

---

## 10. Configuration

| File | Purpose | Hot-reloadable |
|---|---|---|
| `config/trackers/*.json` | Tracker definitions | Yes, with content-hash versioning |
| `config/packs/*.json` | Goal packs | Yes |
| `config/food-tags/*.json` | FODMAP and other tags + citations | Yes |
| `config/llm.json` | Provider routing and fallback order | Restart |
| `config/analysis.json` | Engine parameters (`04-analysis-engine.md` §12) | Yes |
| `.env` | Secrets and connection strings | Restart |

Validation of every config file happens at startup; an invalid file fails the boot loudly with the exact path and reason rather than degrading quietly.

---

## 11. Non-functional requirements

- **Availability:** single-box, best-effort. A restart must never lose a queued mutation (they live in IndexedDB and pg-boss, both durable).
- **Durability:** no user write is acknowledged before it is committed to Postgres or to IndexedDB.
- **Scale envelope:** designed for 1–1,000 users on one box. ~2,000 observations/user/year keeps the whole dataset in memory-warm range for years.
- **Portability:** everything runs on any Docker host. No managed-cloud dependency anywhere.
- **Upgradability:** tracker definitions are versioned and observations record the version, so a definition change never corrupts historical analysis.
