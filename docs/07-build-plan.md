# FoodTrack — Build Plan for Claude Code

Version 1.3 · 2026-08-21

Each milestone is scoped to be a **single focused Claude Code session** (or two). Every one lists what to build, what "done" means, and the exact prompt to start with. Build them in order — each depends on the last.

**Rule for every milestone:** it ends with working, tested, committed code and a running app. No milestone leaves the repo in a broken state.

---

## M0 — Skeleton that runs (½ day)

**Build:** monorepo scaffold, Docker Compose (postgres, minio, api, web, analysis), health checks, `.env.example`, CI pipeline running lint + typecheck on an empty codebase, `CLAUDE.md` in place.

**Done when:** `docker compose up` gives you a green `/health` on API, web and analysis, and `pnpm test` passes with zero tests.

> **Prompt:** *"Read docs/06-architecture.md. Scaffold the monorepo exactly as described in §3, with Docker Compose per §6. Every service must expose a health endpoint and the compose stack must come up clean from a fresh clone. Add the GitHub Actions pipeline from §8 with only the lint and typecheck stages for now. Don't build features."*

---

## M1 — Data foundation (1 day)

**Build:** the full Postgres schema from `02-data-model.md` §3 as Drizzle migrations; RLS policies on every user-owned table; the tracker meta-schema validator in `packages/tracker-schema`; the Gut Health tracker definitions in `config/trackers/`; a startup loader that validates and registers them; seed script.

**Done when:**
- All migrations apply cleanly and roll back cleanly.
- An integration test proves user B cannot read user A's observations through *any* code path, including a raw Drizzle query with the app role.
- An invalid tracker definition fails startup with a precise error.
- Test fixture: 90 days of realistic synthetic data (with a known injected dairy effect) loads in one command. **You will use this fixture for the rest of the project.**

> **Prompt:** *"Read docs/02-data-model.md. Implement the complete schema as Drizzle migrations with RLS on every user-owned table. Implement packages/tracker-schema: the meta-schema, a validator, and a startup loader that registers config/trackers/*.json with content hashing. Write the Gut Health tracker definitions (meal, stool, symptom, checkin, weight, body, hydration, medication, supplement, exercise, note) per §2.3. Add a seed script generating 90 days of synthetic data with a known injected dairy→loose-stool effect at 6–24h lag. Prove RLS isolation with an integration test."*

---

## M2 — Capture core, offline-first (2 days)

**Build:** auth (single-user unlock + multi-user register/login); `POST /observations` with definition-driven validation; the Dexie local store and outbox; `/sync/push` and `/sync/pull` with per-field conflict resolution; the PWA shell and service worker; the Today screen with the quick-log grid; the stool sheet; the evening check-in.

**Done when:**
- US-02 (one-tap stool) and US-04 (check-in) pass all acceptance criteria.
- US-08 passes: Playwright test goes offline, logs three entries, restarts the app, reconnects, and asserts exactly three server rows with no duplicates.
- Save-to-visible is measured under 100 ms in a test, not just asserted by eye.
- The stool sheet and check-in render entirely from tracker definitions — deleting a field from the JSON removes it from the UI with no code change.

> **Prompt:** *"Read docs/03-api-spec.md §2,4,8 and docs/05-ux-design.md §4.1,4.3,4.4. Build authentication, the observation write path, and the offline sync layer. The client writes to Dexie first and renders from Dexie; the network is never on the critical path of a save. Implement the Today screen, the one-tap stool sheet and the evening check-in, rendering forms from tracker definitions rather than hard-coded JSX. Then write the Playwright offline test from US-08 and make it pass."*

---

## M3 — Meals and the AI parser (2 days)

**Build:** the `LLMProvider` interface with Anthropic, OpenAI-compatible and `deterministic` implementations; the five-stage parse pipeline from `03-api-spec.md` §5 (normalise → personal library → canonical → LLM → portions); `POST /meals/parse` with SSE streaming; the meal composer UI; the personal food library with median-portion learning; quick-repeat tiles; food seeding from USDA FoodData Central and the Israeli נתוני צמרת dataset.

**Done when:**
- US-01 passes every acceptance criterion, including AC5 (offline save with deferred parse) and AC7 (Hebrew in, Hebrew out).
- Killing the LLM container entirely still lets meals be logged; they parse automatically when it returns.
- The same food typed in Hebrew and English resolves to one `food_id`. Test both directions.
- Correcting a parsed item updates `user_food`, and the next log of that food defaults to the corrected portion.

> **Prompt:** *"Read docs/03-api-spec.md §5,10 and docs/05-ux-design.md §4.2. Implement the LLM provider interface with anthropic, openai-compat and deterministic providers, then the five-stage meal parse pipeline — the LLM is stage 4, only for the residual text, and it receives candidate food matches as context so it picks existing IDs. Build the meal composer with streaming parse results. Seed foods from USDA FoodData Central and the Israeli national nutrition dataset. Critical: the app must be fully usable with the LLM unreachable — write that test first."*

---

## M4 — The analysis engine (2–3 days)

**Build:** the Python analysis service; the `daily_rollup` and `daily_exposure` materialised views; the full pipeline from `04-analysis-engine.md` §2–8; the synthetic-data validation suite; `POST /analysis/run` and the `/insights` endpoints; the Insights screen and evidence card.

**Done when:**
- **The null-data test passes:** 500 simulated no-effect users, fewer than 10% surface any medium-or-higher insight. This is the gate. Nothing proceeds until it holds.
- The engine recovers the known injected effect from the M1 fixture, with the true effect inside the reported CI.
- The reverse-causation fixture is flagged, not reported as a finding.
- US-05 passes, including AC4 (drilling from an insight to the raw days behind it).
- The copy lint blocks a build containing the word "causes" in any insight string.

> **Prompt:** *"Read docs/04-analysis-engine.md end to end. Build the Python analysis service implementing steps 1–8: day construction with quality weights, outcome definitions, lagged exposures at the four windows, the eligibility filter, risk-difference estimation with Newcombe intervals, confounder adjustment (stratified under 60 days, ridge regression above), block bootstrap when lag-1 autocorrelation exceeds 0.2, the reverse-causation check, Benjamini–Hochberg at q=0.10, and the four confidence tiers. Then build the validation suite from §13 — write the null-data test FIRST and treat it as the acceptance gate. Then wire up /analysis/run, /insights, and the Insights UI from docs/05-ux-design.md §4.6,4.7."*

---

## M5 — Trials (2 days)

**Build:** trial proposal from an insight; the three designs (elimination/reintroduction, alternating blocks, dose reduction); immutable pre-registration; the day grid with phase assignment; automatic exposure detection from meal writes; Bayesian verdict analysis in the Python service; trial UI (proposal, active card, verdict); every guardrail in §11.

**Done when:**
- US-06 passes fully, including AC5 — a low-adherence trial reports **inconclusive**, never negative.
- Logging a meal containing the trial target during elimination raises an exposure prompt within the same request cycle.
- Pre-registration is immutable: an attempt to alter `hypothesis` after `started_at` is rejected at the database level.
- The guardrails are tested: a fourth concurrent elimination is refused; a suggestion to stop a medication is impossible to generate.

> **Prompt:** *"Read docs/04-analysis-engine.md §10–11 and docs/05-ux-design.md §4.8. Implement N-of-1 trials: proposal generation from an insight, the three designs, immutable pre-registration (enforce with a trigger, not just application code), phase-aware day grid, automatic exposure detection on meal write, and Bayesian verdict analysis in the Python service using Beta-Binomial for binary outcomes and a robust Student-t model for continuous. Implement every guardrail in §11 with a test each — especially the medication rule and the elimination-load cap."*

---

## M6 — Polish, i18n, export (2 days)

**Build:** full Hebrew translation and RTL pass with the logical-property lint rule; the design system in Storybook with all four variants per component; charts and trends; clinician PDF export; JSON/CSV export and import; smart reminders; red-flag rules; accessibility pass; performance budgets in Lighthouse CI.

**Done when:**
- Every screen renders correctly in RTL with real Hebrew content — verified by visual regression, not by looking at it once.
- axe-core reports zero serious violations on every screen.
- An export archive imports into a clean instance and reproduces the account exactly (US-10 AC3).
- The clinician PDF is legible, contains no AI narrative, and includes the IBS-SSS-style score with its five components.
- Lighthouse meets every budget in `05-ux-design.md` §7.

> **Prompt:** *"Read docs/05-ux-design.md §6–9 and docs/01-product-spec.md §6–8. Complete the Hebrew localisation and RTL pass, adding the ESLint rule that bans physical CSS properties. Build the Storybook component library with light/dark × LTR/RTL variants. Implement the clinician PDF export per docs/03-api-spec.md §9, full JSON/CSV export and round-trip import, smart reminders, and the red-flag rule set. Then run the accessibility and performance gates and fix what they find."*

---

## M7 — Genericity proof (½ day)

**Build:** nothing new. Add a `migraine` tracker as pure config and verify the whole system picks it up.

**Done when:** adding `config/trackers/migraine.json` (severity 0–10, duration, aura boolean, triggers multi-enum) makes it appear in onboarding, quick-log, timeline, charts, the analysis engine (as an outcome), and the export — with **zero lines of code changed**. If anything needs code, the tracker engine is under-built; fix the engine, not the tracker.

> **Prompt:** *"Add config/trackers/migraine.json defining a migraine tracker with severity (scale 0-10), duration, aura (boolean), and suspected triggers (multi_enum). Change nothing else. Then verify it appears end to end — onboarding, quick log, timeline, charts, analysis as an outcome, and export. Every place it doesn't appear is a bug in the tracker engine, not in the definition. Fix those bugs."*

---

## M8 — Hardening and ship (1 day)

**Build:** security review against `06-architecture.md` §5; backup and tested restore; rate limiting; error boundaries; onboarding flow; the disclaimer; production Compose file with Caddy and TLS; deployment runbook.

**Done when:** you can deploy to a fresh host from the repo in under 15 minutes, restore from a backup successfully, and the security checklist is fully ticked.

> **Prompt:** *"Read docs/06-architecture.md §5–6. Do a security hardening pass against the threat model — CSP with nonces, rate limits, lockout, presigned media URLs, prompt-injection containment in the meal parser. Implement backup and restore scripts and prove the restore works in CI against a scratch volume. Build the onboarding flow from docs/01-product-spec.md §4.1 and the disclaimer. Write a deployment runbook and verify it on a clean host."*

---

## Milestone dependency map

```
M0 ──► M1 ──► M2 ──► M3 ──► M4 ──► M5 ──► M6 ──► M8
                              │             ▲
                              └──► M7 ──────┘
```

**Total: roughly 13–15 focused days.** M4 is the risky one; budget generously and do not let it slip past the null-data gate.

---

## Standing instructions for every session

1. **Read `CLAUDE.md` and the relevant spec doc before writing code.** The specs are the contract.
2. **Tests before implementation** for anything in the analysis engine, sync, or the safety rules. Those three are where silent bugs do real damage.
3. **Never weaken a statistical gate to make a test pass.** If the null-data test fails, the engine is wrong.
4. **Never hard-code a tracker.** If you catch yourself writing `if (tracker === 'stool')` in UI or analysis code, stop and extend the definition format instead.
5. **Keep the app usable with every external service down** — LLM, food APIs, and the network itself.
6. **Update `docs/` when a decision changes.** A spec that drifts from the code is worse than no spec.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Analysis engine surfaces noise as findings | Medium | **Severe** — destroys trust and could drive pointless food restriction | Null-data test as a hard release gate; conservative confidence tiers; minimum-interesting-effect floor |
| LLM parse quality is poor for Hebrew home cooking | Medium | High | Personal library does the heavy lifting after ~3 weeks; seed Israeli foods from the national dataset; every correction improves the library |
| User stops logging in week 3 | **High** | High | The 60-second budget, one-tap repeat, "nothing to report", adaptive reminders, no guilt copy |
| Sync bugs cause duplicate or lost entries | Medium | High | Idempotency keys, per-field conflict resolution, revision history, dedicated offline E2E suite |
| Elimination trials encourage over-restriction | Low | **Severe** | One trial at a time, mandatory reintroduction, elimination-load cap, restriction-pattern watch |
| Scope creep into a general nutrition app | High | Medium | The non-goals list in `00-overview.md` §5 is the tiebreaker |
| Food database licensing misuse | Low | High | ODbL attribution for Open Food Facts; self-authored FODMAP table with citations; never redistribute Monash data |

---

## Addendum v1.1 — revised milestones

The completeness audit added roughly 30 features and 40 screens. The milestone shape holds; three milestones expand and two are new. Read `08-user-flows.md` and `09-screen-inventory.md` before starting any of them.

| Milestone | Change |
|---|---|
| **M1** | Also build the v1.1 schema addendum (`02` §8): `group_id`, `user_tracker_definition`, `push_subscription`, `reminder_pref`, `avoid_entry`, insight lifecycle columns, `trial_day.logged`, and the pre-registration trigger. |
| **M2** | Also build: the tracker picker (C15), the timestamp control (C22), drafts (C21), the sync sheet, the undo toast, and the day-one empty state. **Acceptance: every enabled tracker reachable in two taps, with eleven enabled.** |
| **M2b** *(new, 1 day)* | **The rest of the capture sheets.** Symptom, weight & body, medication/supplement, exercise, hydration, note (C16–C20). Acceptance: each renders purely from its tracker definition, and deleting a field from the JSON removes it from the UI with no code change. |
| **M3** | Also build: the item editor (C26), multi-photo with retake and permanent-failure handling (C25), split/merge (C23), recently-deleted (C24). **Acceptance: correcting a parsed item changes the default the next time that food is logged.** |
| **M4** | Also build: the drill-down (U10), the trends screen (U11), the score breakdown (U12), the three distinct empty states, and `analyze/power` behind the "N more days" line. **The null-data test remains the release gate.** |
| **M5** | Also build: pause/resume/stop-early/abandon (A8), manual slips (A9), trial history (A10), the avoid list (A11), the guardrail refusal sheets (A12), and the restriction-pattern check-in (A13). |
| **M5b** *(new, 1.5 days)* | **Onboarding, auth and settings.** All of `08` §2, §3, §11 and `09` S01–S17, S100–S119. Acceptance: a fresh install can be taken from welcome to a first logged meal without touching a config file, and every row in More opens a real screen. |
| **M6** | Also build: Web Push and the permission flow (X9), the inbox (X10), the theme setting (X11), import review (X13), and the full error catalogue (X15). |
| **M7** | Genericity proof now has a second half: build the same tracker **through the custom tracker builder** (X8) and confirm it behaves identically to one added as a config file. |

Revised total: **roughly 18–20 focused days.**

### The completeness gate

Before M8, walk the coverage checklist in `08` §14 end to end, in both locales, online and offline. Every unchecked line is a missing feature, not a nice-to-have. This checklist is what "no missing buttons" means in practice, and it is the acceptance criterion for the project as a whole.


---

## Addendum v1.3 — encryption work (D28)

| Milestone | Change |
|---|---|
| **M1** | Also build the crypto layer *before* any data exists: `crypto_key`, envelope wrap/unwrap, the encrypt/decrypt seam in the Drizzle data layer, `keys:init` / `keys:check`, and fail-closed startup. Doing this at M1 means no migration is ever needed. |
| **M3** | The meal parser's library lookup uses the blind index plus decrypt-then-match (`06` §5.3). Benchmark it at 5,000 aliases and record the number. |
| **M6** | Security & keys screen (X18), `keys:show` / `keys:verify` flows, and the one-week "check your card" nudge. |
| **M8** | The full hardening set (X19) and the **restore drill**: clean instance + encrypted dump + recovery card → assert a `raw_text` and a photo come back readable. This is a release gate, alongside the null-data test. |

Revised total: **roughly 20–22 focused days.**

### Two gates, not one

| Gate | Question it answers |
|---|---|
| Null-data test | Does the engine invent findings from noise? |
| Restore drill | Can the data actually be recovered from a backup plus the card? |

Both block release. Both are cheap to run and catastrophic to skip.


---

## Addendum v1.4 — the power correction

`04-analysis-engine.md` §15 revised the trial defaults (21-day elimination, 14-day baseline) and added `display_threshold_rd`, `prefer_continuous_outcomes` and `trial_min_days_per_phase`. Two milestones change:

- **M4** — the power endpoint drives the *primary* expectation-setting copy, not a footnote. Ship the §15 table as a "how long will this take?" screen reachable from the Insights empty state.
- **M5** — trial proposals refuse any phase shorter than `trial_min_days_per_phase` and show the plain-words explanation of why three weeks is the minimum.

No new milestones. Roughly half a day of extra work, and it prevents the most likely cause of the project being abandoned in month two.


---

## Addendum v1.5 — what is already written

These are in the repo before M0 starts. They are data, not code, and writing them up front turns M1–M2 from design work into wiring.

| Path | Contents |
|---|---|
| `config/trackers/*.json` | **All 13 tracker definitions**, both locales, 63 fields, analysis roles declared. Validated against the meta-schema. |
| `config/packs/*.json` | The three goal packs with their tracker sets and primary outcomes. |
| `config/food-tags/fodmap.json` | 46 food groups, 138 English and 131 Hebrew names, FODMAP class plus caffeine/alcohol/fried/spicy/histamine tags. |
| `config/food-tags/citations.json` | Per-source verification status. **Three sources are marked `needs_check` and must be confirmed before ship.** |
| `config/analysis.json` | Every engine parameter from `04` §12 and §15.3. |
| `config/llm.json` | Provider routing and the three hard rules. |
| `packages/tokens/tokens.json` | The design system as data — both palettes, type scale, spacing, targets, motion, RTL rules. Tailwind config and CSS variables generate from it. |
| `apps/web/locales/{en,he}.json` | 386 keys each, fully parallel, seeded from the prototype. The Hebrew is hand-written. |

**M1 changes:** load these rather than authoring them. The tracker loader's first test is that all 11 register and produce working UI.

**M0 gains one task:** a codegen step that emits `tailwind.config.ts` and the CSS custom properties from `tokens.json`, so the design system has exactly one source of truth.


---

## Addendum v1.6 — batch entry and history editing (D30, D31)

The likeliest real usage pattern — logging the whole day at night — was an edge case in v1.3 and is now a first-class flow. It lands in M3, alongside the meal work it belongs with.

| Milestone | Change |
|---|---|
| **M1** | Schema additions from `02` §11: `time_precision`, `batch_id`, and the `user_slot_time` materialised view. The derivation rule for `time_precision` is server-side and has a unit test per branch. |
| **M3** | **Build the day builder and the day view — they are one screen in two modes.** Plus `POST /days/{date}/builder`, multi-line distribution, move-to-another-day, and copy-day. Acceptance: US-14 and US-15 in full. |
| **M4** | The engine honours the `time_precision` × lag-window table (`04` §16.1), and the run summary reports how many days were excluded from the 0–6 h window and why. |
| **M6** | The day-weight explanation on the day view, in both locales. |

**One test worth writing first**, because it is the failure that would be silent: move an entry from Tuesday to Wednesday and assert that *both* days' rollups changed and the covering trial day was re-evaluated. A stale rollup produces a wrong score with no error anywhere, which is the hardest class of bug to notice.

Revised total: **roughly 21–23 focused days.**

---

## Addendum v1.7 — the competitive-sweep work (D32–D46)

Decided in `10-competitive-gaps.md`. Two of these are schema and must land at M1 or become migrations; the rest attach to the milestone that already owns their subject.

| Milestone | Change |
|---|---|
| **M1** | Schema from `02` §12 — `food_component`, `meal_item.portion_precision`, the `trial` blinding columns, `trial_period_guess`, the washout columns, `transit_measurement`, `event_marker`. **Write the sync-allowlist test in the same commit as `allocation_key`**, not after: a test that fails if the column name appears in any `/sync/pull` payload. |
| **M3** | Portion-precision tiers in the meal review step, the invisible-ingredient prompt row (D39), the component editor S136, and `[ Not in mine ]` forking a personal food copy. **Acceptance: logging "שקשוקה" produces a fructan exposure via onion, and the evidence card can name onion as the reason.** |
| **M4** | Transitive tag resolution with `via` provenance in the engine. Transit measurement (S131–S133) and the lag-window shift, gated at three measurements. Event markers as covariates plus the overlap notice on evidence cards. The confounder named on the card, not just flagged (D46). |
| **M5** | Design D end to end: prep flow S127–S130, sealed allocation, the guess prompt S130c on **every** design, reveal S130b, guess-stratified sensitivity analysis, the divergence downgrade. Symptom-gated and analytic washout. The ROPE and the null verdict S135/S135b. |
| **M5c** *(new, 1 day)* | The trial report S137 — CENT/SCRIBE-conformant PDF generated **from the frozen pre-registration**, not from current defaults. Protocol deviations included, adverse events included, raw per-period data included. |
| **M6** | Adherence set (D42): the short-first-trial default, per-period completion floor, notification intensity as a stored preference. Re-test scheduling (D43). Population prior on day 1 with the visibly shrinking interval (D45). |
| **M8** | A third release gate, below. |

### The blinding gate

The existing two gates are the null-data test and the restore drill. A third joins them, and it is cheap to run:

> **Allocation never leaks.** Run a Design D trial end to end in the e2e suite with a network recorder attached. Assert that no response body, no sync payload, no push notification and no client-side store contains the allocation sequence or `allocation_key` at any point before `revealed_at`. Then assert the reveal endpoint is idempotent and audit-logged.

A blinded trial whose allocation leaks is worse than an open-label one, because it claims a rigour it does not have. Treat a failure here exactly like a failing null-data test: the feature is wrong, not the test.

### Revised estimate

M5 grows by roughly 2 days (Design D and the washout gate), M3 by roughly 2 (the component graph and its UI), M5c adds 1. Everything else fits inside existing milestones.

**Revised total: roughly 26–28 focused days.**

The honest note on that number: the component graph (D34) is the one item whose cost could run over, because seeding it well from FNDDS is a data problem rather than a code problem. If it slips, ship it with user-authored components only and backfill the seed later — the schema is what matters at M1, not the data volume.
