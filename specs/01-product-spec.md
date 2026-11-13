# FoodTrack — Product Specification (PRD)

Version 1.3 · 2026-08-21

---

## 1. Product principles

These are the tie-breakers. When two designs are both defensible, the one that better serves the principle higher on this list wins.

1. **Logging must never feel like data entry.** Every mandatory field is a reason to quit. There are none.
2. **Never lie about certainty.** Every insight carries its sample size, effect size and confidence. "We don't know yet" is a valid, frequently-shown answer.
3. **The engine works for you while you sleep.** You put in scraps; the app does the structuring, the matching and the statistics.
4. **Missing a day costs nothing.** No streaks that shame. Gaps are handled by the statistics, not by guilt.
5. **Your data is yours.** Self-hosted, exportable in full, deletable in full, one click each.
6. **Everything is a tracker.** No feature may hard-code "stool" or "meal". If it can't be expressed as a tracker definition, the tracker engine is too weak — fix the engine.

---

## 2. Personas

### P1 — Itay (primary, "the investigator")
Technical, self-hosting, motivated by a specific question: *which foods wreck my gut?* Will tolerate a 10-minute setup for a system that pays off in month 2. Wants to see the maths, not just the verdict. Logs on the phone, analyses on the desktop. Hebrew for food names, comfortable in English for the UI either way.

**Jobs to be done:** capture without friction → get a shortlist of suspects → test them properly → change diet with confidence.

### P2 — "The advised patient" (secondary, drives multi-user readiness)
Told by a GI doctor or dietitian to "keep a food and symptom diary for six weeks". Not technical. Needs the app to be obvious with zero training, and needs an export that a clinician can actually read (a PDF, not a CSV).

### P3 — "The generic tracker user" (future, validates D7)
Doesn't care about food at all. Tracks migraines, sleep, mood, training load, or skin. Proves the tracker engine is real rather than decorative.

---

## 3. Feature set

Priority: **P0** = v1 must ship · **P1** = v1 should ship · **P2** = fast-follow · **P3** = later.

### 3.1 Capture

| ID | Feature | Pri | Notes |
|---|---|---|---|
| C1 | **Free-text meal entry with AI parsing** | P0 | "חומוס עם פיתה וסלט + קפה קר" → structured items, portions, tags. Dictation supported via the browser's speech API. |
| C2 | **Photo-of-plate logging** | P0 | Vision model returns candidate items + portion estimates; user confirms with one tap or edits. |
| C3 | **Quick-repeat / favourites** | P0 | Top 8 most-logged meals as one-tap tiles, time-of-day aware (breakfast tiles at 08:00). |
| C4 | **Personal food library** | P0 | Every confirmed item is saved with your usual portion. Second time you log it, it autocompletes. |
| C5 | **Stool log (Bristol 1–7 + attributes)** | P0 | Bristol type via illustrated picker, plus urgency, completeness, blood/mucus flags, colour, effort, pain-on-passing. |
| C6 | **Symptom log** | P0 | Bloating, gas, abdominal pain, reflux, nausea, urgency — 0–10 severity, optional duration and body-map location. |
| C7 | **Evening check-in** | P0 | One card, three taps: energy, mood, sleep quality. Optional stress. Under 25 seconds. |
| C8 | **Weight & body metrics** | P0 | Weight with trend smoothing (EWMA), optional waist, body fat, blood pressure. |
| C9 | **Hydration** | P1 | Tap-to-add cup/bottle. Deliberately coarse. |
| C10 | **Meds, supplements & exercise** | P0 | Scheduled or ad-hoc. Critical confounders: antibiotics, NSAIDs, probiotics, fibre, caffeine, alcohol. |
| C11 | **Backdating & quick-edit** | P0 | Log "yesterday lunch" without ceremony. Timeline scrub, long-press to edit. |
| C12 | **Offline capture** | P0 | Full write capability offline; queued and synced. Non-negotiable for a phone app. |
| C13 | **Barcode scan** | P3 | Deferred (D3a). Schema fields already present. |
| C14 | **Voice-only quick log** | P2 | Single mic button → transcript → parse → confirm card. |
| C33 | **Ingredient decomposition** | P0 | D34. A dish resolves to its components; tags and nutrients walk the graph. A template is one tap to log and N ingredient rows stored. `02` §12.1 |
| C34 | **Portion precision tier** | P0 | D35. Weighed / measured / estimated / unspecified, shown as Accurate / Approximate / Estimate. Feeds `w(d)`. `02` §12.2 |
| C35 | **Invisible-ingredient prompt** | P1 | D39. Oil, butter, sauce, condiments as one-tap adds on meal review. Fat is a primary trigger and a photo cannot see it. |
| C36 | **Event markers** | P1 | D41. Antibiotics, travel, illness, cycle, procedure. Enter analysis as covariates. `02` §12.6 |
| C37 | **Transit-time measurement** | P0 | D36. Optional blue-dye marker; three measurements shift the user's lag windows. Never required. `04` §4.1 |
| C38 | **Full-day paste** | P2 | D-none. Multi-line free text → one parsed entry per line, with the input line shown beside each result. Folds into the day builder. |

### 3.2 Understand

| ID | Feature | Pri | Notes |
|---|---|---|---|
| U1 | **Timeline view** | P0 | A single scrollable chronology of all events, day-grouped, with a symptom sparkline behind it. |
| U2 | **Daily score** | P1 | One 0–100 "gut day" score derived from stool normality + symptom load. Explainable on tap. |
| U3 | **Association engine** | P0 | Lagged food→outcome associations with confidence tiers. See `04-analysis-engine.md`. |
| U4 | **Suspect list** | P0 | Ranked list of candidate triggers: food/ingredient/FODMAP-class/nutrient, each with evidence card. |
| U5 | **Insight narrative (LLM)** | P0 | Plain-language explanation of a statistical finding, generated *from the numbers*, never inventing them. |
| U6 | **Trends & charts** | P1 | Weight trend, symptom load over time, Bristol distribution, fibre vs. stool quality. |
| U7 | **Pattern alerts** | P2 | "Your worst 5 days all followed < 6h sleep" — surfaced proactively, still evidence-backed. |
| U8 | **Clinician export (PDF)** | P1 | A clean 2-page summary: Bristol distribution, symptom trend, IBS-SSS-style score, food diary excerpt. |
| U9 | **Full data export / import** | P0 | JSON + CSV, complete, no lock-in. Import re-hydrates a full account. |

### 3.3 Act

| ID | Feature | Pri | Notes |
|---|---|---|---|
| A1 | **Guided elimination trial** | P0 | App proposes: remove X for N days, then reintroduce with a defined challenge dose. Tracks adherence. Delivers a verdict. |
| A2 | **Trial adherence tracking** | P0 | Automatically detects an accidental exposure from your food log and flags/reschedules. |
| A3 | **Reintroduction protocol** | P0 | Structured challenge over 3 days with escalating dose, per standard FODMAP reintroduction practice. |
| A4 | **Trial verdict card** | P0 | Effect size, posterior probability, adherence rate, and a plain recommendation. |
| A5 | **Red-flag safety detection** | P0 | Blood in stool, unintentional weight loss, persistent severe pain, fever → non-dismissible "see a doctor" card. Never diagnostic. |
| A6 | **Smart reminders** | P1 | Adaptive: nudges only when a usual log is missing, silent when you're already logging. Quiet hours enforced. |
| A7 | **Goal packs** | P2 | Curated tracker bundles + framing: "Gut health", "Weight", "Energy". Built on the same engine. |

### 3.4 Platform

| ID | Feature | Pri | Notes |
|---|---|---|---|
| X1 | **Config-driven tracker engine** | P0 | New tracker = new definition file. Renders its own UI, storage, validation and charts. |
| X2 | **Multi-user with hard isolation** | P0 | Row-level security by `user_id`; no cross-user query path exists. |
| X3 | **i18n: Hebrew + English, full RTL** | P0 | Locale switch, logical CSS, Hebrew food vocabulary in the parser prompt. |
| X4 | **PWA install + offline shell** | P0 | Service worker, app manifest, home-screen install, offline-first cache. |
| X5 | **Pluggable LLM provider** | P0 | `LLMProvider` interface: Anthropic API, OpenAI-compatible endpoint, or local (Ollama/vLLM). |
| X6 | **Accessibility AA** | P1 | Keyboard-complete, screen-reader labelled, 4.5:1 contrast, respects reduced-motion. |
| X7 | **Audit log** | P2 | Every AI-generated field records which model/prompt version produced it. Reproducibility. |

---

## 4. Core user flows

### 4.1 First run (target: 4 minutes, skippable at every step)

```
Welcome  →  What do you want to figure out?
             ▸ "Which foods upset my gut"  (loads Gut Health pack)
             ▸ "Track weight and eating"   (loads Body pack)
             ▸ "Something else"            (tracker picker)
         →  Pick your trackers (pre-ticked by pack, all toggleable)
         →  Baseline: sex/age band, height, current weight  [all skippable]
         →  Day rollover time (default 04:00) + timezone
         →  Reminder windows (or "don't remind me")
         →  Language: עברית / English
         →  Install prompt (PWA)  →  Home
```

**Rule:** no account creation wall in single-user mode; a passphrase is set at first launch and that is the whole of auth. Multi-user mode adds email+password or OIDC.

### 4.2 Logging a meal by text (target: 15 seconds)

```
Home → big [+] → "Meal"
  ↓
Text field is already focused, keyboard already up. Mic button beside it.
User types/dictates:  "פיתה עם חומוס, סלט ירקות, קפה הפוך"
  ↓ (parse happens as they type, debounced; result streams in below)
Parsed card appears:
    🫓 פיתה             1 unit     ▾
    🥣 חומוס            3 tbsp     ▾
    🥗 סלט ירקות        1 bowl     ▾
    ☕ קפה הפוך         1 cup      ▾
  Time: 13:05 ▾    Tags: [lunch] [home]
  ↓
[Save] — one tap. Done.
```

**Failure paths:**
- Parser offline / LLM unavailable → the raw text is saved verbatim as an `unparsed_meal`, queued, and parsed automatically when connectivity returns. **The user is never blocked.**
- Parser unsure about an item → that row shows a dotted underline and a "?" chip; still saves; contributes to analysis with lower weight.
- Ambiguous portion → defaults to the user's historical median portion for that food, or the food's standard serving.

### 4.3 Logging a meal by photo (target: 12 seconds)

```
Home → [+] → camera icon → shoot (or pick from gallery)
  ↓ image stored locally first, upload queued
Vision model returns candidates with confidence:
    ✓ Grilled chicken breast   ~150g   (high)
    ✓ White rice               ~1 cup  (high)
    ? Tahini sauce             ~2 tbsp (low)   ← dotted, tap to confirm
  ↓
[Looks right] → saved.   [Add note] → free text appended and re-parsed together.
```

### 4.4 Logging stool (target: 8 seconds — this must be the fastest flow in the app)

```
Home → [💩] shortcut (present on home, not buried)
  ↓
Bristol picker: 7 illustrated tiles, current-time preselected.
Tap a tile → SAVED IMMEDIATELY. The sheet stays open for 3 seconds
offering optional extras, then auto-dismisses:
      Urgency  ○○●○○      Complete? ▢     Pain ▢     Blood ▢     Mucus ▢
```

**Rationale:** the single most important datapoint in the whole system must cost one tap. Everything else is optional enrichment.

### 4.5 Evening check-in (target: 25 seconds)

Delivered as a notification at the user's chosen time, or as a card at the top of Home after that time.

```
"How was today?"
  Energy   😴 ─────●───── ⚡      (5-point, tap not drag)
  Mood     ☹️ ─────●───── 🙂
  Sleep    last night:  6h 30m ▾   quality ●●●○○
  Stress   ●●○○○                    [optional, collapsed by default]
[Done]  ·  [Nothing to report]  ← second button logs "no symptoms", which is
                                    real data, not an absence of data
```

**Design note:** "Nothing to report" is critical. A day with no entries is ambiguous (nothing happened, or you forgot?). An explicit "all fine" turns a missing row into a strong negative observation, which roughly doubles the statistical power of the association engine.

### 4.6 From suspicion to proof

```
Insights tab
  ↓
Suspect list:
   ① Dairy (lactose)        ●●●○○ medium   n=41 exposures, 12 bad-day follow-ups
   ② Onion / garlic (fructan) ●●○○○ low     n=63, effect small
   ③ Large late meals       ●●●●○ high     n=28
  ↓ tap ①
Evidence card:
   • On days you ate dairy, next-day Bristol ≥6 occurred 44% of the time
     vs 19% on dairy-free days.
   • Risk difference +25pp (95% CI +9 to +41pp), n=41 vs n=57 days.
   • Adjusted for: sleep <6h, alcohol, high stress, NSAIDs. Effect held.
   • Confounder warning: 8 of your 12 dairy days were also weekend days.
   • Confidence: MEDIUM — enough to test, not enough to conclude.
  ↓
[ Test this properly → ]
   Proposed trial: remove all dairy for 14 days,
   then reintroduce over 3 days (¼ cup → ½ cup → 1 cup milk).
   Estimated: 17 days. Power: adequate if you keep logging ≥5 days/week.
   [ Start trial ]   [ Adjust ]   [ Not now ]
```

---

## 5. User stories with acceptance criteria

Written in a form Claude Code can turn directly into tests.

### US-01 — Fast text meal log
> As a user, I want to type what I ate in my own words and have it structured for me, so logging costs seconds.

- **AC1** Given the meal composer is open, the text input is focused and the keyboard/IME is active without an extra tap.
- **AC2** Given I type ≥ 3 characters and pause 600 ms, parsing starts automatically.
- **AC3** Given the parser returns items, each row shows name, quantity, unit, and a confidence indicator, and every field is editable inline.
- **AC4** Given I tap Save, the entry persists locally within 100 ms and appears in the timeline **before** any network call completes.
- **AC5** Given the device is offline, Save still succeeds and the entry is marked `pending_parse`; it parses automatically on reconnect.
- **AC6** Given the same food was logged before, the default quantity equals my median historical quantity for that food.
- **AC7** Hebrew input produces Hebrew item names; the display direction follows the item's own script, not the app locale.

### US-02 — One-tap stool log
> As a user, I want to record a bowel movement in one tap.

- **AC1** A stool shortcut is reachable from Home in exactly one tap.
- **AC2** Tapping a Bristol tile persists the record immediately; no confirm step exists.
- **AC3** Timestamp defaults to now and is editable via a single control.
- **AC4** The optional-attributes sheet auto-dismisses after 3 s of inactivity without discarding the saved record.
- **AC5** Selecting the blood flag triggers the red-flag rule (US-09) but does not block saving.

### US-03 — Photo meal log
- **AC1** The captured image is written to local storage before any upload attempt.
- **AC2** Items below the confidence threshold render visually distinct and require confirmation before contributing full weight to analysis.
- **AC3** If vision inference fails, the photo is still saved as a meal with no items and can be parsed later or annotated by text.
- **AC4** Images are stored on the configured object store; no image is transmitted to any provider unless the vision provider is explicitly enabled in settings.

### US-04 — Evening check-in
- **AC1** The check-in card appears on Home after the configured time, and only if the day lacks a check-in.
- **AC2** "Nothing to report" writes an explicit `all_clear` observation for the day, not an empty record.
- **AC3** The card can be dismissed for the day and does not reappear until tomorrow.
- **AC4** Completing the check-in takes at most 4 taps in the default configuration.

### US-05 — Association insight
- **AC1** No association is displayed with fewer than the configured minimum exposure days (default 10) and minimum outcome events (default 5).
- **AC2** Every displayed association shows: exposure n, comparison n, effect size with a 95% interval, confidence tier, and the list of adjusted confounders.
- **AC3** No user-visible copy asserts causation. Copy is linted against a forbidden-phrase list at build time (`causes`, `is causing`, `proven to`, `because of`).
- **AC4** Tapping an association reveals the underlying days, so the user can audit any claim against raw entries.

### US-06 — Elimination trial
- **AC1** A trial can be started only from an association or from manual selection of a food/class.
- **AC2** The trial defines: target, elimination window, reintroduction schedule, primary outcome, minimum adherence.
- **AC3** During elimination, any logged meal containing the target raises an exposure event and offers "extend the window" or "log as a slip".
- **AC4** At completion the verdict card shows: pre/post effect size, posterior probability that the effect exceeds the pre-registered threshold, adherence %, and a limitations note.
- **AC5** Trials with adherence below the minimum are reported as **inconclusive**, never as negative.

### US-07 — Config-driven tracker
- **AC1** Adding a valid tracker definition file and restarting makes the tracker appear in onboarding, logging, timeline, charts and export with no code change.
- **AC2** An invalid definition fails validation at startup with a precise error and does not partially register.
- **AC3** Every field type in the type catalogue (`scale`, `enum`, `multi_enum`, `number`, `duration`, `text`, `boolean`, `photo`, `time`, `body_map`) has a working renderer, validator and aggregation rule.

### US-08 — Offline-first
- **AC1** With the network disabled, the app opens from the home screen, shows cached data, and accepts all write operations.
- **AC2** Queued mutations survive an app restart.
- **AC3** On reconnect, mutations replay in causal order; conflicts resolve last-write-wins per field with the loser retained in a revision history.
- **AC4** The user can see a sync status indicator and a count of pending items.

### US-09 — Red-flag safety
- **AC1** The rule set (blood, black/tarry stool, unintentional weight loss ≥ 5% in 3 months, persistent nocturnal pain, fever with GI symptoms, new symptoms over age 50, inability to keep fluids down) evaluates on every write.
- **AC2** A triggered flag shows a persistent, dismissible-once-per-week card recommending medical review.
- **AC3** The card never names a condition, never estimates a probability of disease, and never suggests treatment.
- **AC4** Red-flag events are included in the clinician export.

### US-10 — Data ownership
- **AC1** "Export everything" produces a single archive containing JSON for every table scoped to the user, plus all photos, within one request.
- **AC2** "Delete my account" removes all rows and objects irreversibly after a typed confirmation, and completes within 60 seconds.
- **AC3** An exported archive can be imported into a fresh instance and reproduce the account state exactly.

---

## 6. Notifications & reminders

| Trigger | Timing | Rule |
|---|---|---|
| Meal not logged | 90 min after a usual meal window | Only if that window is normally logged ≥ 60% of the time. Max 2/day. |
| Evening check-in | User-set time (default 21:30) | Suppressed if already completed. |
| Trial daily prompt | Once/day during an active trial | Higher priority; the trial is the user's own commitment. |
| Weekly insight | Sunday morning (configurable) | "Here's what changed this week" — only sent when something actually changed. |
| Red flag | Immediate | In-app only, never a push notification (privacy on lock screen). |

**Hard rules:** absolute quiet hours; a global "pause all reminders" toggle; a "you've missed 5 days, want to pause?" offer instead of escalation; no streaks, no badges, no guilt copy.

---

## 7. Privacy, safety, compliance

- **Data classification:** everything in this app is special-category health data. Treat accordingly even in single-user mode.
- **Encryption:** TLS in transit; Postgres volume encrypted at rest at the disk level; photo store encrypted at rest; secrets in env, never in the repo.
- **What the passphrase is:** an authentication credential (Argon2id), **not** an encryption key. It stops someone opening the app; it does not make a stolen database dump unreadable, and forgetting it loses nothing — it is resettable from the server. The app says this plainly at setup rather than implying a protection it does not provide. See `06` §5.1 for the stronger option and what it costs.
- **LLM boundary:** a per-provider `data_egress` flag. If the configured provider is remote, settings must clearly state what leaves the device (meal text; images only if vision is enabled) and offer a local-model alternative. Never send stool, symptom, mood or weight data to a remote LLM for parsing — only for the narrative step, and there only in **aggregated, de-identified numeric form**.
- **Retention:** user-configurable; default keep forever, with per-record delete and a bulk "delete data older than N months".
- **Regulatory posture:** wellness tool. No diagnosis, no treatment recommendation, no dosing. Onboarding shows a plain-language disclaimer. Red-flag detection points to a clinician and stops there.
- **Copy linting:** a build-time check bans causal and diagnostic phrasing in user-facing strings (see US-05 AC3).

---

## 8. Internationalisation & RTL

- Locales: `he-IL` (default for this user), `en-US`. Architecture supports adding more without refactoring.
- **RTL is structural, not a theme.** Use logical CSS properties exclusively (`margin-inline-start`, not `margin-left`). No `left`/`right` in the codebase outside a documented allowlist; enforced by lint.
- Mixed-direction text: an item's rendered direction is inferred from its own content (`dir="auto"`), so "Coca-Cola 330ml" inside a Hebrew list renders correctly.
- Numerals: Western Arabic digits in both locales; user-selectable date format; 24-hour clock default for `he-IL`.
- **The food parser prompt is locale-aware** and carries a seeded Israeli food vocabulary (חומוס, טחינה, לאפה, בורקס, שקשוקה, פלאפל, סביח, מלאווח, קוסקוס…) with canonical English mappings, so the same physical food maps to one canonical food ID regardless of the language you typed it in. This matters enormously for the analysis: if "hummus" and "חומוס" are two different foods, every correlation is halved.

---

## 9. Out-of-scope reminders

Restating so scope creep is visible: no social, no gamified streaks, no recipes, no meal planning, no wearables in v1, no clinician portal in v1, no barcode in v1, no medical claims ever.

---

## 10. Addendum v1.1 — features the audit found missing

Each row below was implied somewhere in v1.0 but had no feature ID, no flow and no owner. They are now first-class. Flows are in `08-user-flows.md`; screens in `09-screen-inventory.md`.

| ID | Feature | Pri | Flow |
|---|---|---|---|
| C15 | Tracker picker — the guaranteed path to every enabled tracker | P0 | `08` §4.1 |
| C16 | Symptom sheet (multi-symptom in one pass, incl. fever and fluids) | P0 | `08` §4.8 |
| C17 | Weight & body sheet | P0 | `08` §4.10 |
| C18 | Medication & supplement logging with a confounder class | P0 | `08` §4.12 |
| C19 | Exercise logging | P1 | `08` §4.13 |
| C20 | Standalone note | P1 | `08` §4.14 |
| C21 | Drafts — nothing typed is ever silently lost | P0 | `08` §1.3 |
| C22 | Date+time on every capture screen (backdating) | P0 | `08` §1.4 |
| C23 | Split and merge meals | P1 | `08` §5.4 |
| C24 | Recently deleted, 30-day restore | P0 | `08` §5.2 |
| C25 | Multiple photos per meal, with retake and permanent-failure handling | P1 | `08` §4.4 |
| C26 | Item editor — correct a parse, teach the library | P0 | `08` §4.3 |
| C27 | **Clarify step** — an entry with no food in it asks once, offering three foods from your own history | P0 | `08` §4.3b |
| C28 | **Day builder** — log a whole day's meals in one pass, times prefilled from your own slot medians | P0 | `08` §4.15 |
| C29 | **Day view** — open any past day and edit, fill or delete everything from one screen | P0 | `08` §5.1b |
| C30 | Multi-line paste distributed across slots | P1 | `08` §4.15 |
| C31 | Move an entry to another day · copy a day to another date | P1 | `08` §5.1b |
| C32 | `time_precision` — estimated times marked and handled honestly by the engine | P0 | `04` §16 |
| U10 | Insight drill-down to the days behind a claim | P0 | `08` §8.5 |
| U11 | Trends screen (six charts) | P1 | `08` §8.6 |
| U12 | Score breakdown | P1 | `08` §8.7 |
| U13 | Data completeness view | P2 | `08` §8.6 |
| A8 | Trial pause / resume / stop early / abandon | P0 | `08` §9.1 |
| A9 | Manual slip logging | P0 | `08` §9.3 |
| A10 | Trial history | P1 | `08` §9.6 |
| A11 | Avoid list | P1 | `08` §9.7 |
| A12 | Guardrail refusal screens | P0 | `08` §9.5 |
| A13 | Restriction-pattern check-in | P1 | `08` §9.5 |
| X8 | Custom tracker builder | P1 | `08` §11.1 |
| X9 | Web Push delivery + permission flow | P0 | `08` §12 |
| X10 | In-app inbox | P1 | `08` §12.4 |
| X11 | Theme setting | P1 | `08` §11 |
| X12 | Account screen: change passphrase, sessions, 2FA, logout | P0 | `08` §3 |
| X13 | Import with dry-run review | P1 | `08` §11.3 |
| X14 | Retention policy | P2 | `09` S112 |
| X15 | Error catalogue — every error has defined copy and recovery | P0 | `08` §13 |
| X16 | Field encryption of the narrative layer, envelope keys | P0 | `06` §5.3 |
| X17 | Recovery card: generate, show, verify, rotate | P0 | `06` §5.4, `08` §11.3b |
| X18 | Security & keys screen | P1 | `09` S118b–d |
| X19 | Public-VPS hardening set | P0 | `06` §5.5 |
| X20 | Design D — blinded challenge, inert control, server-held allocation | P0 | D32, `04` §10.6 |
| X21 | Blinding-guess capture + guess-stratified sensitivity analysis | P0 | D33, `04` §10.6 |
| X22 | Symptom-gated washout + analytic washout | P0 | D37, `04` §10.7 |
| X23 | Null verdict — ROPE, and the designed "we found nothing" screen | P0 | D38, `04` §10.8 |
| X24 | Cumulative FODMAP load curve with a learned personal threshold | P1 | D40 |
| X25 | Adherence set — short first trial, per-period completion floor | P1 | D42 |
| X26 | Re-test scheduling; previous posterior becomes the next prior | P1 | D43 |
| X27 | CENT/SCRIBE-conformant trial report (PDF) | P1 | D44 |
| X28 | Population prior on day 1, labelled, converging to a posterior | P1 | D45 |
| X29 | Confounder named on the insight card, not just flagged | P1 | D46 |
| X30 | Adaptive scope narrowing as the hypothesis space collapses | P2 | `10` §4 |
| X31 | MCP server over the personal dataset | P2 | `10` §4 |

### 10.1 Two user stories added

**US-11 — Nothing typed is lost.**
- AC1 Dismissing the meal composer, symptom sheet or note with content preserves a draft and shows `Draft kept · Undo`.
- AC2 Drafts survive an app restart and appear at the top of Today.
- AC3 A session expiring mid-composer preserves the content and restores it after unlock.
- AC4 No screen discards user input without either preserving it or asking.

**US-14 — I can log a whole day at night in under 90 seconds.**
- AC1 The day builder shows one field per meal slot, each with a time prefilled from my own median for that slot, marked `~`.
- AC2 Typing in three fields and tapping Save creates three separate observations with three distinct timestamps, in one transaction, under one `batch_id`.
- AC3 Undo after a day-builder save removes all of it.
- AC4 A slot that already has a meal shows it, editable in place, and saving does not duplicate it.
- AC5 Emptying a slot that had a meal deletes that meal, within the same batch and the same undo.
- AC6 Pasting four lines distributes them across slots and shows the proposed assignment **before** anything is created.
- AC7 Saving does not wait on parsing; the entries appear immediately and fill in as each slot parses.
- AC8 A meal saved this way has `time_precision = 'slot_estimate'` and is absent from the 0–6 h lag analysis. Tapping the time and setting it by hand promotes it to `exact`.

**US-15 — I can repair a past day from one screen.**
- AC1 Tapping a day header in the timeline opens that day with everything on it, editable in place.
- AC2 Every row can be edited, duplicated, re-timed, moved to another day, or deleted without leaving the screen.
- AC3 Moving an entry across days recomputes both days' rollups and any covering trial day.
- AC4 The day shows its `w(d)` in plain words and says what would improve it.
- AC5 Edits autosave; there is no Save button on a day that already exists.

**US-13 — A meal entry with no food in it does not silently become data.**
- AC1 A parse returning zero items shows the clarify step; a parse returning ≥1 confident item does not.
- AC2 The three options are drawn from the user's own logged history in a ±90-minute window and are labelled with their frequency. **A test asserts no model call occurs on this path.**
- AC3 With fewer than 3 qualifying foods in history, no options are shown — a detail-level hint appears instead, and the hint contains no specific food names.
- AC4 `Something else` returns focus to the text field with the original text intact.
- AC5 `I really don't remember` saves the observation with `specificity = 'unspecified'`, shows the one-line consequence, and never appears again for that entry.
- AC6 An `unspecified` meal counts toward logging adherence and day coverage, and is absent from `daily_exposure`.

**US-12 — Every tracker is reachable in two taps.**
- AC1 From Today, any enabled tracker can be opened in at most two taps.
- AC2 Enabling an eleventh tracker does not make any other tracker unreachable.
- AC3 A user-created tracker (X8) is reachable by exactly the same path as a shipped one.

### 10.2 Notification copy is specified, not improvised

`08` §12.3 fixes the title and body for every push, in both locales. Two hard rules: no notification body names a symptom, a food, or a finding; and red flags are **never** pushed — they wait in the app (`08` §12.4), because a lock-screen preview is the wrong place for that sentence.
