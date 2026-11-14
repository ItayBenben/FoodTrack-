# FoodTrack — Screen & Control Inventory

Version 1.3 · 2026-08-21

The completeness checklist. Every screen, every control on it, what the control does, and where it goes. If a control is not in this document, it does not exist; if a screen in this document has no build, the build is incomplete.

**Reading the tables:** `→` means "navigates to". `⟳` means "stays here and changes state". `⇢` means "starts a background job". Every screen states its unsaved-work behaviour per `08` §1.2.

**Totals:** 52 screens · 10 sheets · 6 modals · 4 tabs.

---

## Index

| # | Screen | Type | Doc |
|---|---|---|---|
| S01–S09 | Onboarding | modal | `08` §2 |
| S10–S17 | Auth | modal / screen | `08` §3 |
| S20–S23 | Today & capture entry | tab | `08` §4 |
| S24–S36 | Capture sheets, one per tracker | sheet | `08` §4 |
| S40–S46 | Entry detail, edit, history | screen | `08` §5 |
| S50–S55 | Food library | screen | `08` §6 |
| S60–S63 | Timeline | tab | `08` §5 |
| S70–S79 | Insights, evidence, charts | tab | `08` §8 |
| S80–S89 | Trials | screen | `08` §9 |
| S90–S92 | Safety | banner / screen | `08` §10 |
| S100–S119 | Settings and data | screen | `08` §11–12 |
| S120–S126 | System states | overlay | `08` §7, §13 |

---

## Onboarding — S01–S09

| ID | Screen | Controls | Action |
|---|---|---|---|
| S01 | Welcome | `Get started` | → S02 |
| | | `I have an export to import` | → S115 (import) |
| | | `עברית / English` toggle | ⟳ re-render |
| S02 | Goal | 4 goal rows (single-select) | ⟳ selects pack |
| | | `Continue` · `Skip` | → S03 (Skip applies gut-health) |
| S03 | Tracker picker | one checkbox row per tracker, grouped | ⟳ |
| | | `Continue` (always enabled) | → S04 |
| S04 | About you | year of birth ▾ · sex ▾ · height · weight | ⟳ autosave |
| | | `Continue` · `Skip all` | → S05 |
| S05 | Your day | timezone ▾ · rollover ▾ · unit toggles ×3 | ⟳ |
| | | `Continue` | → S06 |
| S06 | Reminders | check-in toggle + time ▾ · meal nudge toggle · quiet hours range | ⟳ |
| | | `Turn on reminders` | → S07 via permission prompt (S07 first if denied) |
| | | `Not now` | → S07 |
| S07 | Set passphrase | passphrase · confirm · 👁 reveal · strength meter | ⟳ |
| | | `Set passphrase` (enabled at ≥10 chars & match) | → S08 |
| S08 | Install | `Install` (if prompt available) or illustrated iOS steps · `Later` | → S09 |
| S09 | Done | auto-advance after 1.2 s | → S20 |

*Unsaved-work: autosaved per step. Back arrow present on S03–S08. Quitting resumes at the first incomplete step.*

---

## Auth — S10–S17

| ID | Screen | Controls | Action |
|---|---|---|---|
| S10 | Unlock | passphrase · 👁 · `Unlock` · `Use biometrics` (conditional) · `Forgot?` | → S20 / → S12 |
| S11 | Lockout | live countdown, attempts used | ⟳ auto-clears |
| S12 | Forgot passphrase | the reset command · `Copy the command` · `I can't reach the server` → S12b · `Back` | ⟳ |
| S12b | Can't reach the server | honest explanation, no wipe offered, `Back` | ⟳ |
| S12c | Set a new passphrase | reached by the one-time link · new · confirm · `Set passphrase` | → S20 |
| S13 | Login (multi-user) | email · password · `Log in` · `Continue with SSO` · `Register` | → S20 / → S14 |
| S14 | Register | email · password · confirm · `Create account` | → S02 |
| S15 | TOTP challenge | 6-digit field · `Use a recovery code` · `Verify` | → S20 |
| S16 | TOTP setup | QR · secret · verify field · recovery codes · `I've saved these` | → S100 |
| S17 | Logout guard | pending count · `Sync now and log out` · `Retry failed` · `Discard N` (typed) · `Cancel` | ⇢ → S10 |

---

## Today and capture entry — S20–S23

### S20 — Today *(tab 1)*

| Region | Control | Action |
|---|---|---|
| Header | date | ⟳ nothing (label) |
| | sync status chip | → S120 sync sheet |
| | inbox badge (conditional) | → S23 |
| Banners | red-flag banner (conditional) | → S91 / ⟳ acknowledge |
| | restriction-watch card (conditional) | → S79 / ⟳ dismiss |
| | draft row (conditional) | → resume the draft's sheet / ⟳ discard + undo |
| | trial phase card (conditional) | → S82; inline `I slipped`, `Done`, `Skip`, `Resume` |
| Score | score card | → S77 breakdown |
| | expand ⌄ | ⟳ inline components |
| Quick log | tiles ×4 (user-chosen) | → the matching capture sheet |
| | `⋯ More` tile (when >4 enabled) | → S22 tracker picker |
| Hydration | `–` / count / `+` (when enabled) | ⟳ writes immediately / → S31 |
| Usual | 2 quick-repeat tiles | ⟳ saves immediately + toast `Edit · Undo` |
| Today so far | event rows | → S40 detail; long-press → S41 actions |
| Check-in | `How was today?` (after the set hour) | → S27 |
| FAB | tap | → S24 meal composer |
| | long-press | → S21 radial |
| Tabs | Today · Timeline · Insights · More | → S20 / S60 / S70 / S100 |

*Empty state: `08` §2.2. Loading: skeleton score + tiles. Offline: badge only.*

| ID | Screen | Controls |
|---|---|---|
| S21 | FAB radial | top-4 tracker arcs + `⋯` → S22; tap-outside dismisses |
| S22 | Tracker picker sheet | search (when >10) · one row per enabled tracker, ordered by your frequency · `Manage trackers` → S103 |
| S23 | Inbox | unread rows (red flag, analysis done, trial done, upload failed, export ready) · `Mark all read` · row tap → the relevant screen |

---

## Capture sheets — S24–S36

### S24 — Meal composer *(draft-kept)*

| Control | Action |
|---|---|
| `✕` | ⟳ keeps draft, toast `Draft kept · Undo` |
| timestamp `[ Today · 13:05 ▾ ]` | ⟳ expands day strip + time wheel; `Set` collapses |
| textarea | ⟳ debounced parse at 600 ms |
| 🎤 mic | ⟳ live transcript (hidden if no speech API) |
| `📷 Photo` | → S25 source sheet |
| `★ Favourites` | → S26 |
| `↻ Repeat last` | ⟳ loads an editable draft |
| parsed row — name | → S28 item editor |
| parsed row — `?` chip | → S28 opened on alternatives |
| parsed row — qty `▾` | ⟳ popover: stepper · unit ▾ · 3 shortcuts from your history |
| parsed row — `✕` | ⟳ remove + undo toast |
| `+ add item` | ⟳ appends a row focused on search |
| photo thumbnails | long-press → `Retake · Remove · View full` |
| tag chips · `+` | ⟳ chip picker + free text |
| `Save` | ⟳ writes locally, closes ≤100 ms |

*States: parsing (spinner + "reading what you wrote") · degraded ("still tidying this up") · offline ("saved as you wrote it") · zero items (row shows `Needs a moment` + `Parse now`).*

| ID | Screen | Controls |
|---|---|---|
| S25 | Photo source | `Camera` · `Choose from library` · `Cancel` |
| S25b | Photo preview | `Retake` · `Use photo` · `Cancel` |
| S26 | Favourites | search · most-logged rows · long-press → `Pin · Rename · Remove` |
| S28 | Item editor | raw text shown · search field · 5 alternatives with match reason · `Create "«text»"` → S52 · `Use this` (writes `user_food.alias`) |
| S28b | **Clarify** *(tier 3 only)* | the original text · up to 3 options **from your own history at this hour**, each with its frequency · `Something else — I'll type it` (refocuses the field, text intact) · `I really don't remember` (saves `unspecified`) · empty-history variant shows a detail-level hint instead of options |

### S27 — Evening check-in *(autosaved)*

| Control | Action |
|---|---|
| `✕` | ⟳ keeps touched values, no prompt |
| energy · mood scales (5-point radiogroup) | ⟳ |
| sleep duration ▾ · sleep quality scale | ⟳ |
| `+ add stress` | ⟳ reveals the stress scale |
| `Nothing to report` | ⟳ writes `all_clear`, closes |
| `Done` | ⟳ writes, closes |

### S29 — Stool *(autosaved)*

| Control | Action |
|---|---|
| `✕` | ⟳ closes (present from open) |
| timestamp | ⟳ as §1.4 |
| Bristol tiles ×7 | ⟳ **saves on tap**; a second tap on a different tile updates the same record |
| urgency 0–4 segmented | ⟳ |
| `Complete` · `Pain` · `Blood` · `Mucus` chips | ⟳ (Blood → S90 after save) |
| colour ▾ | ⟳ (black/red → S90) |
| note | ⟳ |
| duplicate prompt (conditional) | `Another` · `Fix that one` → S42 |

*The extras row auto-dismisses at 3 s; any interaction cancels the timer. Disabled in edit mode.*

### S30 — Symptom *(draft-kept)*

| Control | Action |
|---|---|
| symptom chips (multi-select, incl. Fever and Can't keep fluids down) | ⟳ adds/removes a block |
| per block: severity 0–10 · `Started ▾` · `Lasted ▾` · `Where` (body map, pain only) | ⟳ |
| `+` custom symptom | → S103 add-option flow |
| `Save` | ⟳ one observation per symptom, shared `group_id` |

| ID | Sheet | Controls |
|---|---|---|
| S31 | Hydration | volume ▾ · container ▾ · timestamp · `Save` · `–`/`+` |
| S32 | Weight & body | large numeric field (prefilled with last) · `±0.1` steppers · unit ▾ · trend sparkline · `+ Add waist, body fat or blood pressure` (expands) · `Save` |
| S33 | Medication | your list (tap logs, long-press → S34) · `+ Add` → S34 · ad-hoc name/dose/unit · scheduled-today checkboxes · `Save` · antibiotic prompt on save |
| S34 | Medication editor | name · dose · unit ▾ · class ▾ (`antibiotic`/`nsaid`/`ppi`/`probiotic`/`fibre`/`other`/`not sure`) · schedule times · days · start/end · `Archive` · `Save` |
| S35 | Supplement | as S33, different tracker key |
| S36 | Exercise | type chips · duration ▾ · intensity 3-way · note · `Save` |
| S37 | Note | textarea · photo · timestamp · `Save` |

---

## Entry detail and editing — S40–S46

| ID | Screen | Controls | Action |
|---|---|---|---|
| S40 | Entry detail | all fields read-only · photos · `Edit` · `⋯` | → S42 / → S41 |
| | | `History ⌄` | ⟳ reveals revisions |
| S41 | Row action sheet | `Edit` · `Log this again now` · `Duplicate` · `Change time` · `Delete` · `Split` (meals) | → S42 / ⟳ / → S43 |
| S42 | Edit mode | the tracker's own sheet, prefilled; primary reads `Save changes`; `Delete` at the bottom | ⟳ bumps revision |
| S43 | Split meal | item checkboxes · new timestamp · `Move 2 items to a new meal` · `Cancel` | ⟳ |
| S44 | Merge meals | (from timeline multi-select) target ▾ · preview of combined items · `Merge` | ⟳ |
| S45 | Revision history | one row per revision: who, when, what changed · `Use this value` on conflict rows | ⟳ |
| S46 | Recently deleted | grouped by day · `Restore` per row · `Delete permanently` · empty state | ⟳ |

---

## Food library — S50–S55

| ID | Screen | Controls |
|---|---|---|
| S50 | Library | search · sort ▾ · filter ▾ (all/mine/verified/needs review) · rows → S51 · `+ Add food` → S52 · `Review duplicates (3)` → S54 |
| S51 | Food detail | canonical name · aliases (add/remove) · category ▾ · default portion · nutrients (editable for user foods) · tags + citations · "logged N×" · `Merge into another food` → S53 · `Delete` (blocked if referenced → offers merge) |
| S52 | Add food | name (he/en) · category ▾ · default portion · nutrients (optional) · tags (optional) · `Save` |
| S53 | Merge | survivor picker · side-by-side comparison · "will rewrite N meal items" · typed confirm · `Merge` |
| S54 | Duplicate review | candidate pairs · `Merge` · `Not duplicates` (remembered) |
| S55 | Empty state | *"Your library fills itself as you log."* |

---

## Timeline — S60–S63

### S60 — Timeline *(tab 2)*

| Control | Action |
|---|---|
| search 🔍 | → S61 |
| filter ▾ (tracker, tag, has-photo, unsynced) | ⟳ |
| day header — score chip | → S77 |
| day header — `+` | → S22, prefilled to that day |
| event row — tap | → S40 |
| event row — long-press | → S41; long-press-and-hold-second-row → multi-select → `Merge` / `Delete` |
| row `↑` badge | → S120 |
| infinite scroll both directions | ⟳ |

| ID | Screen | Controls |
|---|---|---|
| S61 | Search | query field · scope chips (meals/notes/foods/tags) · results grouped by day · empty state |
| S62 | **Day view / day builder** *(autosaved when the day exists; Save when creating)* | slot rows (breakfast/lunch/dinner/snacks) each with an editable text field, inferred-time control with `~` marker, and parsed-item chips → S28 · `+ another meal` · multi-line paste distributor · "also that day" checklist with `+` per tracker · per-row `⋯` (`Edit · Duplicate · Change time · Move to another day · Delete`) · header `⋯` (`Add a meal · Copy this day to another date · Export this day · Delete everything from this day`) · day-weight row → explanation · `Save the day · N meals` (builder mode only) |
| S62b | Move to another day | date picker · warning that both days' rollups and any covering trial day will recompute · `Move` |
| S62c | Copy day to another date | date picker · `Copy meals only` / `Copy everything` · `Copy` |
| S63 | Timeline empty state | *"Nothing here yet. What you log shows up as a running history."* |

---

## Insights — S70–S79

### S70 — Insights *(tab 3)*

| Control | Action |
|---|---|
| segmented `Findings · Trends · Trials` | → S70 / S78 / S85 |
| meta row: "Based on N days" | → S79 completeness |
| `⟳` re-analyse | ⇢ run; ⟳ "Already running" / rate-limit copy |
| pattern-alert card (conditional) | → S71 / ⟳ dismiss 30 d |
| **Confirmed** section rows | → S86 verdict |
| **Worth testing** cards | → S71 evidence |
| card `Test this properly` | → S80 proposal (or a guardrail sheet S83/S84) |
| **Early signals** fold | ⟳ expand/collapse |
| **Ruled out** rows | → S86 |
| **Not enough data yet** rows | ⟳ shows the "N more days" explanation |

*Three distinct empty states per `08` §8.2. Running state: slim progress bar, list stays usable.*

| ID | Screen | Controls |
|---|---|---|
| S71 | Evidence card | confidence badge · comparison bars · effect + interval · adjusted-for chips · warning box · plain words · `See the N days behind this` → S72 · `Compare with previous run` (if superseded) → S73 · `Test this properly` → S80 · `Not interested` (⟳ dismiss) |
| S72 | Days behind this | filter ▾ (all/exposed/unexposed/outcome/excluded) · one row per day showing exposure, outcome, day weight and exclusion reason · row → S62 |
| S73 | Run comparison | this run vs. the previous, same pair, both effects and n |
| S77 | Score breakdown | component rows with their deductions · `How this is worked out` → S79b |
| S78 | Trends | chart list (Bristol distribution · symptom load · weight · score · fibre-vs-stool · logging completeness heatmap) · period ▾ (30d/90d/1y/all) · tap a point → S62 · long-press → export image |
| S79 | Data completeness | logged-days heatmap, average day weight, what's dragging it down, and what would improve it |
| S79b | How the score works | the weights, plainly, with the statement that they are our defaults and not a clinical measure |

---

## Trials — S80–S89

| ID | Screen | Controls | Action |
|---|---|---|---|
| S80 | Trial proposal | phase list · reuse-baseline toggle · total days · pre-registration lock box · logging requirement · nutritional-adequacy note (conditional) · `Adjust` → S81 · `Start trial` · `Not now` | ⟳ / → S82 |
| S81 | Adjust | editable: elimination length, reuse baseline, challenge doses, start date, primary outcome ▾, reminder time. Locked with reasons: minimum effect, minimum adherence, reintroduction required, target. `Apply` · `Cancel` (confirm-discard) | ⟳ |
| S82 | Active trial | phase strip with legend (adherent / slip / no data) · day counter · adherence % · `I slipped` → S87 · `Done` / `Skip` (challenge days) · `Pause` → S88 · `Stop early` → S89 · `Abandon` → S88 · note: no live estimate, and why | ⟳ |
| S83 | Guardrail: one trial | explanation · `See the dairy trial` → S82 · `Cancel` | ⟳ |
| S84 | Guardrail: elimination load | explanation · `Reintroduce something` → S110 avoid list · `Cancel` | ⟳ |
| S85 | Trial history | all trials newest first: status, target, verdict, dates · row → S82 or S86 | ⟳ |
| S86 | Verdict | verdict band · probability · key/value results · why it's convincing · **Limitations** (always) · `Add to my avoid list` → S110 · `Run it again` → S80 · `Share with my doctor` → S114 export | ⟳ |
| S87 | Log a slip | date picker · what happened (optional) · `Extend the trial by 2 days` toggle · `Save` | ⟳ |
| S88 | Pause / abandon | reason chips (`too hard` · `felt unwell` · `circumstances changed` · `lost interest` · `other`) · `Pause` or `Abandon` · `Cancel` | ⟳ |
| S89 | Stop early | *"You're on day 9 of 14. I can still give you a result, it'll just be less certain."* · `Stop and see the result` → S86 · `Keep going` | ⟳ |

---

## Safety — S90–S92

| ID | Element | Controls | Action |
|---|---|---|---|
| S90 | Red-flag banner | fixed copy · `I've got it` (⇢ acknowledge, 7-day suppression) · `What triggered this` → S91 | ⟳ |
| S91 | What triggered this | the observations that fired the rule, linked · one sentence on why the criterion exists · no condition names, no probabilities, no treatment | → S40 |
| S92 | Weight-loss question | *"Was that on purpose?"* · `Yes, deliberate` (90-day suppression) · `No` → S90 | ⟳ |

---

## Settings and data — S100–S119

| ID | Screen | Controls |
|---|---|---|
| S100 | More | section rows → S101–S119 · version footer |
| S101 | Account | display name · email (multi-user) · `Change passphrase` → S102 · `Two-factor` → S16 · `Active sessions` (revoke each) · `Log out` → S17 |
| S102 | Change passphrase | current · new · confirm · strength · `Change` (revokes other sessions) |
| S103 | Trackers | one row per tracker: toggle, drag handle, `›` → S104 · `+ Custom tracker` → S105 |
| S104 | Tracker settings | per-user overrides (quick-log slot, default values, reminder, units) · `Reset to defaults` |
| S105 | Custom tracker builder | name (he/en) · icon · cardinality ▾ · field list (`+ Add field` → type ▾, label, range/options) · analysis role per field with plain-language help · `Preview` · `Save` (confirm-discard) |
| S106 | Goal packs | active pack · `Preview` per pack (lists what it turns on) · `Apply` · `Remove` |
| S107 | Reminders | permission state row (+ `How to turn them on` when blocked) · per-type toggles and times · quiet hours range · `Pause all reminders` · test notification |
| S108 | Appearance & language | theme (System/Light/Dark) · language (עברית/English) · units ×3 · day rollover ▾ · date format ▾ · 12/24h |
| S109 | AI provider | provider per purpose (parse / vision / narrative) ▾ · endpoint · API key · vision on/off · `Test connection` (green/red result) · the plain-language egress statement · red banner when `/health/ready` reports it unreachable |
| S110 | Avoid list | rows: food/tag, reason, date, `Remove` · `+ Add` · empty state |
| S111 | Data | `Export` → S114 · `Exports` → S113 · `Import` → S115 · `Retention` → S112 · `Delete everything` → S119 |
| S112 | Retention | `Keep everything` (default) or `Delete data older than N months` ▾ · shows what would be removed before applying |
| S113 | Exports | past 7 days of exports: format, range, size, `Download`, `Delete` · failed rows show the reason and `Try again` |
| S114 | Create export | format radio (JSON / CSV / PDF for a doctor) · range ▾ · language ▾ (PDF) · include-photos · include-deleted · `Create export` ⇢ |
| S115 | Import — pick | file picker · `Cancel` |
| S116 | Import — review | counts (new / identical / conflicting) · conflict policy radio · `Import` · `Cancel` (confirm-discard) |
| S117 | Import — progress | live count · `Cancel` (rolls back the whole transaction) |
| S118 | Server | address · connection status · storage used · `Test connection` |
| S118b | Security & keys | encryption status row · what is/isn't encrypted (plain language) · `Show the card` → S118c · `Check my saved card` → S118d · last-shown date · `Two-factor` → S16 |
| S118c | Recovery card | re-auth gate, then the card as selectable text · `Copy` · `Print` · `Done` (clears it). No file download. |
| S118d | Verify card | paste field · `Check` · result: valid / does not match this instance |
| S119 | Delete everything | itemised list of what goes · *"No grace period. No backup."* · `Export first` → S114 · re-auth · type `DELETE` · `Delete permanently` |
| S119b | About | version · build · disclaimer · licences incl. Open Food Facts ODbL attribution · `Open the specs` |

---

## System states — S120–S126

| ID | Element | Controls |
|---|---|---|
| S120 | Sync sheet | pending count · last sync time · per-item rows with error and `Retry` · `Retry all now` |
| S121 | Full resync modal | progress `4,120 / 5,300` · `Do this later` (read-only from cache) |
| S122 | Storage full | usage breakdown · `Upload them now` · `Keep entries, drop queued photos` · `Free up space myself` |
| S123 | Cold start, no data | explanation · `Retry` · `Server settings` → S118 |
| S124 | Unsupported browser | names the missing capability and what still works |
| S125 | Conflict toast → sheet | `See both` → S45 |
| S126 | Undo toast | 8 s, one action, appears above the tab bar; never stacks more than one |


---

## Blinded trials, transit, events and nulls — S127–S137  *(v1.7, D32–D41)*

| # | Screen | Controls |
|---|---|---|
| S127 | Design D — prep step 1: what you need | shopping checklist (quantities computed from period count) · `Print this` · `I have everything` ⇢ · `Remind me tomorrow` |
| S128 | Prep step 2: fill the capsules | illustrated count per agent · `They look identical` / `They don't match` → offers `powder_in_water` fallback · `Next` ⇢ · `Back` |
| S129 | Prep step 3: pack and label | envelope labels `A1…An` with dates · explicit line *"I'm not going to tell you which is which"* · `Print labels` · `Next` ⇢ |
| S130 | Prep step 4: confirm sealed | typed confirmation (`SEALED`) · `They're sealed` ⇢ (calls `POST /allocation`; point of no return) · `Back` |
| S130b | Reveal | typed confirmation · `Reveal` ⇢ · `Not yet` · disabled-with-reason before all periods complete |
| S130c | Guess prompt | `The real thing` · `The blank` · `No idea` · 5-point confidence radiogroup · `Skip` **not offered** · reworded for open-label |
| S131 | Transit — explain and start | what/cost/benefit · Ianiro caveat · `Start now` ⇢ · `Not now` · `Read more` |
| S132 | Transit — in progress | elapsed counter · `I saw it` ⇢ · `Give up on this one` · pinned Home card + `Blue?` toggle injected into the stool quick-log |
| S133 | Transit — result | hours vs population median · progress `2 of 3` · `Measure again` · `Done` |
| S134 | Event marker | kind chips (antibiotics/travel/illness/cycle/procedure/other) · label · start · end (optional) · `Save` · `Delete` (undo toast) |
| S135 | Null verdict | headline · evidence counts · `What this rules out ▾` · `What it doesn't ▾` (mandatory) · `Take it off the suspect list` · `Test something else` · `Retest in 6 months` |
| S135b | Insights-wide null | combinations tested count · `Widen what you log` · `Test a suspect properly` · `Check your transit time` |
| S136 | Component editor | component rows with `fraction` · `+ Add ingredient` · `Not in mine` (forks a personal copy) · cycle/depth error inline · `Save` · `Cancel` (confirm-discard) |
| S137 | Trial report | preview · `Download PDF` · `Share with a clinician` · deviations section · `202` building state with progress |

Three control-level notes specific to this set, because each is a way the feature could be built wrong:

- **S129 must not have a "peek" affordance.** Not disabled, not hidden behind a confirm — absent. A control that reveals the allocation cannot exist in the client, because a control that exists will eventually be called.
- **S130c has no skip.** `No idea` is the escape hatch and it is a real, weighted answer. An unanswered guess is missing data; a skipped one is a hole in the sensitivity analysis.
- **S135 uses the positive-verdict card component**, not a muted variant. If a null renders as a lesser result, the product is telling the user their six weeks were wasted — which is the exact failure this screen exists to prevent.

---

## Control-level requirements that apply everywhere

1. **Minimum target 48 × 48 px**, ≥ 8 px apart. No exceptions, including the `✕` on sheets.
2. **Every control has a visible focus ring** (2 px accent, 2 px offset) and is reachable by keyboard in DOM order.
3. **No control is disabled without an adjacent explanation.** Where the audit found "silently disabled" as a possibility (the guardrails), the button stays enabled and explains on tap. A disabled control with no reason is a bug.
4. **Every destructive control has an undo** (toast) or a confirmation (typed, for the irreversible ones). Never both, never neither.
5. **Every async control has a busy state** that keeps its label and adds a spinner — never a label swap to "Loading…".
6. **Every icon-only control has an `aria-label`** in the active locale, and a tooltip on pointer devices.
7. **Every list has an empty state with an action**, never a bare "No items".
8. **Every screen has exactly one primary action**, at the bottom, full width, thumb-reachable.
9. **Scales are `role="radiogroup"`** with arrow-key support — never a drag slider.
10. **Direction-aware icons flip in RTL**; clocks, cameras and charts do not.

---

## Traceability

Every product feature ID from `01-product-spec.md` §3 maps to at least one screen here. The mapping is the acceptance test for "nothing is missing":

| Feature | Screens |
|---|---|
| C1 text meal · C14 voice | S24 |
| C2 photo | S24, S25, S25b |
| C3 quick-repeat | S20, S26 |
| C4 food library | S50–S55 |
| C5 stool | S29 |
| C6 symptom | S30 |
| C7 check-in | S27 |
| C8 weight & body | S32 |
| C9 hydration | S20, S31 |
| C10 meds, supplements, exercise | S33–S36 |
| C11 backdate & quick-edit | S41, S42, timestamp control everywhere |
| C12 offline capture | S120, S121, S122 |
| C13 barcode *(P3, deferred)* | — reserved in S52 |
| U1 timeline | S60–S63 |
| U2 daily score | S77, S79b |
| U3 association engine · U4 suspects · U5 narrative | S70, S71 |
| U6 trends | S78 |
| U7 pattern alerts | S70 |
| U8 clinician export | S114 |
| U9 data export/import | S111, S113–S117 |
| A1–A4 trials | S80–S89 |
| A5 red flags | S90–S92 |
| A6 reminders | S107, S23 |
| A7 goal packs | S106 |
| X1 tracker engine | S103–S105 |
| X2 multi-user | S13, S14, S101 |
| X3 i18n / RTL | S108 + every screen |
| X4 PWA install | S08 |
| X5 LLM provider | S109 |
| X6 accessibility | control-level requirements above |
| X7 audit log | S45 |
| C33 ingredient decomposition | S136, S52 |
| C34 portion precision | S24 review step, S25b |
| C35 invisible-ingredient prompt | S24 review step |
| C36 event markers | S134, day-view header |
| C37 transit measurement | S131–S133, S29 (`Blue?` toggle) |
| C38 full-day paste | S43b (day builder) |
| X20 Design D blinded challenge | S127–S130b |
| X21 blinding guess | S130c |
| X22 symptom-gated washout | S82 (trial card, conditional state) |
| X23 null verdict | S135, S135b |
| X27 trial report | S137 |

---

## Implementation map (build v1)

Where each screen lives in `apps/web`. Controls are as listed above unless noted.

| Screen | Route / component | Notes |
|---|---|---|
| Onboarding ①–⑦ | `components/onboarding.tsx` | ⑧ install and ⑨ done fold into first Today |
| Unlock, forgot, can't reach server | `components/unlock.tsx` | lockout countdown persists |
| Today | `app/(tabs)/today` | red flags, trial card, drafts, check-in prompt, score, quick grid, usual-for-now tiles, day-one card |
| Capture sheets | `components/capture.tsx`, `meal-composer.tsx` | chosen from the definition (quick pick / grouped / form / meal) |
| Tracker picker, sync sheet | `components/capture.tsx`, `components/sync.tsx` | |
| Timeline (+ day deep link) | `app/(tabs)/timeline` | `?day=` from the insight drill-down |
| Day builder | `app/(tabs)/more/day` | confirm-discard on leave |
| Insights, evidence card, drill-down | `app/(tabs)/insights`, `insights/[id]` | Findings · Trends · Trials segments |
| Trends | `app/(tabs)/insights/trends` | one chart per definition `charts` entry |
| Trials list, proposal, detail/verdict, Design D prep | `app/(tabs)/more/trials/*` | |
| Avoid list | `app/(tabs)/more/avoid` | |
| Trackers & packs, Food library, Recently deleted | `app/(tabs)/more/{trackers,foods,deleted}` | |
| Export & import, Clinician report | `app/(tabs)/more/export`, `app/report` | |
| Reminders, Security & encryption | `app/(tabs)/more/{reminders,security}` | |
| How this works | `app/(tabs)/more/how` | |
| Not yet built | custom tracker builder UI (API exists: `/me/trackers/custom`), TOTP enrolment UI (API exists), trial report PDF (D44) | |
