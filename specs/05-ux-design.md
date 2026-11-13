# FoodTrack — UX & UI Design Specification

Version 1.0 · 2026-08-21

---

## 1. Design thesis

Most health-tracking apps are built as **databases with a form on top**. FoodTrack is built as a **capture device with a database behind it**. The distinction shows up in every screen: the fastest possible action is always the most prominent one, and everything analytical lives one level down where it can afford to be dense.

Three constraints drive every decision:

1. **The 60-second budget** (D8). Every flow is measured in taps and seconds. If it exceeds budget, it gets cut down, not shipped.
2. **One-handed, on a phone, in a bathroom or a restaurant.** Thumb-reachable primary actions. Nothing critical in the top corners.
3. **RTL and LTR are equal citizens** (D9). Not a mirrored afterthought — the layout system has no concept of left or right.

---

## 2. Design system

### 2.1 Colour

A calm, clinical-but-warm palette. Deliberately **not** the green-tick wellness aesthetic — this app tells you uncomfortable truths sometimes, and the visual language should be trustworthy rather than cheerful.

```
/* Light */
--bg              #FBFAF8   /* warm off-white, easier than pure white at 6am */
--surface         #FFFFFF
--surface-sunken  #F2F0EC
--border          #E4E0D9
--text            #1C1A17
--text-muted      #6B6560
--accent          #3F6E5E   /* deep sage — primary actions */
--accent-soft     #E6EFEA
--warn            #B4762A   /* amber, for caution and low-confidence */
--danger          #A4383A   /* red flags only. Never for "bad" data. */
--info            #3A5B7A

/* Dark */
--bg              #14130F
--surface         #1E1C18
--surface-sunken  #100F0C
--border          #33302A
--text            #F2EFE9
--text-muted      #9C958C
--accent          #6FA891
--accent-soft     #22332C
--warn            #D69E52
--danger          #D96B6D
--info            #7BA3C9
```

**Semantic colour for outcomes — a deliberate rule:** stool and symptom values are *never* coloured red/green as good/bad. A Bristol 7 is information, not a failure. Outcome visualisations use a **neutral diverging scale** (dry amber ← neutral → wet blue) anchored at Bristol 4. Judgemental colour on your own body is how tracking apps become anxiety machines.

### 2.2 Typography

| Role | Font | Size / weight |
|---|---|---|
| Display | Inter (Latin) / Heebo (Hebrew) | 32 / 700, tight |
| Title | same | 22 / 600 |
| Body | same | 16 / 400, line-height 1.55 |
| Label | same | 13 / 500, letter-spacing 0.02em |
| Numeric | Inter with `tabular-nums` | varies |

Hebrew and Latin are paired at matched x-heights (Heebo and Inter are a good pair for this). Minimum body size 16 px — never smaller, both for accessibility and because iOS zooms inputs below 16 px.

### 2.3 Spacing, shape, motion

- 4 px base scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- Radii: `8` (chips/inputs), `16` (cards), `28` (sheets), `999` (pills).
- Elevation via a single soft shadow plus a border. No heavy Material shadows.
- Motion: 150 ms for state, 250 ms for sheets, `cubic-bezier(.2,.8,.2,1)`. All motion respects `prefers-reduced-motion` — and reduced motion means *removed*, not shortened.
- **Touch targets ≥ 48 × 48 px**, with ≥ 8 px between adjacent targets. Non-negotiable for one-handed use.

### 2.4 RTL rules (enforced by lint)

- Only logical properties: `margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `text-align: start`.
- No `left` / `right` / `margin-left` / `ml-*` anywhere. Tailwind: `ps-*` / `pe-*` / `ms-*` / `me-*` only.
- Icons that imply direction (back, next, trend arrows) flip via a `[dir=rtl]` transform; icons that don't (clock, camera, chart) never flip.
- Every user-content string renders with `dir="auto"` so a Latin brand name inside Hebrew text behaves.
- Charts: the time axis runs **right-to-left in Hebrew**. This surprises people but it is correct, and reading a timeline backwards is worse.

### 2.5 Components inventory

`Button` (primary/secondary/ghost/danger) · `Chip` (selectable/removable) · `SegmentedScale` (the tap-not-drag 0–10 control) · `TileGrid` (Bristol picker, quick-repeat) · `Sheet` (bottom, 3 detents) · `Card` · `EvidenceCard` · `StatTile` · `Sparkline` · `TimelineRow` · `EmptyState` · `SyncBadge` · `ConfidenceBadge` · `PhaseStrip` (trial progress) · `Toast` · `RedFlagBanner` · `NumberStepper` · `TimePicker` · `BodyMap` · `FoodItemRow`.

---

## 3. Information architecture

```
┌─ Tab bar (4 tabs, thumb zone) ────────────────────────────┐
│  Today        Timeline       Insights       More          │
└───────────────────────────────────────────────────────────┘

Today      → the capture surface. Everything you might log, right now.
Timeline   → chronological history, scrub + edit + search.
Insights   → suspects, evidence, trials, trends, score.
More       → trackers, settings, export, food library, account.

Floating over all tabs: the [+] capture button, thumb-reachable,
long-press for a radial quick menu (meal / stool / symptom / weight).
```

Deliberately flat. Four tabs, one FAB, nothing nested more than two levels deep.

---

## 4. Screens

### 4.1 Today

The single most important screen. It answers "what should I tap right now?"

```
┌──────────────────────────────────────────────────────┐
│  Thursday, 21 August              ⟳ synced   ⚙︎      │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Gut day so far          78 / 100          ⌄    │ │
│  │  ▁▂▄▆▇▆▄▂  last 7 days                          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  QUICK LOG                                            │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐            │
│  │  💩   │ │  🍽   │ │  😣   │ │  ⚖️   │            │
│  │ Stool │ │ Meal  │ │Symptom│ │Weight │            │
│  └───────┘ └───────┘ └───────┘ └───────┘            │
│                                                       │
│  USUAL FOR THIS TIME                                  │
│  ┌──────────────────┐ ┌──────────────────┐          │
│  │ ☕ Coffee + milk  │ │ 🥪 Toast, avocado │          │
│  │ logged 34×        │ │ logged 21×        │          │
│  └──────────────────┘ └──────────────────┘          │
│                                                       │
│  TODAY SO FAR                                         │
│  08:12  ☕ Coffee with milk                     ⋯    │
│  09:40  💩 Bristol 4 · normal                   ⋯    │
│  13:05  🍽 Pita, hummus, salad, iced coffee     ⋯    │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  🧪 Dairy trial · Day 6 of 14                   │ │
│  │  ●●●●●●○○○○○○○○   on track                     │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│                                        ╭───╮         │
│                                        │ + │         │
│                                        ╰───╯         │
└──────────────────────────────────────────────────────┘
```

**Behaviour notes**
- "Usual for this time" tiles are computed from the user's own history in a ±90-minute window around now. At 08:00 they're breakfast; at 20:00 they're dinner. This is the single highest-leverage feature for the 60-second budget — after three weeks most logs become one tap.
- The score card is collapsed by default; expanding shows its components with their weights.
- After the check-in hour, the evening check-in card takes the top slot, above the score.
- Empty state (day 1): the quick-log grid stays, the score card is replaced by "Log a few days and I'll start looking for patterns — I need about 3 weeks before I can say anything useful." Honest, and sets the right expectation.

### 4.2 Meal composer

```
┌──────────────────────────────────────────────────────┐
│  ✕                  Log a meal              13:05 ▾  │
├──────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────┬───┐ │
│  │ פיתה עם חומוס, סלט ירקות וקפה הפוך         │ 🎤│ │
│  └─────────────────────────────────────────────┴───┘ │
│  📷 Photo    ⭐ Favourites    🔁 Repeat last          │
│                                                       │
│  ─── parsed ──────────────────────  ⟳ updating       │
│  🫓  פיתה                    1 יחידה   ▾        ✕    │
│  🥣  חומוס                   3 כפות    ▾        ✕    │
│  🥗  סלט ירקות               1 קערה    ▾        ✕    │
│  ☕  קפה הפוך                1 כוס     ▾        ✕    │
│  ┊  + add item                                       │
│                                                       │
│  Tags   [ lunch ]  [ home ]  [ + ]                    │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │                    Save                          │ │
│  └─────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- The text field is focused with the keyboard up when the sheet opens. No tap needed.
- Parsing is debounced 600 ms and streams rows in as they resolve. The user can hit Save mid-parse; parsing continues server-side.
- Low-confidence rows: dotted underline + a subtle `?`. Tapping opens alternatives. They save either way.
- Quantity is a `▾` dropdown pre-set to the user's median portion — one tap to change, zero taps if it's right.
- **Save is always enabled.** Even with an empty parse, an empty text field, nothing. There is no invalid state; a bare timestamp is still data.

### 4.3 Stool sheet — the 8-second flow

```
┌──────────────────────────────────────────────────────┐
│                    Bowel movement          09:40 ▾   │
├──────────────────────────────────────────────────────┤
│   ┌────┐  ┌────┐  ┌────┐  ┌────┐                    │
│   │ ●● │  │ ▰▰ │  │ ▰▰ │  │ ▬▬ │                    │
│   │ 1  │  │ 2  │  │ 3  │  │ 4  │  ← illustrated,    │
│   └────┘  └────┘  └────┘  └────┘     not emoji      │
│   hard    lumpy   cracked  smooth                    │
│   ┌────┐  ┌────┐  ┌────┐                            │
│   │ ▪▪ │  │ ░░ │  │ ~~ │      Type 4 is the         │
│   │ 5  │  │ 6  │  │ 7  │      middle of normal      │
│   └────┘  └────┘  └────┘                            │
│   soft    mushy   liquid                             │
│                                                       │
│   ─── saved ✓  add more?  (closing in 3…) ────────   │
│   Urgency   ○ ○ ● ○ ○                                │
│   Complete ▢    Pain ▢    Blood ▢    Mucus ▢         │
└──────────────────────────────────────────────────────┘
```

- Tapping a tile **saves immediately** and shows a checkmark. No confirm button exists.
- The extras row appears after saving, with a 3-second auto-dismiss shown as a thin progress line. Interacting cancels the dismiss.
- Bristol illustrations are custom line drawings — clinical enough to be unambiguous, abstract enough not to be unpleasant. Each carries a text label and an accessible description; the app must be usable without seeing the drawings at all.
- Tapping "Blood" saves normally and raises a red flag *afterwards*, as a card on Today. It never interrupts or scares mid-flow.

### 4.4 Evening check-in

```
┌──────────────────────────────────────────────────────┐
│  How was today?                                  ✕   │
│                                                       │
│  Energy      😴  ○ ○ ● ○ ○  ⚡                        │
│  Mood        ☹️  ○ ○ ○ ● ○  🙂                        │
│  Sleep       6h30m ▾        ○ ○ ● ○ ○  quality       │
│  Stress ⌄    (tap to add)                            │
│                                                       │
│  ┌────────────────────┐  ┌────────────────────────┐ │
│  │  Nothing to report │  │        Done            │ │
│  └────────────────────┘  └────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

"Nothing to report" is a first-class button, equal in weight to Done, because an explicit all-clear is worth as much to the engine as a symptom report.

### 4.5 Timeline

Chronological, day-grouped, infinite scroll both ways, with a symptom sparkline as a background band so the shape of a bad week is visible while scrolling.

```
┌──────────────────────────────────────────────────────┐
│  Timeline               🔍  ⌕ filter: all ▾           │
├──────────────────────────────────────────────────────┤
│  ▔▔▔▔▔ Wed 20 Aug          score 62  ▁▂▅▇▅▂         │
│   07:55  ☕  Coffee, black                            │
│   08:30  💊  Vitamin D                                │
│   09:10  💩  Bristol 6 · urgent          ⚠︎          │
│   12:40  🍽  Shawarma in lafa, chips, salad          │
│   19:20  😣  Bloating 7/10 · 3h                       │
│   22:00  ✅  Check-in · energy 2 · sleep 5h30m        │
│  ▁▁▁▁▁                                                │
│  ▔▔▔▔▔ Tue 19 Aug          score 84  ▁▁▂▂▁▁         │
│   …                                                   │
└──────────────────────────────────────────────────────┘
```

Long-press any row → edit / duplicate / delete / "log this again now". Search covers raw meal text, food names in both languages, notes and tags.

### 4.6 Insights

```
┌──────────────────────────────────────────────────────┐
│  Insights                                             │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │  Based on 98 days · 84 well-logged              │ │
│  │  Last analysed 2 hours ago              ⟳       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  WORTH TESTING                                        │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Dairy (lactose)          ● MEDIUM confidence    │ │
│  │ ↑ 25pp more loose stools 6–24h after            │ │
│  │ 41 exposed days · 57 without                    │ │
│  │ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░  44% vs 19%                │ │
│  │                          [ Test this properly ] │ │
│  └─────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Large late meals         ● MEDIUM confidence    │ │
│  │ ↑ 19pp more mornings with bloating ≥ 5/10       │ │
│  │                          [ Test this properly ] │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  EARLY SIGNALS · not findings yet              ⌄     │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Onion & garlic (fructans)     ○ low · n=63      │ │
│  │ Coffee on an empty stomach    ○ low · n=22      │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  RULED OUT                                            │
│  ┌─────────────────────────────────────────────────┐ │
│  │ Gluten     ✓ trial completed · probably not you │ │
│  │            You can stop avoiding it.            │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  NOT ENOUGH DATA YET                                  │
│  Eggs · 6 exposure days, need ~4 more                 │
└──────────────────────────────────────────────────────┘
```

**"Ruled out" is a headline section, not a footnote.** Giving food back is the most valuable thing this app can do, and no competing product treats it that way.

**"Not enough data yet"** replaces the usual empty state with something actionable: exactly how many more observations are needed, derived from the power curves in `04-analysis-engine.md` §13.

### 4.7 Evidence card (full)

```
┌──────────────────────────────────────────────────────┐
│  ←   Dairy (lactose)                                  │
│                                                       │
│  ● MEDIUM CONFIDENCE                                  │
│  Enough to test. Not enough to conclude.              │
│                                                       │
│  ── What was observed ──────────────────────────────  │
│  Loose stool within 6–24 hours                        │
│                                                       │
│  With dairy      ████████████████░░░░░░  44%  (18/41) │
│  Without dairy   ███████░░░░░░░░░░░░░░░  19%  (11/57) │
│                                                       │
│  Difference: +25 percentage points                    │
│  95% interval: +9 to +41                              │
│                                                       │
│  ── What we accounted for ──────────────────────────  │
│  ✓ Sleep under 6 hours    ✓ Alcohol                   │
│  ✓ High stress            ✓ Anti-inflammatories       │
│  The effect held after adjusting (weakened by 12%).   │
│                                                       │
│  ── What to be careful about ───────────────────────  │
│  ⚠︎ 8 of your 12 highest-dairy days were weekends,    │
│    when you also eat out more. That's hard to         │
│    separate from the dairy itself.                    │
│                                                       │
│  ── In plain words ─────────────────────────────────  │
│  There's a real pattern here, but eating habits       │
│  cluster, so this could be dairy or it could be       │
│  something dairy travels with. A two-week trial       │
│  would separate them.                                 │
│                                                       │
│  [ See the 98 days behind this ]                      │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Test this properly →                │ │
│  └─────────────────────────────────────────────────┘ │
│  [ Not interested ]                                   │
└──────────────────────────────────────────────────────┘
```

Two things here are non-negotiable and rare in this category: the **explicit "what to be careful about"** block, and the **"see the days behind this"** link that lets the user audit any claim down to raw entries.

### 4.8 Trial screens

**Proposal**
```
┌──────────────────────────────────────────────────────┐
│  Test: Dairy                                          │
│                                                       │
│  ▸ 7 days   normal eating (baseline)                  │
│    We can reuse your last 14 days — saves a week. ✓   │
│  ▸ 14 days  no dairy at all                           │
│  ▸ 3 days   still no dairy (settling)                 │
│  ▸ 3 days   dairy back, increasing:                   │
│             100ml → 250ml → 500ml milk                │
│  ▸ 3 days   no dairy (watching for delayed effects)   │
│                                                       │
│  23 days total, starting today.                       │
│                                                       │
│  We'll be measuring: loose stools (Bristol 6–7)       │
│  We'll call it a real effect if it changes by 20+     │
│  percentage points. Locked in now, before we start —  │
│  so the answer can't be moved later.                  │
│                                                       │
│  You'll need to log on at least 5 days a week.        │
│                                                       │
│  [ Adjust ]              [ Start trial ]              │
└──────────────────────────────────────────────────────┘
```

**Active trial (a persistent card on Today)**
```
  🧪 Dairy trial · elimination · day 6 of 14
  ●●●●●●○○○○○○○○  ▏ ○○○ ▏ ○○○ ▏ ○○○
  elimination      wash  challenge  follow

  ⚠︎ Yesterday's lunch may have contained dairy
     (labneh in the sabich)
     [ Yes, slip ]  [ No, it didn't ]
```

**Verdict**
```
┌──────────────────────────────────────────────────────┐
│  ✓ Dairy trial complete                               │
│                                                       │
│      LIKELY A TRIGGER FOR YOU                         │
│      92% probability of a real effect                 │
│                                                       │
│  Loose stools:  38% normally → 9% without dairy       │
│                 → 41% when you added it back          │
│  Adherence: 93% (13 of 14 days clean)                 │
│  Days logged: 21 of 23                                │
│                                                       │
│  The reintroduction is what makes this convincing:    │
│  symptoms came back within 24 hours of the 250ml      │
│  challenge, and again at 500ml.                       │
│                                                       │
│  ── Limitations ────────────────────────────────────  │
│  You knew which phase you were in, which can          │
│  influence how you rate symptoms. This is one         │
│  person's result — yours — and says nothing about     │
│  anyone else. If this matters a lot, run it once more │
│  in a few months.                                     │
│                                                       │
│  [ Add dairy to my avoid list ]  [ Run it again ]     │
└──────────────────────────────────────────────────────┘
```

### 4.9 More

Trackers (enable/disable/reorder, add custom) · Food library (edit, merge duplicates, set portions) · Goal packs · Reminders & quiet hours · Language & units · Day rollover · AI provider (with the plain-language egress statement) · Export (JSON / CSV / clinician PDF) · Import · Delete everything · About & disclaimer.

---

## 5. States

Every screen specifies four, and the interesting ones are not the happy path.

| State | Rule |
|---|---|
| **Empty** | Never a shrug. Always says what to do and what it will unlock. "Log 3 weeks and I can start finding patterns" beats "No data". |
| **Loading** | Skeletons matching final layout, never spinners over content. Analysis runs show real progress ("checking 340 combinations"). |
| **Offline** | A persistent, calm badge — not a modal. All writes work. Insights show "as of your last sync". |
| **Error** | Says what happened, what was preserved, and what to do. "Couldn't reach the server. Your entry is saved on this device and will sync automatically." |
| **Degraded AI** | Meal saved as raw text with a small "will tidy this up shortly" chip. Never an error dialog. |
| **Red flag** | A `RedFlagBanner` above everything, dismissible once per week, never auto-dismissing. |

---

## 6. Accessibility

- WCAG 2.2 AA: 4.5:1 body contrast, 3:1 for large text and UI boundaries. Verified in both themes.
- Every interactive element keyboard-reachable in a logical order, with a visible focus ring (2 px, `--accent`, 2 px offset).
- Bristol tiles carry full text alternatives; the picker works entirely by label without seeing the illustrations.
- The `SegmentedScale` is a real `role="radiogroup"` with arrow-key support, not a div soup.
- Screen-reader announcements for async results: "Meal parsed, 4 items found."
- `prefers-reduced-motion` removes transitions rather than shortening them.
- Colour is never the only carrier of meaning — confidence tiers pair colour with a label and a filled-dot count.
- Dynamic type up to 200% without layout breakage; test at 320 px width × 200% zoom.

---

## 7. Performance budgets

| Metric | Budget |
|---|---|
| First contentful paint (repeat visit, offline) | < 1.0 s |
| Time to interactive | < 2.0 s |
| Save → visible in timeline | < 100 ms (local write, no network) |
| Meal parse round trip (p50 / p95) | < 1.5 s / < 8 s (then degrade) |
| Timeline scroll | 60 fps at 1,000 rendered rows (virtualised) |
| JS bundle, initial route | < 180 KB gzipped |
| Insights screen with 200 associations | < 400 ms render |

---

## 8. Micro-copy principles

1. **Second person, plain words.** "Loose stools happened on 44% of the days you had dairy" — not "elevated incidence of Bristol 6–7 events correlated with lactose exposure."
2. **Never causal — in observational copy.** Enforced by lint: `causes`, `is causing`, `triggers` (as a verb), `proven`, `because of`, `due to` are banned in insight strings and in all LLM narrative output.
   **Trial verdicts are the one exception, and a narrow one.** A completed N-of-1 trial is experimental evidence about this one person, so its verdict may say "likely a trigger for you" — the noun form, always scoped to *you*, always beside the limitations block. The lint allowlist covers exactly the fixed verdict strings in §4.8 and nothing else; generated text never qualifies.
3. **Never diagnostic.** No condition names in generated copy. Ever.
4. **Uncertainty is stated, not hidden.** "We don't know yet" is a shipped string used often.
5. **No guilt.** Missing days are described neutrally: "23 of 30 days logged" — never "you missed 7 days".
6. **Hebrew is written by a person, not machine-translated.** Gut and food vocabulary in particular; translated medical-ish Hebrew reads badly and undermines trust.

---

## 9. Design deliverables for implementation

1. **Design tokens** as `tokens.json` → generates Tailwind config + CSS custom properties. Single source of truth for both themes.
2. **Bristol illustration set** — 7 SVGs, line-art, stroke-based so they inherit `currentColor` and work in both themes.
3. **Icon set** — 24 px stroke icons, direction-aware ones tagged for RTL flipping.
4. **Component library** in Storybook, each component shown in: light, dark, LTR, RTL, and at 200% type.
5. **Screen prototypes** for the five critical flows: meal-by-text, meal-by-photo, stool, check-in, trial start.
