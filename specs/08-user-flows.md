# FoodTrack — Complete User Flow Logic

Version 1.3 · 2026-08-21

This document exists because docs 01–07 describe *what* the app does and *how it looks*, but left the connective tissue implicit. This is the connective tissue: every entry point, every branch, every failure path, every back button. If a behaviour is not in this document or in `09-screen-inventory.md`, it is not specified and must not be invented during implementation — raise it instead.

**Companion:** `09-screen-inventory.md` lists every screen and every control on it. This document is the verbs; that one is the nouns.

---

## 0. Decisions this document resolves

The completeness audit surfaced twelve genuinely unresolved questions. Resolving them was a prerequisite to writing the flows, so they are recorded here as first-class decisions.

| # | Question | Decision | Consequence |
|---|---|---|---|
| D15 | Can a user create a tracker from the UI, or only the operator? | **Both.** Shipped packs are operator config files. Users additionally get a constrained **custom tracker builder** producing a user-scoped definition stored in the DB against the same meta-schema. | New table `user_tracker_definition`, new endpoints, new screen. Resolves the direct contradiction between `02` §1 and `05` §4.9. |
| D16 | How do reminders reach a closed app, given SSE needs the app open? | **Web Push (VAPID)**, self-hosted, with an in-app fallback for anyone who denies permission. | New table `push_subscription`, new endpoints, permission flow. |
| D17 | What is the "avoid list" the verdict card references? | A real entity: a per-user list of foods/tags the user has chosen to avoid. It annotates logging, suppresses re-proposal for 90 days, and feeds the elimination-load cap. | New table `avoid_entry`, new screen, new engine input. |
| D18 | Is backdating supported? | **Yes, everywhere.** Every timestamp control is date **and** time. Default is now; the date row is collapsed until tapped. | Replaces every time-only control drawn in `05` §4. |
| D19 | Can a user stop a trial early and still get a verdict? | **Yes.** New status `stopped_early`; a partial verdict is produced and clearly labelled. `abandoned` is reserved for "throw it away". | New status value; verdict copy variant. |
| D20 | What happens to an insight across analysis runs? | Latest run wins per (exposure, outcome, lag). The prior row gets `superseded_by`. Dismissals are keyed to the *pair*, not the row, and expire when the effect size changes by more than 10 pp. | New columns; ranking rule. |
| D21 | Is a mid-trial live estimate shown? | **No.** Deliberately withheld until the trial completes, because showing it undermines the outcome-first blinding mitigation. The user sees adherence and progress only. | Stated in UI copy so it doesn't read as a missing feature. |
| D22 | How is "unintentional" weight loss detected for the red flag? | It isn't inferred. The rule fires on **rate** (≥5% in 90 days) and the card asks the user *"was this on purpose?"*. Answering yes suppresses it for 90 days. | Removes an unimplementable qualifier. |
| D23 | Which locale does the clinician PDF use? | Chosen at export time, defaulting to the account locale. Both locales are fully translated for the export. | Export screen gains a locale selector. |
| D24 | Does the app offer a theme setting? | **Yes** — System / Light / Dark. Both palettes already exist; hiding the switch was an oversight. | Settings row. |
| D25 | Is there a grace period on account deletion? | **No**, and the confirmation says so explicitly. Deletion is immediate and irreversible; the copy offers "Export first" as the adjacent action. | Confirmation screen copy. |
| D26 | What happens to unsynced data on logout? | Logout is **blocked** while the outbox is non-empty, with a "syncing… / retry / discard N items" panel. Discard requires typing the count. | Logout flow gains a guard state. |
| D29 | Should the app accept a meal entry with no food in it? | **No — it asks once.** Zero-item entries trigger a clarify step offering three foods **from the user's own history at that hour**, never model-generated. `I really don't remember` always saves, marked `unspecified` and excluded from exposure analysis. | New `specificity` field, new endpoint, new screen. See §4.3b. |
| D30 | Is logging a whole day at once a first-class flow? | **Yes — it is probably the normal one.** A day builder takes every meal in one pass, with times prefilled from your own slot medians, and doubles as the editing surface for a past day. | New screen, bulk write, new entry points. See §4.15. |
| D31 | What timestamp does a meal logged from memory get? | An estimate, **marked as one.** `time_precision` is derived, never user-set; `slot_estimate` entries are excluded from the 0–6 h lag window and used normally above it. | New field, engine rule. |

---

## 1. Global interaction rules

These apply everywhere and are not repeated per flow.

### 1.1 Navigation model

```
Tabs (4)          today · timeline · insights · more
Push screens      open over a tab, keep the tab bar, show a back arrow
Sheets            slide from the bottom over everything, dim the tab bar
Modals            full-screen, no tab bar, explicit close only (used for: onboarding,
                  unlock, delete-account confirmation, import review)
```

- **Back arrow** on a push screen returns to the screen that opened it, restoring its scroll position.
- **Hardware/browser back** is bound to the same stack. It never exits the app from a push screen or sheet.
- **A sheet dismisses** by: the ✕, the veil tap, a downward drag past 40% of its height, or Escape.
- **Tab switching** clears the push stack for the tab being left and preserves it for the tab being entered.

### 1.2 The unsaved-work rule

Exactly three behaviours exist, and every screen declares which one it uses:

| Behaviour | Meaning | Used by |
|---|---|---|
| **Autosaved** | Every change is committed immediately; there is no save button and dismissal is always safe | stool sheet, all settings screens, tracker toggles |
| **Draft-kept** | Dismissing preserves the work as a draft and shows a one-line "Draft kept" toast with an Undo | meal composer, note, symptom sheet |
| **Confirm-discard** | Dismissing with changes prompts "Discard changes?" | trial adjust, custom tracker builder, import review |

**No screen silently discards user input.** If a screen isn't in this table, it is unspecified.

### 1.3 Drafts

- A draft is a local-only record in IndexedDB (`drafts` store), keyed by tracker and creation time. It never reaches the server.
- Drafts appear at the top of Today as a dismissible row: *"Unfinished meal from 13:05 — resume / discard"*.
- Maximum 5 drafts; oldest is dropped silently. Drafts older than 7 days are purged.

### 1.4 Timestamps (D18)

Every capture screen has one timestamp control with this behaviour:

```
[ Today · 13:05 ▾ ]          ← default, collapsed
   tap ▾ →
[ ‹ Aug 19  Aug 20  [Aug 21]  › ]   day strip, 7 days back + today
[ 13 : 05 ]                          time wheel
[ Set ]                              commits, collapses
```

- Range: 5 years back, 24 h forward (`02` §7 rule 1). Values outside are rejected inline: *"That date is outside what I can record."*
- If the chosen time falls before the day rollover, the control shows a note: *"Counts as Wednesday 20 — your day starts at 04:00."* This is the only place the rollover is ever explained, and it appears only when it actually applies.

### 1.5 Undo

Every destructive action produces an undo toast lasting 8 seconds: delete an entry, remove a parsed item, discard a draft, clear a photo, dismiss an insight. The toast is the only undo affordance for item-level actions; entry-level deletes are *also* recoverable from **More → Recently deleted** for 30 days.

### 1.6 Sync status, everywhere

- Today's header shows one of: `⟳ synced` · `↑ 3 waiting` (tappable) · `⚠ offline` · `⟳ syncing…`
- Tapping it opens the **Sync sheet**: pending count, last successful sync, a per-item list with retry, and a "Retry all now" button.
- Every timeline row for an unsynced entry carries a small `↑` badge. Once synced, the badge disappears with no animation.

### 1.7 What the SSE events do to the UI

| Event | Visual treatment |
|---|---|
| `parse.completed` | The affected timeline/Today row updates in place. If the meal had zero items, a toast: *"Tidied up your 13:05 meal — 4 items."* Tapping opens it. |
| `analysis.completed` | Insights tab gains a dot badge. If the user is on Insights, the list refreshes with a "Updated just now" line rather than jumping. |
| `trial.phase_changed` | Non-dismissible card at the top of Today describing the new phase and what to do today. |
| `safety.flag_raised` | Red-flag banner (§9.1). Never a toast. |
| `export.completed` | Toast with a Download action; also a row in More → Exports. |
| `sync.hint` | Silent. Triggers a pull. |

---

## 2. F1 — First run and onboarding

**Type:** modal, cannot be backgrounded away from on step 1. **Unsaved-work:** autosaved per step.

```
① WELCOME
   "FoodTrack finds out what your food is doing to you."
   Three bullets, one illustration.
   [ Get started ]   [ I have an export to import ]  ──────────────► F11.2 (import)

② WHAT ARE YOU TRYING TO FIGURE OUT?      (single select, drives the pack)
   ▸ Which foods upset my gut          → gut-health pack
   ▸ Track what I eat and my weight    → body pack
   ▸ Energy, sleep and mood            → energy pack
   ▸ Something else                    → opens the tracker picker with nothing preselected
   [ Skip ]  ─────► applies the gut-health pack anyway, because an empty app is useless

③ WHICH OF THESE DO YOU WANT TO TRACK?
   Checklist, pack items pre-ticked, every item toggleable, grouped by category.
   A one-line "why this helps" under each confounder tracker
   (e.g. sleep: "makes the food findings much more trustworthy").
   [ Continue ]      ← always enabled, even with everything unticked

④ ABOUT YOU                              (all fields skippable, none required)
   Year of birth ▾   ·   Sex at birth ▾   ·   Height   ·   Current weight
   Note: "This only ever affects unit defaults and trend lines. Leave anything blank."
   [ Continue ]  [ Skip all ]

⑤ YOUR DAY
   Timezone ▾ (prefilled from the device)
   "My day starts at" [ 04:00 ▾ ]  with the explainer: "A 01:00 snack belongs to yesterday."
   Units: kg/lb · ml/oz · cm/in
   [ Continue ]

⑥ REMINDERS                              → F12.1 for the permission request
   Evening check-in  [ 21:30 ▾ ]  toggle on
   Meal nudges                     toggle off by default
   Quiet hours       [ 22:30 – 07:30 ]
   [ Turn on reminders ]  [ Not now ]

⑦ LOCK IT
   "This is health data. Set a passphrase."
   [ passphrase ] [ confirm ]   strength meter, minimum 10 characters
   ⓘ "This locks the app, not the database. If you forget it, you can reset it
      from the server — see the runbook. Nothing is lost."
   [ Set passphrase ]     (multi-user mode instead shows email + password + optional OIDC button)

⑧ ADD TO HOME SCREEN
   If `beforeinstallprompt` fired    → [ Install ] button
   iOS Safari / no prompt available  → illustrated 3-step "Share → Add to Home Screen"
   [ Later ]

⑨ DONE  →  Today, day-one empty state (§2.2)
```

**Rules**

- Steps 2–8 are individually skippable; step 7 is not.
- Progress is written after every step. Quitting and reopening resumes at the first incomplete step.
- **Re-runnable:** More → Setup → "Run setup again" replays 2–6 without touching data or the passphrase.
- Language is offered on step ① as a small `עברית / English` toggle in the corner, and defaults from the browser locale.

### 2.2 Day-one Today

```
Good morning.
Nothing logged yet — start anywhere.

[ QUICK LOG grid: the trackers you enabled ]

┌──────────────────────────────────────────┐
│  What happens next                        │
│  ● Log for a few days — anything at all   │
│  ● After ~3 weeks I can start looking     │
│    for patterns                           │
│  ● Around 3–4 months a clear effect       │
│    becomes visible. This is a slow tool.  │
│                          [ How this works ]│
└──────────────────────────────────────────┘
```

The score card, insights teaser and trial card are all absent until they have something real to say. **No fake data, no zero-state charts, no "0 / 100".**

---

## 3. F2 — Authentication

### 3.1 Unlock (single-user)

Triggered on: cold start, resume after the configured idle timeout (default 15 min, settable to Never), or manual lock.

```
[ FoodTrack ]
[ passphrase ············ ]   [ 👁 ]
[ Unlock ]
( Use biometrics )   ← shown only if WebAuthn platform authenticator is enrolled
```

- Wrong passphrase → inline error, attempts remaining shown after the 3rd failure.
- 5 failures → lockout screen with a live countdown (`30s → 1m → 2m → 5m → 15m`, capped). The countdown persists across app restarts.
- **Forgot passphrase** → a screen that says plainly what is actually true for this architecture:

> **You can reset it — you own the server.**
> The passphrase locks the app. It does not encrypt the database, so nothing is lost.
> On the machine running FoodTrack:
> `docker compose exec api pnpm reset-passphrase`
> It prints a one-time link, valid for 15 minutes, that lets you set a new one.
> `[ Copy the command ]`   `[ I can't reach the server ]` → S12b

- **`[ I can't reach the server ]`** → the honest fallback: *"Then you can't get in from here. There's no email reset, because there's no email service and no one but you holds a key. Someone with access to the machine can run the command above."* No `Start fresh`, no wipe — offering to erase a working database because someone forgot a password would be a catastrophic default.

**What the passphrase does and does not do** — stated here because the earlier draft of this spec got it wrong, and the error is worth naming. The passphrase is an **authentication credential**: Argon2id-hashed, checked at unlock, never used as an encryption key. Data at rest is protected by disk-level encryption whose key belongs to the host, not to the user. Therefore:

| Threat | Does the passphrase help? |
|---|---|
| Someone opens the app on your unlocked phone | **Yes** |
| Someone finds the instance on the internet | **Yes** — plus rate limiting and lockout |
| Someone steals a `pg_dump` or a backup file | **No** — backups must be encrypted separately (`06` §6) |
| Someone has root on your server | **No**, and no app-level design can change that |
| You forget it | **Nothing is lost.** Reset from the server. |

Claiming otherwise would be security theatre. If a stolen database dump needs to be unreadable, that requires application-level encryption, which is a different architecture with real costs — see `06` §5.1.

### 3.2 Session expiry mid-use

1. A request returns 401 and refresh fails.
2. **Nothing in flight is lost.** The current screen's state is written to drafts; the outbox is untouched.
3. An unlock sheet slides up over the current screen — not a navigation.
4. On success, the sheet dismisses and the user is exactly where they were. The outbox drains.

### 3.3 Logout (D26)

```
More → Account → Log out
  ↓
outbox empty?
  ├─ yes → "Log out? Your data stays on the server." [ Cancel ] [ Log out ]
  └─ no  → "3 entries haven't synced yet."
            [ Sync now and log out ]  (default, shows progress)
            [ Retry failed ]
            [ Discard 3 and log out ]  ← requires typing the number 3
```

On logout: IndexedDB cleared, tokens revoked, service worker cache purged of user data, back to unlock/login.

### 3.4 Multi-user additions

Register (email + password + confirm, with an operator-controlled open/invite-only switch), Login, OIDC button when configured, TOTP enrolment (QR + 10 recovery codes, shown once, with a "I've saved these" confirmation), TOTP challenge on login, and Change password (current + new + confirm, revokes all other sessions).

---

## 4. F3 — Capture flows

Every tracker gets a flow. The audit found seven trackers named in the data model with no flow at all; they are specified here.

### 4.0 Common capture skeleton

```
entry point → sheet opens → [ timestamp control ] → [ fields ] → save
```

- **Save is always enabled.** There is no invalid state (`01` US-01 AC4).
- Save writes to IndexedDB and closes the sheet within 100 ms. The network is never awaited.
- On save, the new row animates into Today's "today so far" list.
- Every sheet declares its unsaved-work behaviour per §1.2.

### 4.1 Entry points — the complete map

The audit's sharpest finding: eleven trackers, four quick-log tiles. Resolved as follows.

```
Today · QUICK LOG grid    the user's top 4, chosen by them, defaulting to
                          stool · meal · symptom · checkin
                          The grid's last cell is always [ ⋯ More ] when >4 trackers are enabled.

FAB — tap                 opens the meal composer (the most common action)
FAB — long-press          radial menu: the same top 4 + [ ⋯ ]

[ ⋯ More ] / [ ⋯ ]        the TRACKER PICKER sheet: every enabled tracker as a labelled row,
                          ordered by the user's own frequency, with a search field when >10.
                          This is the guaranteed path to every tracker. Nothing is unreachable.

Timeline → [ + ] on a day header    logs into that day (backdating shortcut)
Trial card → the day's prompt       logs the trial's primary outcome directly
```

### 4.2 Meal — text path

```
composer opens, textarea focused, keyboard up, timestamp = now
  ↓ user types ≥3 chars, pauses 600 ms
  ↓ POST /meals/parse (SSE)
  ├─ items stream in as rows                          → §4.3 row interactions
  ├─ timeout 8 s → "degraded" → rows from library/canonical only, chip: "still tidying this up"
  └─ hard failure / offline → no rows, chip: "saved as you wrote it — I'll sort it out later"
  ↓ [ Save ]  (tappable at any moment, including mid-parse)
  ↓
observation written locally with whatever items exist
  ├─ parse still running server-side → completes → SSE `parse.completed` → row updates in place,
  │                                    toast "Tidied up your 13:05 meal — 4 items"
  └─ zero items → the timeline row shows "Needs a moment" with a [ Parse now ] retry button.
                  Excluded from exposure analysis until resolved (`02` §7 rule 3).
```

**Composer dismissal:** draft-kept. `Draft kept · Undo`.

### 4.3 Meal — parsed row interactions

| Control | Behaviour |
|---|---|
| **Item name** | Tap → **Item editor** sheet: search field (library → canonical → "create «text»"), 5 nearest alternatives with match reasons, the raw text you typed shown above. Choosing one rewrites `meal_item.food_id` **and** writes `user_food.alias`, so the same words resolve instantly next time. |
| **`?` low-confidence chip** | Same as tapping the name, opened straight to the alternatives list. |
| **Quantity `▾`** | Popover: a numeric stepper, a unit selector, and 3 shortcut portions from your own history ("your usual: 3 tbsp"). |
| **`✕` remove** | Removes the row, toast `Removed hummus · Undo` (8 s). |
| **`+ add item`** | Appends an empty row focused on a search field, same picker as the item editor. |
| **Tag `+`** | Chip picker: your 8 most-used tags, a free-text field, and meal-slot tags suggested from the timestamp. |

### 4.3b Clarification — when the entry says nothing (D29)

A meal entry with no food in it is not data. *"נשנשתי כל הערב"* is a real thing to type and a real thing to have done, but stored as-is it produces a day that looks logged and contributes nothing, which is worse than an obviously empty day — it inflates the adherence number and quietly starves the analysis.

**So the app asks. Once, cheaply, and never as a wall.**

#### Three tiers, decided by what the parser found

| Tier | Condition | Behaviour |
|---|---|---|
| **1 — Resolved** | ≥1 item at confidence ≥ 0.6 | Normal. Save. |
| **2 — Partially vague** | ≥1 confident item, plus text the parser couldn't place (*"משהו עם עוף"* → chicken resolves, "משהו" doesn't) | Save the specific part. A quiet `+ add detail?` chip under the row. **No interruption** — you told it something real. |
| **3 — No food content** | Zero items, or only quantity/time/filler words | **Clarify step.** This is the new behaviour. |

#### The clarify step

```
┌──────────────────────────────────────────────────┐
│  "נשנשתי כל הערב"                                │
│                                                   │
│  I can't tell what that was.                      │
│  Was it one of these?                             │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ 🥜  בוטנים ובמבה          12 evenings       │ │
│  ├─────────────────────────────────────────────┤ │
│  │ 🍫  שוקולד                 8 evenings       │ │
│  ├─────────────────────────────────────────────┤ │
│  │ 🧀  גבינה וקרקרים          5 evenings       │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  [ Something else — I'll type it ]                │
│  [ I really don't remember ]                      │
└──────────────────────────────────────────────────┘
```

#### The rule that makes this honest

**The three options come from your own logged history. Never from the model.**

They are the foods you have most often logged in a ±90-minute window around this entry's timestamp, ranked by frequency, excluding anything already in this meal. That is a *memory aid* — it shows you what you usually do at this hour and lets you confirm or reject it.

If the model generated the options instead, this feature would become the exact failure I warned about: confident fabrication feeding the analysis. The difference between "you've eaten peanuts on 12 evenings, was it that?" and "it was probably 150 g of mixed nuts" is the difference between a useful product and a misleading one.

**Consequences:**

- **Not enough history** (fewer than 3 qualifying foods, i.e. roughly the first fortnight): no options are shown. The step becomes a single line — *"Even a rough idea helps: 'something sweet', 'leftovers', 'bread and cheese'."* — with the text field focused. Examples of the *level of detail* wanted, not guesses at content.
- **`Something else`** returns focus to the text field with the original text intact and the cursor at the end. It does not clear what you wrote.
- **`I really don't remember`** saves the observation with `specificity: "unspecified"`. It is a real, honest record: it counts toward day coverage and logging adherence, and is **excluded from exposure analysis**. The confirmation says so in one line: *"Saved. This one won't count toward finding patterns."* That sentence is the point — it makes the cost visible without scolding, so next time there is a reason to type three more words.

#### What this does not do

- It does not block saving. `I really don't remember` is always present and always one tap.
- It does not appear for tier 2. Telling the app "chicken" is telling it something; nagging for more would violate the 60-second budget for no gain.
- It does not appear twice for the same entry. Dismissed once, the meal saves as unspecified.
- It never guesses portions. The options carry the food, and the portion comes from your own median for that food — the same rule as everywhere else.

#### Why this is worth the friction

An `unspecified` meal is roughly a wasted day for the association engine, and §15 already showed how few of those we have to spare — at 5 logged days a week, every discarded day pushes a conclusion further out. One tap that converts a useless entry into a real one buys back a day of study time. That is a good trade, and it is the *only* place in the app where the spec deliberately adds a step.

### 4.4 Meal — photo path

```
[ 📷 Photo ] → source sheet: [ Camera ] [ Choose from library ]
  ↓ capture
PREVIEW screen — the photo, full-bleed
  [ Retake ]   [ Use photo ]   [ Cancel ]
  ↓ Use photo
photo written to IndexedDB media_queue immediately; a thumbnail appears in the composer
  ↓ upload + vision inference queued
  ├─ vision on and reachable → items stream in, low-confidence ones flagged
  ├─ vision disabled in settings → no inference; a note: "Vision is off. Add a description?"
  └─ offline → thumbnail carries a ↑ badge; inference runs on reconnect
  ↓
composer behaves exactly as the text path from here. Text and photo compose:
typing a note re-parses text and photo together.
```

- **Up to 4 photos per meal.** The composer shows a horizontal thumbnail strip; each has a long-press → `Retake · Remove · View full`.
- **Permanent upload failure** (retries exhausted, 24 h): the thumbnail turns to a `⚠` state and a Today row appears — *"A photo from Tuesday couldn't upload. [ Retry ] [ Remove it ]"*. It is never silently dropped.
- **Data-model consequence:** meal photos are a `multi_photo` field storing an array of `media_id`, not the single `value_media_id` originally specified. See `02` §2.1 addendum.

### 4.5 Meal — favourites and repeat (resolving the C3 / `/repeat` contradiction)

Both behaviours exist, and they are different controls:

| Control | Where | Behaviour |
|---|---|---|
| **Quick-repeat tile** | Today, "Usual for this time" | **Saves immediately**, one tap, at the current time with your median portions. Toast: `Logged · Edit · Undo`. Editing opens the composer prefilled. |
| **`↻ Repeat last`** | inside the composer | **Loads an editable draft** of the most recent meal. Nothing is saved until you tap Save. |
| **`★ Favourites`** | inside the composer | Opens a searchable list of your most-logged meals; picking one loads it as an editable draft. Long-press a row → `Pin · Rename · Remove`. |

### 4.6 Meal — voice

The mic in the composer is the *only* voice affordance (C14 and C1's dictation were the same feature described twice; C14 is folded into C1). Tap → live transcript into the textarea → parsing runs on the transcript exactly as typed text. If the browser has no speech API, the mic is hidden, not disabled.

### 4.7 Stool

The fastest flow in the app; unchanged from `05` §4.3 with these additions:

- **A ✕ exists** in the sheet header from the moment it opens, so an accidental open costs one tap to leave.
- Tapping a Bristol tile saves immediately. Tapping a *different* tile afterwards **updates** the same record rather than creating a second one.
- The extras row auto-dismisses after 3 s; any interaction cancels the timer permanently for that session.
- **Blood / black colour** → saves normally, then raises the red flag (§9.1) as a card on Today. Never interrupts.
- **Duplicate guard:** a second stool within 5 minutes shows an inline prompt above the grid — *"You logged one 3 minutes ago. Another one, or fixing that one?"* `[ Another ] [ Fix that one ]`.

### 4.8 Symptom *(was entirely unspecified)*

```
SYMPTOM sheet — multi-symptom in one pass
[ Today · 19:20 ▾ ]

Which?           chips, multi-select, ordered by your own frequency
  [ Bloating ] [ Gas ] [ Pain ] [ Reflux ] [ Nausea ] [ Urgency ] [ Fever ] [ + ]

For each selected symptom, a block appears:
  Bloating          ○ ○ ○ ○ ● ○ ○ ○ ○ ○   7/10
    Started  [ 19:20 ▾ ]   Lasted  [ 3h ▾ ]      ← both optional, collapsed by default
    Where    [ body map ]                         ← optional, pain only, 9 abdominal regions

[ Save ]
```

- Selecting a chip creates its block; deselecting removes it with an undo toast.
- One save writes **one observation per symptom**, sharing a `group_id` so they can be edited or deleted together.
- **`Fever`** and **`Can't keep fluids down`** are shipped symptom options specifically because the red-flag rules read them (`01` US-09 AC1 previously referenced fields that did not exist).
- Unsaved-work: draft-kept.

### 4.9 Evening check-in

Per `05` §4.4, plus:

- The `✕` is **autosaved**: whatever scales you touched are kept; untouched ones stay null. No prompt.
- "Nothing to report" writes `all_clear` for the day **and** fills energy/mood/sleep with nulls, not zeros. Null ≠ zero anywhere in the engine.
- If the day already has an `all_clear` and the user then logs a symptom, the `all_clear` is retracted automatically and a toast explains: *"Removed today's all-clear."*
- During an active trial the check-in runs **outcome-first** (D21): symptom and stool questions come before any trial context is shown on screen.

### 4.10 Weight and body *(were entirely unspecified)*

```
WEIGHT sheet
[ Today · 07:10 ▾ ]
        ┌─────────────┐
        │   78.4  kg  │      large numeric field, prefilled with your last value,
        └─────────────┘      numeric keypad, ± 0.1 steppers either side
   Trend: 78.9 → 78.4 over 14 days  ▁▂▁▃▂▁▁
   [ + Add waist, body fat or blood pressure ]     ← expands the body fields inline
[ Save ]
```

Body fields: waist (cm/in), body fat (%), blood pressure (systolic/diastolic, one row). All optional, all independent observations sharing a `group_id`.

### 4.11 Hydration *(had no entry point at all)*

Not a sheet. A **stepper row** that appears in the quick-log area when the tracker is enabled:

```
Water today   [ – ]  4 glasses  [ + ]        ← each tap writes an observation immediately
```

Tapping the count opens a sheet for volume, container type and backdating. One tap = one glass = the volume set in tracker settings (default 250 ml).

### 4.12 Medication and supplement *(were entirely unspecified)*

```
MEDICATION sheet
[ Today · 08:30 ▾ ]
Your list          [ Vitamin D 1000IU ] [ Omeprazole 20mg ] [ + Add ]
                   ↑ tap to log · long-press to edit or archive
Ad-hoc             [ name field ] [ dose ] [ unit ▾ ]
Scheduled today    ☑ Vitamin D 08:00      ☐ Omeprazole 20:00
                   ↑ checking one logs it at its scheduled time
[ Save ]
```

- A medication has: name, dose, unit, optional schedule (times of day, days of week), start/end dates, and a class tag (`antibiotic`, `nsaid`, `ppi`, `probiotic`, `fibre`, `other`). **The class tag is what the analysis engine consumes as a confounder** — the user picks it once when adding the medication, from a short list, with "not sure" as a valid answer.
- Antibiotics prompt once on save: *"Starting a course? I'll note it for the next 14 days."* — because the engine treats `antibiotic within 14 days` as a confounder window.
- Supplements are the same screen with a different tracker key and no scheduling emphasis.
- **The app never suggests starting, stopping or changing anything here** (`CLAUDE.md` safety rule).

### 4.13 Exercise *(was entirely unspecified)*

```
EXERCISE sheet
[ Today · 18:00 ▾ ]
Type      [ Walk ] [ Run ] [ Gym ] [ Cycle ] [ Swim ] [ Other ]   ← chips, your order
Duration  [ 45 min ▾ ]
Intensity ○ easy   ● moderate   ○ hard
[ Save ]
```

### 4.14 Note

A standalone free-text observation with an optional photo — for anything the trackers don't cover ("ate out, no idea what was in it"). Distinct from the per-entry `note` field, which annotates a specific observation. Notes appear in the timeline, are searchable, are included in exports, and are **never** sent to the analysis engine as an exposure.

---

### 4.15 Filling in a whole day at once (D30)

**This is probably the normal case, and v1.3 treated it as an edge case.** Logging each meal as you eat it is the ideal; logging the whole day at 22:00 from memory is what most people actually do. Under the old design that meant opening the composer four times and correcting the timestamp on each — roughly two minutes of fiddling, which blows the 60-second budget on the very pattern most likely to be used.

The **day builder** takes a whole day in one pass.

#### The screen

```
┌──────────────────────────────────────────────────┐
│  ←   Fill in Thursday 21 August          [ ⋯ ]   │
│                                                   │
│  ☕ Breakfast      ~08:10 ▾                       │
│  ┌─────────────────────────────────────────────┐ │
│  │ קפה עם חלב, טוסט עם אבוקדו                  │ │
│  └─────────────────────────────────────────────┘ │
│     🥑 Avocado · ☕ Coffee with milk · 🍞 Toast   │
│                                                   │
│  🍽 Lunch         ~13:20 ▾                       │
│  ┌─────────────────────────────────────────────┐ │
│  │ פיתה עם חומוס וסלט                          │ │
│  └─────────────────────────────────────────────┘ │
│     🫓 Pita · 🥣 Hummus · 🥗 Salad               │
│                                                   │
│  🍽 Dinner        ~19:45 ▾                       │
│  ┌─────────────────────────────────────────────┐ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  🍪 Snacks        anytime                        │
│  ┌─────────────────────────────────────────────┐ │
│  │                                             │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  [ + another meal ]                               │
│                                                   │
│  ── Also that day ──────────────────────────────  │
│  💩 09:40 · Bristol 4          already logged  ✓  │
│  💩 [ + add ]                                     │
│  😣 [ + add a symptom ]                           │
│  ✅ [ evening check-in ]                          │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │            Save the day  ·  3 meals          │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

#### How it behaves

- **Each field parses independently**, on blur rather than while typing — you're moving between fields, not pausing to think, so the 600 ms debounce from the single composer would fire constantly. Parsed items appear as a compact chip line under the field; tapping one opens the item editor (S28) exactly as in the composer.
- **Times are prefilled from your own history** — the median time you have logged that slot, not a hard-coded 08:00/13:00/19:00. Someone who eats dinner at 21:00 gets 21:00. Tap the time to adjust; it is a full date+time control (§1.4).
- **Empty fields save nothing.** No empty meals, no placeholder rows.
- **Already-logged meals appear pre-filled** in their slot, greyed slightly, editable in place. This is what makes the screen work for *editing* a day and not only for filling an empty one — the same surface does both.
- **`+ another meal`** appends a free slot with its own time, for the days that don't fit four slots.
- **One Save** writes every non-empty field as its own observation, each with its own timestamp. It is a single `POST /observations/bulk` and a single undo.
- The stool / symptom / check-in section shows what is already there for that day and offers to add what is missing, opening the normal sheets pre-dated to that day. It is a **checklist of the day**, not a second way to log.

#### Multi-line paste

Paste a blob and it distributes. Three patterns are recognised, in order:

| Input | Interpreted as |
|---|---|
| `בוקר: קפה וטוסט` | explicit slot label → that slot |
| `13:00 פיתה עם חומוס` | leading time → a meal at that time |
| a bare line | the next empty slot, in order |

This exists because people who already keep notes somewhere shouldn't have to retype them, and because it makes the pilot log (`pilot/README.md`) importable by hand.

#### Entry points

- **Today** → a `Fill in today` row that appears after the check-in hour, or any time the day has fewer meals than your median.
- **Timeline** → tap any day header → `Fill in this day`.
- **Timeline** → a day with nothing logged shows a single `nothing logged · fill it in` row rather than blank space.
- **After the evening check-in** → *"Add today's meals too?"* as a follow-on, because that is the moment the user is already thinking about the day.
- **More → Fill in a past day** → date picker, for catching up on several days.

#### The honest part: estimated times (D31)

A meal logged at 22:00 and assigned "~13:20" did not happen at 13:20. Pretending otherwise would quietly corrupt the shortest lag windows, where an hour matters.

Every meal therefore carries `time_precision`:

| Value | When | Effect on analysis |
|---|---|---|
| `exact` | Logged within 2 h of the timestamp, or the time was set by hand | Used in every lag window |
| `slot_estimate` | Time inferred from your slot median | **Excluded from the 0–6 h window.** Used normally at 6–24 h and above. |
| `day_only` | No usable time at all | Used only at 24–48 h and 24–72 h |

The user never sets this — it is derived. It shows as a small `~` before the time, and tapping the time to set it by hand promotes the entry to `exact`.

This costs almost nothing in practice: the 6–24 h window is where most food→gut effects live (`04` §4), and that window survives intact. But it means the app never reports an immediate-reaction finding built on a time it made up, which is exactly the kind of quiet dishonesty that makes a health app untrustworthy.

---

## 5. F4 — Editing, deleting, and time

### 5.1 Edit

```
Timeline or Today row → tap        → detail view (read-only, with an [ Edit ] button)
Timeline or Today row → long-press → action sheet:
      Edit · Log this again now · Duplicate · Change time · Split · Delete
Timeline day header   → tap        → DAY VIEW (§5.1b) — the real editing surface
```

**Row-by-row editing is for fixing one thing.** Fixing or filling a whole past day goes through the day view, because opening five sheets in sequence to repair one day is the same friction problem the day builder solves for logging.

- **Edit** reopens the tracker's own sheet, prefilled, in edit mode: the primary button reads `Save changes`, and a `Delete` appears at the bottom.
- For **stool**, edit mode shows the Bristol grid with the current value selected plus all the optional fields expanded — the auto-dismiss behaviour is disabled in edit mode.
- Every edit bumps `revision` and writes an `observation_revision` row. The detail view has a **History** disclosure showing prior revisions with timestamps.

### 5.1b The day view — editing history properly (D30)

`Timeline → day header`, or `More → Fill in a past day`. **The same screen as the day builder (§4.15)**, populated with whatever that day already holds.

```
┌──────────────────────────────────────────────────┐
│  ←   Wednesday 20 August            score 62  ⋯  │
│                                                   │
│  ☕ Breakfast     07:55                       ⋯   │
│  │ קפה שחור                                       │
│  🍽 Lunch        12:40                        ⋯   │
│  │ שווארמה בלאפה, צ׳יפס, סלט                      │
│  🍽 Dinner       ~19:30  ~                    ⋯   │
│  │ (nothing logged — add it)                      │
│  🍪 Snacks                                    ⋯   │
│  │ (nothing logged)                               │
│                                                   │
│  ── Also that day ──────────────────────────────  │
│  💊 08:30 Vitamin D                           ⋯   │
│  💩 09:10 Bristol 6 · urgent                  ⋯   │
│  😣 19:20 Bloating 7/10 · 3h                  ⋯   │
│  ✅ 22:00 Check-in · energy 2 · slept 5h30m   ⋯   │
│  💩 [ + ]   😣 [ + ]   ⚖️ [ + ]   📝 [ + ]        │
│                                                   │
│  Day weight 0.8 · this day counts fully  ⓘ        │
└──────────────────────────────────────────────────┘
```

**What each part does**

| Element | Behaviour |
|---|---|
| Any meal line | Tap the text to edit in place; it re-parses on blur. Tap a parsed chip to open the item editor. |
| `~` before a time | This time was estimated (D31). Tap to set it exactly and promote the entry to `exact`. |
| `⋯` on a row | `Edit · Duplicate · Change time · Move to another day · Delete` |
| `⋯` in the header | `Add a meal · Copy this day to another date · Export this day · Delete everything from this day` (typed confirmation) |
| `+` buttons | Open the normal sheet, pre-dated to this day |
| **Day weight** | The `w(d)` from `04` §2, in plain words — *"this day counts fully"* / *"this day counts at about a third — a check-in would fix that"*. Tapping explains what would improve it. |

That last row is the quiet argument for filling gaps. It tells you which past days are pulling their weight and which aren't, and exactly what would fix them — which turns "edit history" from tidying into something that measurably improves what the engine can find.

**Autosaved.** Every field commits on blur; there is no Save button on a day that already exists. The day *builder* has a Save because it is creating several records at once; the day *view* is editing records that exist, and §1.2 says those autosave.

### 5.2 Delete and recover

```
Delete → toast "Deleted · Undo" (8 s)
      → after that: More → Recently deleted (30 days, grouped by day, [ Restore ] per row)
      → after 30 days: purged by a scheduled job
```

Deleting a grouped observation (multi-symptom, body metrics) prompts once: *"Delete all 3 from 19:20, or just this one?"*

### 5.3 Backdating and moving days

Handled entirely by the timestamp control (§1.4). Changing an entry's date:

1. Recomputes `local_day` server-side.
2. Invalidates the affected `daily_rollup` rows for both the old and new day.
3. If an active trial covers either day, recomputes that `trial_day` and re-evaluates adherence, with a toast: *"Moved. Your dairy trial's day 6 has been updated."*

### 5.4 Split and merge

- **Split** (a logged meal that was really two): meal detail → `⋯` → **Split meal** → checkbox list of items → *"Move 2 items to a new meal at [ time ]"*. Creates a second observation, moves the items, preserves both.
- **Merge**: select two meals in the timeline via long-press multi-select → **Merge** → items combine into the earlier timestamp, the later is soft-deleted.

Both are rare; both are one screen; neither is optional, because without them a mis-parse is unfixable.

---

## 6. F5 — Food library

Reached from **More → Food library** and from the item editor's "create «text»".

```
FOOD LIBRARY
[ search ]                                     [ + Add food ]
Sort: most logged ▾ · Filter: all ▾ (mine / verified / needs review)

🥣 Hummus            logged 47×   usual 3 tbsp        ›
🫓 Pita              logged 41×   usual 1 unit        ›
❓ "shakshuka"       logged 3×    unresolved          ›   ← never matched a canonical food
⚠ Hummus (2)        possible duplicate               ›
```

| Screen | Contents |
|---|---|
| **Food detail** | Names (canonical + your aliases, editable), category, portion default, nutrients per 100 g (editable for user-created foods, read-only for sourced ones with a "from USDA" note), tags including FODMAP class with their citations, "logged N times", `[ Merge into another food ]`, `[ Delete ]` (blocked if referenced, offering merge instead). |
| **Add food** | Name (both locales), category, default portion, optional nutrients, optional tags. Everything except name is skippable. |
| **Merge** | Pick the survivor, side-by-side field comparison, an explicit count of how many meal items will be rewritten, and a typed confirmation. Irreversible — stated plainly. |
| **Duplicate review** | A generated list of likely duplicates (trigram similarity + shared aliases), each with `[ Merge ] [ Not duplicates ]`. Dismissals are remembered. |
| **Empty state** | *"Your library fills itself as you log. Nothing to do here yet."* |

---

## 7. F6 — Sync, offline and storage

### 7.1 States

| State | Header | Behaviour |
|---|---|---|
| Synced | `⟳ synced` | normal |
| Pending | `↑ 3 waiting` | writes queue; everything readable |
| Syncing | `⟳ syncing…` | progress in the sync sheet |
| Offline | `⚠ offline` | full write capability; insights show "as of your last sync" |
| Failing | `⚠ 2 failed` | tappable → per-item error and retry |

### 7.2 Conflict

Field-level last-write-wins is silent **except** when a field the user can see was overwritten. Then: a toast — *"Your note from this device was replaced by a newer edit. [ See both ]"* → the revision history with both values and a `[ Use mine ]` button.

### 7.3 Full resync (`410 Gone`)

A modal, because it is slow and consequential:

> **Catching up**
> You've been offline a while, so I need to fetch everything again. Nothing on this device will be lost — anything waiting to sync goes up first.
> `[ ████████░░ 4,120 / 5,300 ]`
> `[ Do this later ]` — keeps the app usable read-only from cache

### 7.4 Storage quota exceeded

Triggered by an IndexedDB write failure, most likely from queued photos.

> **Running out of room on this device**
> Photos waiting to upload are using 180 MB. Your entries are safe.
> `[ Upload them now ]` `[ Keep entries, drop queued photos ]` `[ Free up space myself ]`

Text entries are never dropped. The app degrades by shedding photos, in oldest-first order, and only with consent.

### 7.5 Cold start, no cache, no network

Distinct from "offline with data". Full-screen: *"I can't reach your server and there's nothing saved on this device yet. Check the address in settings, or try again when you're back online."* with `[ Retry ]` and `[ Server settings ]`.

---

## 8. F7 — Insights

### 8.1 Running an analysis

```
Insights tab opens
  ↓ automatic: if the last run is >6 h old AND ≥1 new day of data exists → run in background
  ↓ manual:    the ⟳ control → POST /analysis/run
  ↓
RUNNING state — the list stays visible and usable, a slim bar appears on top:
     "Looking at 84 days · 340 comparisons  ▓▓▓▓▓░░░░"
  ↓ user may navigate away freely
  ↓ completion → `analysis.completed` → badge on the tab, or in-place refresh if on screen
```

Tapping `⟳` while a run is in flight does nothing but show *"Already running."* Rate limit hit → *"Give it a minute — analysis runs at most a few times an hour."*

### 8.2 The three "nothing to show" states, which are different

| Condition | What the screen says |
|---|---|
| **< 21 analysable days** | *"I need about three weeks before the maths means anything. You're on day 9 — keep going."* Progress ring. No sections rendered. |
| **≥ 21 days, no comparison passed eligibility** | *"Enough days, but nothing you eat varies enough yet to compare. Variety in what you eat is what makes this work."* |
| **Eligible comparisons ran, none reached `low`** | *"Ran the numbers on 340 combinations. Nothing stands out — which is genuinely good news."* Plus the "Not enough data yet" list. |

### 8.3 Insight lifecycle (D20)

```
                ┌──────────────┐
   run ────────►│     new      │──── user opens it ────►│ seen │
                └──────────────┘                        └───┬──┘
                                              ┌─────────────┼───────────────┐
                                              ▼             ▼               ▼
                                        ┌──────────┐  ┌──────────┐   ┌────────────┐
                                        │dismissed │  │ testing  │   │ superseded │
                                        └────┬─────┘  └────┬─────┘   └────────────┘
                        effect moves >10pp   │              │ trial completes
                                             ▼              ▼
                                        back to `new`   confirmed / ruled_out
```

- `new` shows a small dot on the card. Opening it clears the dot.
- `superseded` rows are hidden but retained; the evidence card offers *"Compare with the previous run."*
- `confirmed` insights move to a **Confirmed** section above "Worth testing", with the trial's posterior, not the observational effect, as the headline.
- `ruled_out` moves to the "Ruled out" section (already specified) with the copy *"You can stop avoiding it."*

### 8.4 "N more days" (making the number real)

The number shown is:

```
n_needed = ceil( n_required(effect = min_interesting_rd, power = 0.8, p_exposed = observed_prevalence)
                 − n_current_exposed ) / observed_prevalence
```
computed by `POST /analyze/power`, using the user's own observed exposure prevalence. The card shows the assumption in plain words: *"about 4 more days where you eat eggs, if the effect is at least the size worth acting on."* If prevalence is too low for any realistic n, it says so instead of showing a number: *"You eat this too rarely for me to compare it fairly."*

### 8.5 The audit drill-down *(screen did not exist)*

`Evidence card → See the 98 days behind this`:

```
[ ← ]  The days behind this          [ Exposed ▾ ]
Aug 14  ● dairy   →  Bristol 6      ✓ outcome     [ w 0.9 ]
Aug 13  ○ none    →  Bristol 4      · no outcome  [ w 1.0 ]
Aug 12  ● dairy   →  no stool logged  ⋯ excluded   [ w 0.3 ]
...
Filter: all · exposed · unexposed · outcome days · excluded days
```

Each row taps through to that day's full timeline. Excluded days show *why* they were excluded. This is what makes "auditable" true rather than a claim.

### 8.6 Charts *(screen did not exist)*

**Insights → Trends** (a segmented control at the top of the Insights tab: `Findings | Trends`).

| Chart | Detail |
|---|---|
| Bristol distribution | 7 bars, your normal range shaded, selectable period |
| Symptom load over time | area, with trial phases banded when one was running |
| Weight trend | scatter + EWMA line, not raw-point-connecting |
| Gut day score | line, 7-day rolling mean overlaid |
| Fibre vs. stool quality | scatter with a fitted line and an explicit "this is a picture, not a finding" note |
| Logging completeness | a calendar heatmap of day weight `w(d)` — doubles as the honest answer to "why is my data thin?" |

Every chart: period selector (30d / 90d / 1y / all), tap a point for that day, and long-press to export as an image.

### 8.7 Score breakdown

Tapping the score anywhere — Today's card or a Timeline day — opens the same sheet:

```
78 / 100 · Thursday 21 August
  Stool                −12   two entries, one at Bristol 6
  Symptoms              −6   bloating 3/10 this evening
  Urgency                0
  Other                  0
  ────────────────────────
  Started at 100
[ How this is worked out ]   → the weights, and that they're our defaults, not clinical
```

### 8.8 Pattern alerts

Appear as a single dismissible card at the top of the Insights tab, at most one at a time, at most two per week. Dismissal hides that pattern for 30 days. They carry the same evidence requirements as an insight — a pattern alert with no `n` is not shipped.

---

## 9. F8 — Trials

### 9.1 State machine

```
                  ┌──────────┐
   insight ──────►│ proposed │──[ Not now ]──► discarded (re-proposable later)
                  └────┬─────┘
                 [ Start ]
                       ▼
                  ┌──────────┐◄────[ Resume ]────┐
        ┌────────►│  active  │───[ Pause ]──►┌───┴────┐
        │         └────┬─────┘               │ paused │
        │              │                     └───┬────┘
        │   final day  │  [ Stop early ]         │ [ Abandon ]
        │      ▼       ▼                         ▼
        │ ┌──────────┐ ┌──────────────┐   ┌───────────┐
        └─│completed │ │stopped_early │   │ abandoned │
          └────┬─────┘ └──────┬───────┘   └───────────┘
               └──── verdict ──┘              no verdict
                 (partial, labelled)
```

- **Pause** freezes the day counter; paused days are excluded, not counted as non-adherent. A paused trial shows on Today with `[ Resume ]` and the pause reason.
- **Stop early** (D19) produces a verdict labelled *"Stopped on day 9 of 14 — here's what the data shows so far, with the usual caveat that it's less than planned."*
- **Abandon** asks for a reason (`too hard · felt unwell · circumstances changed · lost interest · other`) — used only to improve future proposals, never shown as judgement.
- **Completion** is triggered by a scheduled job at the day rollover following the final day, which requests the verdict and pushes `trial.phase_changed`. It does not require the user to open the app.

### 9.2 The daily trial experience

The Today trial card changes by phase:

```
BASELINE     "Eat normally. I'm just watching."          day 3 of 14
ELIMINATION  "No dairy today."     [ I slipped ]         day 6 of 21
WASHOUT      "Still no dairy — letting things settle."   day 2 of 3
CHALLENGE    "Today: 250ml of milk."  [ Done ] [ Skip ]  day 2 of 3
FOLLOW-UP    "Back off dairy. Watching for late reactions." day 1 of 3
PAUSED       "Paused since Tuesday."  [ Resume ]
```

Plus, always: the phase strip, adherence so far, and **no live effect estimate** (D21) — with a one-line explanation of why: *"I'll show the result at the end. Knowing early changes how you rate things."*

### 9.3 Slips

- **Auto-detected:** a meal containing the target during elimination raises a prompt within the same request cycle → *"Yesterday's lunch may have had dairy in it (labneh in the sabich). [ Yes, slip ] [ No it didn't ]"*. Marking it a slip offers `[ Extend the trial by 2 days ]`.
- **Manual:** `[ I slipped ]` on the trial card → date picker + optional note. This is the path for untracked exposures.
- **Missed logging** is visually distinct from a slip: the phase strip uses a filled dot for adherent, a ring for a slip, and a hollow dot for a day with no data — with a legend.

### 9.4 Adjust *(had no spec at all)*

The proposal's `[ Adjust ]` opens a sheet. **Adjustable:** elimination length (**15–35 days**; shorter is refused, with the reason shown), whether to reuse the existing baseline, challenge doses, start date, primary outcome (from the eligible outcomes list), and reminder time. **Locked, with a one-line reason shown next to each:** the minimum interesting effect *(set before the data is seen, so the answer can't move)*, the minimum adherence, the requirement that a reintroduction phase exists *(so a trial can't end at "removed forever")*, and the target itself *(change the target and it's a different trial)*.

### 9.5 Guardrail refusals — what the user actually sees

| Rule | Trigger point | UI |
|---|---|---|
| Max 1 active trial | `Test this properly` while one runs | Sheet: *"You're already testing dairy — day 6 of 14. Running two at once means neither answer is trustworthy."* `[ See the dairy trial ] [ Cancel ]`. The button is never silently disabled. |
| Elimination-load cap | proposing a 4th elimination | Sheet: *"You're already avoiding dairy, gluten and onion. Adding a fourth makes it very hard to tell which one matters — and hard to eat well. Want to bring one back first?"* `[ Reintroduce something ] [ Cancel ]` |
| Nutritional adequacy | proposal targets a whole food group | An inline note on the proposal screen naming the nutrients that group usually provides, and suggesting a dietitian conversation. Never a supplement recommendation. Not dismissible; it's part of the proposal. |
| Restriction-pattern watch | distinct foods/week down >40% from baseline | A card on Today, once, non-clinical: *"You're eating a narrower range than you used to. That's worth a thought — variety helps your gut and helps this app find things. Want to look at what you've dropped?"* `[ Show me ] [ Not now ]`. New elimination proposals are suppressed while active. |

### 9.6 Trial history *(screen did not exist)*

**Insights → Trials** (third segment: `Findings | Trends | Trials`). All trials, newest first, with status, target, verdict and dates. Tapping opens the verdict (or the live card for an active one). Completed trials offer `[ Run it again ]` — which creates an independent new trial, and whose verdict screen then shows both results side by side without pooling them.

### 9.7 The avoid list (D17)

**More → Avoid list.** Entries added from a verdict card or manually. Each entry: the food or tag, the reason (`trial confirmed` / `my choice`), the date, and `[ Remove ]`. Effects: meals containing it show a small marker when logged (never a warning or a scold), the engine won't re-propose a trial on it for 90 days, and it counts toward the elimination-load cap.

---

## 10. F9 — Safety flows

### 10.1 Red flag

**Placement:** top of Today, above everything including the score and any trial card. Also mirrored at the top of Timeline for the day it was raised.

**Copy** — this and the trial verdict strings are the only user-facing copy exempt from the causal-language lint, and both are fixed strings, not generated:

> **Worth getting checked**
> You logged blood in a bowel movement. That's something a doctor should look at — most causes are minor, but it isn't something to work out from an app.
> This won't affect anything else here.
> `[ I've got it ]`  `[ What triggered this ]`

- **`[ What triggered this ]`** opens a plain screen naming the observations that fired the rule, with links to them, and one sentence on why that criterion exists. It **never** names a condition, gives a probability, or suggests treatment.
- **`[ I've got it ]`** sets `acknowledged_at` via `POST /safety-flags/{id}/acknowledge` (synced, not local-only) and hides the banner for 7 days from the moment of dismissal.
- **A new qualifying observation during the suppression window re-shows it immediately.** Suppression is per-rule, not global.
- Red-flag events always appear in the clinician export.

### 10.2 The weight-loss rule (D22)

Fires on rate alone (≥5% in 90 days) and asks: *"Your weight is down 5% since May. Was that on purpose?"* `[ Yes, deliberate ]` suppresses the rule for 90 days. `[ No ]` shows the standard red-flag card. This is the only red flag with a question, because it is the only one where the same number means two entirely different things.

---

## 11. F10 / F11 — Settings and data

Every item below is a real screen; see `09-screen-inventory.md` for their controls.

```
MORE
  Account            profile · change passphrase · sessions · 2FA · log out
  Trackers           enable/disable · reorder · per-tracker settings · [ + Custom tracker ]
  Goal packs         active pack · preview · apply · remove
  Food library       → F5
  Avoid list         → F8.7
  Trials             → F8.6
  Recently deleted   30-day restore
  Reminders          per-type toggles · times · quiet hours · pause all · permission state
  Appearance         theme (System/Light/Dark) · language · units · day rollover · date format
  AI provider        provider per purpose · endpoint/key · vision on/off · [ Test connection ]
                     · the plain-language egress statement
  Data               export · exports history · import · retention · delete everything
  Security & keys    encryption status · what is and isn't encrypted, plainly ·
                     show recovery card (re-auth) · verify my backup card ·
                     when it was last shown · 2FA
  Server             address · connection status · storage used
  About              version · disclaimer · licences (incl. ODbL attribution) · open specs
```

### 11.1 Custom tracker builder (D15)

A guided builder, not a JSON editor: name (both locales) → icon → how often (once a day / many times / occasionally) → add fields (pick a type from the catalogue, label it, set its range or options) → declare each field's analysis role (`outcome` / `exposure` / `confounder` / `just for me`) with plain-language descriptions → preview the rendered sheet → save. Validated against the same meta-schema as shipped trackers. Editing a field that already has data forces a version bump and warns that old and new values will not be pooled.

### 11.2 Export

```
Data → Export
  Format   ○ JSON (everything)  ○ CSV (spreadsheet)  ● PDF for a doctor
  Range    [ last 90 days ▾ ]  or a custom range
  Language [ English ▾ ]        ← PDF only (D23)
  Include  ☑ photos (JSON only)  ☑ deleted entries
  [ Create export ]
    ↓ 202 → progress row → `export.completed` → toast [ Download ]
    ↓ also listed under Data → Exports for 7 days, then the file is purged
```

### 11.3 Import

```
Data → Import → file picker
  ↓ validate
  ├─ invalid/corrupt → error naming what failed, nothing changed
  └─ valid → REVIEW screen (modal, confirm-discard):
       "This archive has 1,240 entries from 12 Mar – 20 Aug."
       Into a non-empty account:
         1,180 new · 54 already here (identical) · 6 conflict
         Conflicts: ○ keep mine  ○ take theirs  ● ask me per item
       [ Import ]  [ Cancel ]
  ↓ progress with a live count, cancellable — cancelling rolls back the whole transaction
  ↓ result: "1,186 imported, 54 skipped." [ See what changed ]
```

Import is idempotent on `client_id`, so re-importing the same archive is a no-op.

### 11.3b Security & keys (D28)

```
Security & keys
  ● Encryption is on          xchacha20poly1305 · since 21 Aug 2026

  WHAT'S ENCRYPTED
  ✓ What you typed — meal descriptions, notes, reasons
  ✓ Your photos
  ✓ Your food library names
  ✗ Numbers — Bristol scores, severities, weights, times
    "The analysis has to read these. Someone with a copy of the
     database would see the shape of your data, not your words."

  YOUR RECOVERY CARD
  Last shown: never
  [ Show the card ]        ← re-auth, rate-limited, logged
  [ Check my saved card ]  ← paste it back, confirms it still works

  ⓘ Keep it off this server and away from your backups.
```

**Show the card** → re-authenticate → the card renders as selectable text with a `Copy` button, a `Print` button, and a warning that it is now in the clipboard. It is never offered as a file download. Closing the screen clears it from memory.

**Check my saved card** exists because an unverified backup key is the same failure mode as an untested backup: you find out at the worst possible moment. The app nudges the user to run this once, a week after setup, and never again unless the key rotates.

### 11.4 Delete everything (D25)

Modal. Lists exactly what will go, states there is no grace period and no backup, offers `[ Export first ]` as the adjacent action, requires re-authentication and typing `DELETE`. Completes in under 60 s and returns to first-run.

---

## 12. F12 — Notifications

### 12.1 Permission

Never requested on first launch. Requested at onboarding step ⑥ only after the user opts in, preceded by a priming screen explaining exactly what will be sent. On denial: reminders silently fall back to in-app cards on Today, and the Reminders screen shows *"Notifications are blocked in your browser. Reminders will show in the app instead. [ How to turn them on ]"*.

### 12.2 Delivery (D16)

Web Push with self-hosted VAPID keys. Subscriptions in `push_subscription` (endpoint, keys, device label, created_at). A failed push (410/404) removes the subscription silently.

### 12.3 Copy

Notification bodies are deliberately vague on the lock screen, because this is health data:

| Trigger | Title | Body |
|---|---|---|
| Evening check-in | FoodTrack | *"Two minutes to close out the day?"* |
| Meal nudge | FoodTrack | *"Did you eat around noon?"* |
| Trial daily | FoodTrack | *"Day 6 of your trial."* |
| Weekly insight | FoodTrack | *"Something new to look at this week."* |
| Red flag | — | **Never pushed.** In-app only. |

Both locales specified in the locale files; no notification body ever names a symptom, a food, or a finding.

### 12.4 In-app notification centre

Because red flags are never pushed and pushes can be missed, Today carries an **Inbox** row when there is anything unread: red flags, completed analyses, finished trials, failed uploads, and export-ready notices. Read items disappear after 7 days.

---

## 13. F13 — The error catalogue

Every error a user can reach, its copy pattern, and its recovery. Pattern: **what happened → what was preserved → what to do**. No error message is ever only "Something went wrong".

| Error | Where | Copy and recovery |
|---|---|---|
| Server unreachable | any request | Offline badge. *"Can't reach your server. Everything you do is saved here and will sync."* Auto-retry with backoff. |
| Session expired | any request | Unlock sheet over the current screen (§3.2). Nothing lost. |
| Lockout | unlock | Countdown, attempts used, persists across restarts. |
| Validation rejected | save | Inline on the offending field, naming the rule. Save stays possible after correction. |
| Parse timeout | meal | Degraded chip, background retry. Never blocking. |
| Vision unavailable | photo meal | *"Couldn't read the photo. It's saved — add a description?"* |
| LLM misconfigured | any AI call | A row in Today's inbox + a red state on the AI provider screen: *"Your AI provider isn't answering. Meals are being saved as you write them. [ Check settings ]"*. Consumes `/health/ready`, so a bad key can't degrade silently forever. |
| Analysis service down | insights | *"Can't run the analysis right now — your data is fine. [ Try again ]"*. Shows the last completed run's results, clearly dated. |
| Media upload failed permanently | after 24 h of retries | Inbox row + `⚠` on the thumbnail. `[ Retry ] [ Remove it ]`. Never silent. |
| Storage quota | any local write | §7.4. Entries never dropped. |
| Sync conflict, user-visible field | after a push | Toast + revision history (§7.2). |
| Full resync required | 410 | §7.3 modal. |
| Import failed | import | Names the failing record and its line; nothing was applied. |
| Export failed | export job | Row in Exports with the reason and `[ Try again ]`. |
| Rate limited | analysis / AI | Plain: *"Give it a minute."* with the retry time, never a raw 429. |
| Cold start, no cache, no network | launch | §7.5. |
| Unsupported browser | launch | Names what's missing (IndexedDB / service worker) and what still works. |

---

## 14. Flow coverage checklist

Implementation is complete when each of these can be walked end to end, in both locales, online and offline:

- [ ] Onboarding → day-one Today → first meal → first stool → first check-in
- [ ] Every enabled tracker reachable within two taps of Today
- [ ] Meal by text · by photo · by favourite · by repeat · by voice
- [ ] Correct a parsed item → the correction is remembered next time
- [ ] Edit · delete · undo · restore from Recently deleted
- [ ] Backdate an entry across the day rollover; watch the rollup and the trial day update
- [ ] Split a meal; merge two meals
- [ ] Go offline → log five things → restart the app → reconnect → verify exactly five rows
- [ ] Force a conflict from two devices → see the revision history
- [ ] Run an analysis → drill into an insight → open the days behind it → open one of those days
- [ ] Start a trial → slip → extend → challenge → verdict → add to the avoid list
- [ ] Pause, resume, stop early, and abandon a trial
- [ ] Hit every guardrail refusal deliberately
- [ ] Trigger a red flag → acknowledge it → trigger it again inside the suppression window
- [ ] Export each format; import the JSON into a clean instance and compare
- [ ] Create a custom tracker from the UI and log to it
- [ ] Deny notification permission and confirm reminders degrade to in-app
- [ ] Delete the account

---

## 15. Addendum v1.7 — flows for D32–D46

### 15.1 Design D — blinded challenge

Design D appears in the proposal only when `blinding.available` is true (`03` §17.1). When it is false the proposal is Design A–C and carries an open-label banner. **`available: false` is never an error and never blocks a trial** — a user whose suspect is onion must not be stuck.

**The proposal screen gains a design row:**

```
┌───────────────────────────────────────────────┐
│  How we'll test lactose                       │
│                                               │
│  ● Blinded challenge          RECOMMENDED     │
│    You won't know which weeks are the real    │
│    thing. Neither will your gut.              │
│    Needs 15 minutes of prep with capsules.    │
│                                               │
│  ○ Open challenge                             │
│    Simpler. You'll know what you're taking —  │
│    which does affect how you rate days.       │
│                                               │
│  [ Why does this matter? ]                    │
└───────────────────────────────────────────────┘
```

`[ Why does this matter? ]` opens a sheet with the one number that justifies the whole feature: *"In a trial where people didn't know what they were taking, an inert placebo powder triggered symptoms in 26% of them. About one in four 'confirmed triggers' found without blinding is false. This is why we offer to hide it from you."* Plain, sourced, and it never says "you are wrong".

**Prep flow (S127–S130).** Four steps, each with a printable checklist:

1. **What you need** — empty capsules, the agent, the control, envelopes, a marker. Quantities computed from the period count. `[ I have everything ]` / `[ Remind me tomorrow ]`.
2. **Fill** — how many capsules of each, illustrated. The agent and control must be visually identical; if the user reports they aren't, the flow offers `powder_in_water` as a fallback vehicle.
3. **Pack and label** — one envelope per period, labelled `A1 … An` from `GET /trials/{id}/schedule`. **The app never shows what is in which envelope**, and the screen says so explicitly so the user doesn't hunt for it.
4. **Confirm sealed** — `[ They're sealed ]` calls `POST /trials/{id}/allocation`, which is the point of no return for the sequence. A typed confirmation, not a tap.

**Abandoning a blinded trial still reveals.** The reveal screen is reachable from an abandoned Design D — otherwise the user is left holding envelopes they can never interpret, which is both useless and slightly cruel.

**Unsaved-work behaviour:** the prep flow is **resumable** (`08` §1.2 category 2). Closing it mid-way keeps progress and shows `[ Finish setting up ]` on the trial card.

### 15.2 The guess prompt (D33)

Fires at the end of every challenge period, in **every** design. One card, three taps maximum:

```
┌───────────────────────────────────────────────┐
│  Week 2 is done. Before we move on —          │
│                                               │
│  What do you think was in envelope A2?        │
│                                               │
│   [ The real thing ]  [ The blank ]  [ No idea ] │
│                                               │
│  How sure?   ○ ○ ● ○ ○                        │
│                                               │
│  There's no wrong answer. We compare your     │
│  guesses to what was actually in there —      │
│  that's part of the result.                   │
└───────────────────────────────────────────────┘
```

For an **open-label** trial the wording changes but the prompt does not disappear: *"You knew this was the real thing. How much do you think that affected how you rated the week?"* with the same five-point scale. This is the expectation-effect measurement and skipping it is not offered.

`[ No idea ]` is a first-class answer, weighted as such, never nagged.

**Timing:** the prompt is queued for the period-end rollover and surfaces on next open. It cannot be answered after `revealed_at` (`03` §17.2 returns `409`), and the client hides it rather than showing a control that will fail.

### 15.3 Reveal and the verdict (D32, D33)

`[ Reveal ]` requires a typed confirmation because it is irreversible. The verdict card then gains two blocks:

```
  WHAT WAS IN THE ENVELOPES
  A1 blank · A2 lactose · A3 lactose · A4 blank

  YOUR GUESSES
  You guessed right 3 times out of 4.
  Chance alone would get about 2.
  ⚠ Your results look different depending on
    whether we group by what you got or by what
    you thought you got. That weakens the finding.
    [ What this means ]
```

The divergence warning renders only when `blinding-report.diverges` is true — the server decides, not the client. When it is true the headline verdict is **downgraded one confidence tier**, and the card says why.

### 15.4 Washout that waits for you (D37)

The washout card becomes conditional rather than a countdown:

```
WASHOUT   "Still no dairy. Waiting for things to settle
           before the next challenge."
           Day 5 · usually 3
           Your gut score is 61; we're waiting for 70+.
           [ What am I waiting for? ]
```

At the 10-day cap (`recommendation: review`) the card changes to a decision, never an auto-advance:

> *"It's been 10 days and things haven't settled back to where they were. That happens, and it usually means something other than dairy is going on. What would you like to do?"*
> `[ Start the challenge anyway ]` · `[ Give it another week ]` · `[ Stop the trial ]`

`[ Start the challenge anyway ]` requires a reason and records a **protocol deviation** that appears in the trial report (D44). The user is allowed to override; the record is not.

### 15.5 Transit measurement (D36) — S131–S133

Entry points: Insights ("How fast is your gut?"), the trial proposal when lag matters, and Settings → Trackers.

1. **S131 Explain and start** — what it is, what it costs (blue food colouring), what it buys (*"so I stop guessing which meal to blame"*). `[ Start now ]` · `[ Not now ]`. Carries the Ianiro caveat: not validated against reference methods, and not for unsupervised use with a diagnosed digestive condition.
2. **S132 In progress** — a live "started 14 h ago" card pinned to Home with `[ I saw it ]` and `[ Give up on this one ]`. The stool quick-log gains a temporary **`Blue?`** toggle so the measurement closes from the existing one-tap path rather than a separate screen.
3. **S133 Result** — `"About 26 hours. Typical is around 28."` plus progress toward three: *"2 of 3 — I'm still using the typical timing until I've seen a third."*

Auto-abandon at 96 h produces a neutral note, never a failure state: *"I didn't hear back on that one, so I've closed it. Want to try again?"*

### 15.6 Event markers (D41) — S134

Reachable from the day view header (`+ Something happened`) and from Settings. Kind chips: `Antibiotics · Travel · Illness · Cycle · Procedure · Other`, plus an optional label and a start/end.

Where an insight or verdict overlaps a marker, the evidence card says so **without adjusting the number**:

> *"Heads up: 6 of the 14 dairy days fell during your antibiotics course. That could be doing some of this."*  `[ Exclude those days and recalculate ]`

Recalculating is a user action, never automatic — silently dropping a third of someone's data is exactly the kind of invisible decision this app exists to avoid.

### 15.7 The null verdict (D38) — S135

Reached from a completed trial whose posterior lands inside the ROPE, and from the Insights tab when the whole run finds nothing.

```
┌───────────────────────────────────────────────┐
│  Dairy is probably fine for you.              │
│                                               │
│  Over 30 days, 12 challenge servings and      │
│  41 logged days, dairy made no difference     │
│  we can measure to your gut score.            │
│                                               │
│  That's a real answer, not a failed test.     │
│                                               │
│  What this rules out ▾                        │
│  What it doesn't ▾                            │
│                                               │
│  [ Take dairy off the suspect list ]          │
│  [ Test something else ]                      │
│  [ Retest in 6 months ]                       │
└───────────────────────────────────────────────┘
```

Same visual weight as a positive finding: same card size, same typography, no greyed-out treatment. *"What it doesn't"* is mandatory and names the honest limits — a small effect could still be there, and a different dose or a different day might differ.

**The Insights-wide null** is the harder case and it must exist:

> *"Six weeks in, nothing stands out. I've tested 340 food–outcome combinations and none survives the check I apply. That's more common than the apps suggest, and it's worth knowing. Here's what tends to help next: [ Widen what you log ] · [ Test a suspect properly ] · [ Check your transit time ]."*

### 15.8 Portion precision (D35) and invisible ingredients (D39)

On the meal review step, each item's portion chip carries its tier, tappable to upgrade:

```
  חומוס  ·  ~3 כפות  ·  Estimate ▾
                        Accurate — I weighed it
                        Approximate — I measured roughly
                        Estimate — I'm guessing
```

Below the items, a single prompt row, dismissible and never modal:

```
  Anything invisible in there?
  [ + oil ]  [ + butter ]  [ + sauce ]  [ + dressing ]
```

Frequency-ordered per user; dismissing it for a food suppresses it for that food for 30 days. **A photo cannot see fat, and fat is a primary trigger** — this row exists because a missing confounder is worse than a rough one.

### 15.9 Ingredient decomposition in the UI (D34)

A composite food's detail view lists its components with a `via` explanation on every inherited tag:

> `שקשוקה` → *contains fructans* — **via onion, garlic**  `[ Not in mine ]`

`[ Not in mine ]` forks a personal copy of the food with that component removed, scoped to this user. It never edits the shared canonical food. This is the single most important control in the feature: the moment a user sees a tag they disagree with and cannot change, they stop trusting every other tag.

### 15.10 Error additions to the §13 catalogue

| Error | What the user sees | What is preserved |
|---|---|---|
| Reveal attempted before periods complete | *"Two weeks still to go. Revealing now would waste the trial."* + the remaining dates | Everything; the button is disabled with this text adjacent, never bare |
| Guess submitted after reveal | Prompt is not shown at all | n/a — prevented, not errored |
| Component cycle on save | *"That would make shakshuka an ingredient of itself."* + the offending path | The whole edit, in the form |
| Transit marker never seen | *"I didn't hear back on that one, so I've closed it."* | The measurement, marked abandoned |
| Blinding unavailable for target | Inline on the proposal: *"Onion can't be hidden in a capsule, so this one is an open test."* | The proposal, as Design A–C |
