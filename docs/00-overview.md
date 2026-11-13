# FoodTrack — Project Overview & Decision Record

**Working title:** FoodTrack
**Type:** Installable PWA (web + mobile), self-hosted
**Owner:** Itay
**Status:** Specification v1.3 — complete flow and screen coverage, encryption decided, ready for implementation
**Date:** 2026-08-21

---

## 1. One-paragraph summary

FoodTrack is a self-hosted, installable web app that makes it take **under 60 seconds a day** to record what you ate, how your gut behaved, and how you felt — and then does the hard part for you: finding which foods are statistically associated with bad days, and helping you *prove or disprove* those suspicions with structured elimination-and-reintroduction trials. Under the hood it is not a food app at all; it is a **configurable tracker engine**, where "meal", "stool", "bloating" and "weight" are just tracker definitions loaded from config. Gut health is the first preset. Migraines, skin, sleep, or training load can be added later without touching the code.

---

## 2. The three problems this solves

| Problem | Why existing apps fail | FoodTrack's answer |
|---|---|---|
| **Logging is a chore, so people quit in week 2** | Most food apps demand grams, brands, and a database lookup per item | Free-text/voice → LLM parses it. One-tap repeat of favourites. Photo of the plate. Nightly 3-tap check-in. Zero mandatory fields. |
| **"What food is doing this to me?" is genuinely hard** | Effects are delayed 6–72h, confounded by stress, sleep, meds, and dose-dependent | A lagged association engine with explicit confidence tiers, confounder adjustment, and a hard rule: never claim causation from observational data |
| **Even a good correlation is not proof** | Apps stop at "you ate dairy on 4 bad days" | Guided **N-of-1 trials**: the app proposes a structured removal + blinded-ish reintroduction, tracks adherence, and returns a verdict with a Bayesian probability |

---

## 3. Decisions locked in this session

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Audience | **Personal-first, multi-user-ready** | Full user isolation, auth and row-level tenancy from day one. Runs as one user today; opening it up later needs no rewrite. |
| D2 | Platform | **PWA (Next.js), installable** | One codebase for phone + desktop, offline-capable, no app store. Native shell can wrap it later (D2a). |
| D2a | Native later | API and data model designed transport-agnostic | A future Expo/Capacitor shell reuses the same API verbatim. |
| D3 | Meal input | **Free-text + AI parsing**, **photo of plate**, **quick-repeat/favourites** | The three fastest paths. Barcode scanning is deferred to Phase 4 (see D3a). |
| D3a | Barcode | Deferred, not designed out | Schema and API already carry `barcode` and `external_food_ref` fields so it drops in later. |
| D4 | Hosting | **Self-hosted: Docker Compose, Postgres, pluggable LLM** | Health data stays under your control. LLM provider is an interface — Claude API today, a local model on your own hardware whenever you want. |
| D5 | Trackers | **Symptoms**, **energy/mood/sleep/stress**, **weight/body/hydration**, **meds/supplements/exercise** — all in scope | The last three groups are the confounders that make the food analysis trustworthy. Without them the correlations are noise. |
| D6 | Analysis depth | **Statistics + LLM narrative + guided elimination trials** | Observational engine generates *hypotheses*; N-of-1 trials generate *evidence*. |
| D7 | Genericity | **Config-driven tracker engine** | Tracker definitions are data (JSON Schema-ish), not code. Gut health ships as a preset pack. |
| D8 | Effort budget | **< 60 seconds/day** is a hard design constraint | Any flow that cannot be completed in the budget gets redesigned, not shipped. |

## 4. Decisions I made for you (flag if you disagree)

| # | Decision | Choice | Why |
|---|---|---|---|
| D9 | **Language** | **Hebrew and English, RTL-first architecture** | You work primarily in Hebrew and the food vocabulary that matters to you (חומוס, בורקס, לאפה, טחינה) is Hebrew. RTL is retrofitted badly and cheaply designed in. Every string is keyed from day one; logical CSS properties only. |
| D10 | **Timezone / "day" boundary** | User-configurable day rollover, default 04:00 local | A 01:00 snack belongs to yesterday. Getting this wrong corrupts every daily aggregate. |
| D11 | **Nutrition data source** | Open Food Facts (packaged, ODbL) + USDA FoodData Central (generic foods) + a **local food library** you build as you log | Neither covers Israeli home cooking well. The personal library is the real asset and it grows automatically. |
| D12 | **FODMAP data** | Ship a **small, self-authored, source-cited** FODMAP-class table; do **not** copy Monash data | Monash's dataset is licensed commercially and cannot be redistributed. A coarse high/moderate/low classification from published literature is legally clean and statistically sufficient. |
| D13 | **Clinical framing** | Wellness tool, not a medical device. No diagnoses. Red-flag detection that says "see a doctor". | Keeps you out of MDR/FDA scope and is the honest thing to do. |
| D27 | **What the passphrase protects** | Authentication only, not encryption. Forgetting it loses nothing — it resets from the server. | Corrects a v1.1 error that claimed the data was unrecoverable. Full end-to-end encryption is incompatible with a server-side analysis engine; see `06` §5.1 for the three levels and what each costs. |
| D28 | **At-rest encryption** | **L2 — selective field encryption**, envelope keys, with a printed recovery card kept off-box. Runs on a public-internet VPS, so the hardening set in `06` §5.5 is required, not optional. | Your call: best practice, but recoverable in every case. The narrative layer is encrypted; the numbers stay readable so the engine still works. |
| D14 | **Photos** | Stored on your own disk (S3-compatible/MinIO or plain volume), never sent to a third party unless you enable the cloud vision provider | Photo of your plate is also a photo of your kitchen. |
| D15–D26 | **Twelve questions v1.0 left open** — UI-created trackers, push delivery, the avoid list, backdating, early-stopped trials, insight lifecycle, mid-trial estimates, unintentional weight loss, export locale, theme setting, deletion grace period, logout with unsynced data | Resolved in `08-user-flows.md` §0 | Each one was blocking a flow; each has a schema, API and screen consequence. |

### Decisions from the competitive sweep (D32–D46)

Full reasoning and citations in `10-competitive-gaps.md`. These are decided, not proposed.

| # | Area | Decision | Priority |
|---|---|---|---|
| D32 | **Sham-controlled challenges** | A fourth trial design — **Design D, blinded challenge** — for targets with an isolated-compound form (lactose, fructose, GOS, fructan, mannitol, sorbitol). Mandatory inert control period; allocation key held server-side; self-filled opaque capsules or powders. Whole-food challenges stay open-label and are **labelled in-product as hypothesis-generating, not confirmatory**. | P0 |
| D33 | **Blinding-guess capture** | Every challenge period ends with "which do you think you got?". Break-blind rate is reported on the verdict card. Primary analysis by allocation, sensitivity analysis by guess; divergence is stated. Applies to open-label trials too, as an expectation-effect measure. | P0 |
| D34 | **Ingredient decomposition** | `food_component` edge table. Tags and nutrients resolve transitively. A meal template is one tap to log and N ingredient rows in the database. | P0 |
| D35 | **Portion precision** | `meal_item.portion_precision ∈ {weighed, measured, estimated, unspecified}`, parallel to `time_precision` (D31). Feeds the day-weight `w(d)`. `unspecified` is usable for presence/absence but excluded from dose-response. | P0 |
| D36 | **Measured personal transit time** | A `transit_marker` tracker (blue-dye method). The measured value shifts the user's lag windows; until it exists the population median (~28 h) is used and labelled as an assumption. | P0 |
| D37 | **Symptom-gated + analytic washout** | Washout = `max(3 days, days until outcome returns within δ of elimination baseline)`, capped at 10. Plus an analytic washout: the first `k` days of each period are dropped from the likelihood, `k` pre-registered. Both reported. | P0 |
| D38 | **The null verdict is a designed outcome** | A first-class "we found nothing" screen, and a pre-registered ROPE so the trial engine can positively conclude no meaningful effect rather than merely fail to reject. | P0 |
| D39 | Invisible-ingredient prompt | Oil, butter, sauce, condiments offered as one-tap adds on meal review. Fat is a primary gut trigger and invisible in a photo; a missing confounder poisons every association downstream. | P1 |
| D40 | Cumulative FODMAP load | Rolling per-subgroup load curve with a personal threshold learned from trial data. State in-app that the threshold is estimated, not looked up. | P1 |
| D41 | Event markers | Antibiotics, travel, illness, cycle phase — discrete shocks a daily correlation engine cannot see. | P1 |
| D42 | Adherence engineering | Short first trial (~2 weeks, more and shorter periods), per-period completion floor (≥1/3 of exposures), tuned notification intensity. | P1 |
| D43 | Re-test scheduling | Auto-schedule re-challenge of "fail" verdicts; the previous posterior becomes the next prior. Tolerance is not permanent. | P1 |
| D44 | CENT/SCRIBE-conformant trial report | One-click PDF: design, sequence actually completed, raw per-period data, deviations, adverse events, link to the frozen pre-registration. | P1 |
| D45 | Population prior on day 1 | Labelled as a prior, converging visibly to a personal posterior as the credible interval shrinks. Never presented as personalisation before it is. | P1 |
| D46 | Confounder surfaced, not just flagged | The insight card names the co-occurring exposure, so "dairy worsens bloating" can be distinguished from "dairy travels with alcohol". | P1 |


---

## 5. Non-goals (v1)

- Calorie-counting as the primary purpose. Nutrition is captured; weight-loss coaching is not the product.
- Social features, feeds, sharing, gamification streaks that punish you for missing a day.
- Medical diagnosis, prescription, or treatment advice.
- Recipe management / meal planning / grocery lists. (Hooks exist; not built.)
- Wearable integrations in v1. Apple Health / Google Fit import is Phase 4.
- Real-time collaboration or a caregiver/dietitian portal (Phase 5, designed for).
- **Continuous glucose monitoring.** Rejected on evidence, not scope — see `10` §5. Glucose tracks metabolic response, not stool quality. CSV import only, never required.
- **Microbiome, nutrigenetic or breath-hydrogen testing.** Accept an uploaded report; never become a lab, and never build around vendor hardware.
- **Supplement or probiotic recommendations.** A self-hosted app with nothing to sell is structurally more trustworthy than every commercial product in this category. Do not surrender that.
- Human coaching. The conformant trial report (D44) plus a referral surface is the cheap version.

---

## 6. Success criteria

FoodTrack v1 is successful if, after 8 weeks of your own use:

1. **Adherence:** ≥ 80% of days have at least one meal entry *and* one evening check-in, without you feeling nagged.
2. **Speed:** median time from app-open to meal-logged is **< 20 seconds**; median evening check-in **< 25 seconds**.
3. **Signal:** the engine surfaces at least one *testable* food hypothesis with ≥ medium confidence, and you can run a trial on it end to end.
4. **Trust:** every insight shows its evidence (n, effect size, confidence, confounders considered). You never have to wonder where a claim came from.
5. **Genericity:** adding a brand-new tracker (say, "headache 0–10") takes editing one config file and zero code.

---

## 7. Document map

| Doc | Contents |
|---|---|
| `00-overview.md` | This file. Charter, decisions, scope. |
| `01-product-spec.md` | Personas, feature set, user stories, flows, acceptance criteria. |
| `02-data-model.md` | Postgres schema, the tracker-definition format, the observation model. |
| `03-api-spec.md` | Endpoints, payloads, auth, offline sync protocol, LLM provider interface. |
| `04-analysis-engine.md` | Association analysis, confounders, confidence tiers, N-of-1 trial protocol. |
| `05-ux-design.md` | Design system, IA, screen-by-screen wireframes, states, RTL rules. |
| `06-architecture.md` | Stack, repo layout, deployment, security, testing. |
| `07-build-plan.md` | Milestone-by-milestone plan written to hand to Claude Code. |
| `08-user-flows.md` | Every flow, branch, error path and back button. Resolves D15–D31. |
| `09-screen-inventory.md` | Every screen and every control on it. The completeness checklist. |
| `10-competitive-gaps.md` | The competitive sweep and its verdicts. Resolves D32–D46. Read before proposing a "new" feature. |
| `CLAUDE.md` | Drop this at the repo root before the first Claude Code session. |

---

## 8. Source notes

- Open Food Facts API v3 — read access needs only a custom `User-Agent`; rate-limited to 15 req/min/IP for product reads and 10 req/min/IP for search; database under ODbL. <https://openfoodfacts.github.io/openfoodfacts-server/api/>
- USDA FoodData Central — requires a data.gov API key, 1,000 req/hour/IP, endpoints `/food/{fdcId}`, `/foods`, `/foods/list`, `/foods/search`; includes Foundation Foods, SR Legacy, FNDDS and Branded. <https://fdc.nal.usda.gov/api-guide>
- Israeli National Nutrition Database (צמרת) — published as downloadable datasets on data.gov.il, not a live API; useful for a one-time seed of Israeli foods. <https://data.gov.il/dataset/nutrition-database>
- IBS-SSS — five items (pain frequency, pain intensity, distension severity, bowel-habit dissatisfaction, life interference), 0–500 total; mild < 175, moderate 175–300, severe > 300. <https://bio-protocol.org/bio101/r9658697>
- N-of-1 trial methodology — blocked treatment assignment in pairs, washout vs. analytic carryover adjustment, autoregressive models for serial correlation, Bayesian posterior estimates preferred over p-values for a single participant. <https://effectivehealthcare.ahrq.gov/products/n-1-trials/research-2014-1>
- Monash FODMAP data is licensed commercially and is not redistributable. <https://www.monash.edu/monash-innovation/impact/licensing/low-fodmap>
