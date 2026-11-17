# FoodTrack — open items

Running backlog. Everything here is genuinely open as of **12 Sep 2026** (M0 + M1 built; see `claude/build-log.md`). Closed items are deleted, not struck through — this file is a worklist, not a history.

---

## 0. Build — next actions

| Item | What to do |
|---|---|
| **Push the repo** | Clone `foodtrack.bundle`, add `origin` = `ItayBenben/foodtrack`, push `main`. Link the repo to the Cowork session's GitHub connection so future sessions can push directly. |
| **Copy the specs into `docs/`** | `specs/*.md` from this Project → repo `docs/` (filenames in `docs/README.md`). `CLAUDE.md` references them and they are the contract. |
| **Boot the compose stack once** | The session had no Docker daemon. `docker compose up -d` on a machine with Docker; confirm the postgres init script creates `foodtrack_app`, then `keys:init`, `db:migrate`, `db:seed`. |
| **Review `docs/impl-notes.md` I-01…I-17** | Decisions taken where the spec was silent. Any you disagree with becomes a spec change before M2. |
| **M2** | Capture core, offline-first (07 M2 + addendum v1.1). |

---

## 1. Bad-day post-mortem — the missing screen

**Status:** not specced. **Priority:** high — it fills the emptiest moment in the product.

### The problem

Every outcome the engine defines is a **level** — `stool.any_abnormal` for a day, `stool.deviation` as mean |Bristol−4|. The insight drill-down (`08` §8.5) runs one direction only: from a claim → to the days behind it.

There is **no path from a bad day backwards.** Which is exactly the moment someone opens this app: bad morning, phone in hand, *"what did I do?"* Today they get "keep logging."

That is also the literal framing of the original brief — *"what food I ate causes my poop to be bad"* is a question about a **transition**, good → bad. We only model levels.

### What to build

Tap any day scoring below the user's own baseline → a post-mortem of the preceding 48 h.

The one idea that makes it worth building: **rank by unusualness, not by presence.** It doesn't matter that they ate bread. It matters if they ate something they rarely eat, or ate far more of something than usual. So each exposure in the window is scored against that user's own base rate:

```
  Tuesday scored 41. Your usual is 68.

  In the 36 hours before:
  ⚠ מיץ תפוזים      you've had this 3 times in 90 days
  ⚠ חלב מלא         4× your usual portion
  ·  לחם             you eat this most days
  ·  קפה             you eat this most days

  Also that window: antibiotics (day 3 of 7)
```

Existing pieces it should reuse rather than reinvent:

- `user_food.median_qty` already holds the personal portion baseline — the "4× your usual" line is a division, not new data.
- Personal base rate per food is a count over `meal_item` in the user's history.
- `event_marker` (D41) supplies the "also that window" line for free.
- The lag window comes from the user's measured transit (D36) if they have one, the population default if not.

### Three rules, non-negotiable

1. **It is not a finding, and must never render like one.** n=1. Use a visually distinct treatment from the insight card — this is a *lead*, and the copy says so. It feeds the suspect list as a weak prior at most; it never produces a confidence tier and never proposes a trial on its own.
2. **"Nothing stood out" is a real, common answer** and needs designing properly, not a bare empty state. Most bad days will have no unusual exposure, and saying so honestly is the whole credibility of the feature.
3. **Never rank by FODMAP class alone.** That would just replay the tag table back at the user and confirm whatever they already believe. Unusualness relative to *their* history is the signal; the tag is a footnote.

### Watch out for

Reverse causation runs the other way here and is easy to get wrong. If they ate plain rice at lunch *because* the morning was already bad, rice will surface as "unusual." Exclude exposures that fall **after** the day's first abnormal stool, and say the window was trimmed.

**Effort:** S–M. The data all exists; it's a query, a ranking function and one screen. Est. 1 day.

---

## 2. Blocked on something external

| Item | Blocked by | What unblocks it |
|---|---|---|
| Republish the spec-hub artifact | Network allowlist blocks the artifact host, so the live version can't be read to build on | Add `*.frame.claudeusercontent.com` under environment settings → Code → Network access → Custom → Allowed domains |
| **Tzameret** (Israeli national food DB) | `data.gov.il` returned 404/robots-disallowed on every path tried, including the CKAN API and direct curl | Download manually from `data.gov.il/dataset/nutrition-database`, then seed `food` with `source='tzameret'` |
| Kaspenu data access | Nonprofit, ~40k Israeli products with full ingredients and additives, **no public API** | Contact them directly — nonprofit posture makes a data-sharing ask reasonable |
| GitHub push from Cowork | The session token is scoped to linked repositories and none was linked | Create `ItayBenben/foodtrack` and link it to the session's GitHub connection |

---

## 3. Verify before ship

- [ ] **Six FODMAP citations marked `needs_check`** in `config/food-tags/citations.json` (the table was self-authored in the build session; none of its sources was verified in-session):
  - Muir et al. 2009, *J Agric Food Chem* 57(2):554–565 (PMID 19123815) — polyols, GOS, fructan
  - Biesiekierski et al. 2011, *J Hum Nutr Diet* 24(2):154–176 — fructans and GOS in grains
  - Gibson & Shepherd 2010, *J Gastroenterol Hepatol* 25(2):252–258 — the framework paper
  - Misselwitz et al. 2019, *Gut* 68(11):2080–2091 — lactose by dairy type
  - Maintz & Novak 2007, *Am J Clin Nutr* 85(5):1185–1196 — histamine tag
  - Gonlachanvit 2010, *J Neurogastroenterol Motil* 16(2):131–138 — spicy tag
- [ ] **The FODMAP classifications themselves** (`config/food-tags/fodmap.json`, 49 groups) — coarse and self-authored; worth a read-through against your own knowledge, especially the Israeli foods.
- [ ] **Hebrew parser test set** (`parser-test/meals-he.md`, 40 meals, sections A–F) still awaits your approval or edits. The parser test can't run until it's signed off.
- [ ] **Locale copy** — 841 keys per language were written for every string named in `08`/`09`; the Hebrew was written by hand, not machine-translated, but has not been read by you.

---

## 4. Prototype is behind the specs

The prototype has **34 screens**. The spec now has **S127–S137** with no prototype equivalent:

- Design D prep flow (S127–S130) and reveal (S130b)
- ~~The guess prompt (S130c)~~ ✅ built, both blinded and open-label variants
- Transit measurement (S131–S133)
- Event marker (S134)
- ~~Null verdict (S135)~~ ✅ built · Insights-wide null (S135b) folded into the same screen
- Component editor (S136)
- Trial report (S137)

**S135 and S130c are now built** (34 screens, both languages, `chk3.mjs` clean). Building them earned one real correction that prose review had missed: the confidence scale was specced as a bare 1–5 and reads as an invitation to tap carelessly — now anchored `Just guessing` / `Certain`, and `08` §15.2 updated. The remaining eleven are lower-risk: their designs are settled and the spec lists every control.

---

## 5. Specced but thin

| Item | State |
|---|---|
| **D40** cumulative FODMAP load | Engine model written (`04` §17.1). No flow, no screen. The load curve needs a visual and the "unlabelled y-axis" rule needs a design that doesn't look broken. |
| **D45** day-one population prior | Engine model written (`04` §17.2). No flow, no screen. The shrinking-interval visual is the whole feature and doesn't exist yet. |
| **P2 set** | Adaptive scope narrowing, MCP server, full-day paste, Hebrew barcode pipeline, HealthKit write-back. Decided in `10` §4, not specced. |
| **Tracker field count** | Spec says 13 trackers / 63 fields; the authored set has 62. No field was invented to match — if one is missing from the spec's intent, name it. |

---

## 5b. Engine finding — weekday alignment flips the M4 result

Found 2026-11-17. The M4 integration test (seed 42, 90 days, injected dairy → loose stool, true effect 0.38) found the effect when the fixture ended on 2026-11-15 and **missed it** when the same draws ended on 2026-11-16 — only the weekdays the days fall on changed. Same code, same numpy/scipy/statsmodels. The test is now pinned to 2026-11-15 so CI is deterministic, but the sensitivity is real: a planted 0.38 effect at 90 days should not depend on the calendar.

To do: sweep the end day across 7 consecutive days (and a few seeds) through `analyze()`; see whether the weekday confounder adjustment or the FDR cut is what flips it; decide with the null gate (`test:stats`) in the loop — **never** by loosening the gate (rule 4).

## 6. Known thin data

**Open Food Facts Israel carries 8,089 products** and the largest single category has 292 items. That is not enough for barcode logging to feel useful on Israeli shelves. The Price Transparency feeds (255k+ products, 49 chains, ~4-hourly) fix *identity* but are **unconfirmed for nutrition or ingredient fields** — treat as a name↔barcode layer until proven otherwise.

Consequence: barcode stays P3 (D3a) and the **personal food library remains the real asset**. That was the right call at v1.0 and the research confirms it.
