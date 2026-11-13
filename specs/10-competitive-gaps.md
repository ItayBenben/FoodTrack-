# 10 — Competitive gap analysis

**Status:** decided. Every row below has a verdict. Items marked ADOPT are folded into the numbered specs and carry a decision ID (D32+). Items marked REJECT are non-goals and are listed in `00` §5 so they stop coming back.

**Method.** Five parallel web sweeps, ~480 tool calls, covering (1) gut/IBS-specific apps, (2) general symptom trackers with correlation engines, (3) mainstream food loggers, (4) personalised-nutrition/microbiome/CGM, (5) N-of-1 platforms and the methodology literature. Claims below are cited. Where a sweep could not verify something from a fetched page it is marked UNVERIFIED and is **not** load-bearing for any decision here.

---

## 1. The headline: what the sweep confirmed

FoodTrack's core bet survives contact with the market, and the reason is narrower than it looks.

**Lag analysis is not the differentiator.** Bearable already ships a 0–7 day lag sweep, letting the user pick the window. Exist.io does same-day plus one-day. The spec previously treated lagged association as a distinguishing feature; it is table stakes. What Bearable does is worse than nothing: it lets the *user* choose the lag and reports whichever looks best — uncontrolled multiple testing presented as a feature.

**The differentiator is the gate, not the search.** Across every product verified, the "correlation engine" is a marketing term, not a statistical one. Exist.io is the only product that computes a p-value at all, and it hides it behind a five-star icon. **Zero products verified show confidence intervals, sample size at the point of claim, or any multiple-comparison correction** — while testing hundreds of factor×outcome pairs. Bearable will assert a correlation from **six days of data** (three with the factor, three without). That is indefensible for an app implying food causation, and it is exactly the gap `04` §7–9 already fills.

**The evidence that the gate matters is now quantified.** The blinded randomised FODMAP reintroduction trial (*Gastroenterology* 2024, n=77 analysed) ran seven 7-day challenge cycles including a **glucose control**. Reaction rates: fructans 56%, mannitol 54%, GOS 35%, lactose 28%, fructose 27%, sorbitol 23% — **and the inert glucose control 26%**. Skodje 2018: among 59 self-diagnosed gluten-sensitive people, **37% peaked on placebo**, more than the 22% who peaked on gluten. Pooled NCGS challenges across 10 trials and 1,312 adults: only 16% showed gluten-specific responses and **40% of "responders" were nocebo**.

Read that plainly: **roughly one in four "confirmed triggers" found by any unblinded protocol is false.** Monash, Whole30, AIP and Ayble are all unblinded, fixed-order, single-exposure. So, as currently specified, is FoodTrack. This is the most important finding in the sweep and it is a correction to our own design, not just to theirs.

**Nobody occupies the position we want.** The complete self-hosted competitive set is Flaredown (GPLv3, no correlation engine at all), Nomie/Daily Nomie (MIT, visual charts only) and Zenobase (MIT since April 2026, scatter plots only). None does statistically-grounded food→gut association analysis. In the commercial tier, the closest analytic rival — mySymptoms — produces a ranked suspect list with **no lag window, no confidence scoring, no minimum data threshold and no disclosed algorithm**.

**The cautionary tale.** Paul Ingraham logged meticulously for 18 months and found not one robust correlation; his single promising finding collapsed when acted on. His diagnosis is the one FoodTrack must answer: *"If a correlation is strong enough to be identifiable, you probably already knew it"* — while subtle ones stay elusive. He used no app, which means no product in this category has solved the problem he hit. Our answer has to be the trial engine, not the correlation engine.

---

## 2. Genuine gaps — ADOPT at P0

These change validity or change the data substrate. They are not features in the marketing sense; without them the engine is measuring the wrong thing or over-claiming.

### G1 · Sham-controlled challenges, and blinding where blinding is possible — **D32**

`04` §10.6 currently says true blinding is impossible for whole foods and stops there. The first half is right; stopping there is wrong.

Blinding is impossible for an apple. It is entirely possible for **isolated fermentable carbohydrates** — which is precisely the FODMAP subgroup structure the app already models. Three working precedents:

| Method | Precedent | Applicability |
|---|---|---|
| Powder in water | *Gastroenterology* 2024 — 7 agents + glucose control, indistinguishable powders, 3×/day × 7 days | Lactose, fructose, GOS, fructan, mannitol, sorbitol |
| Concealment in a food matrix | Skodje 2018 — gluten 5.7 g, fructan 2.1 g in muesli bars | Gluten, isolated fructans |
| **Participant-executed self-blinding** | eLife 2021;10:e62878 — opaque capsules, weekly envelopes, QR allocation, key held server-side. **1.3% procedural error rate, 0.5–1% of clinical-study cost** | Anything capsule-deliverable, with no supply chain |

The eLife protocol is the transferable one and it fits a self-hosted app exactly: the user fills the capsules, the **server holds the allocation key**, and the user cannot know the arm while the analyst can reconstruct it. The authors explicitly recommend it for domains "where social-pressure, expectancy, positive-test strategies and confirmation bias can lead to false-positive findings" — a precise description of trigger-hunting.

**Adopt:** a fourth trial design, **Design D — blinded challenge**, available only for targets with an isolated-compound form. Mandatory inert control period. Server-side sealed allocation. Whole-food challenges (Designs A–C) stay open-label and must be **labelled in-product as hypothesis-generating, not confirmatory** — a string we do not currently have.

### G2 · Blinding-guess capture and guess-stratified analysis — **D33**

Trivially cheap, and it converts an unmeasurable weakness into a reported number. In the eLife study the break-blind rate was 0.72 against a chance baseline of 0.62; when **guess** entered the models the between-group differences vanished, while holding actual condition fixed showed **21 of 22 comparisons differed by guess**. Belief, not substance, drove the effect. 86% of participants said they were already thinking about which arm they were in before being asked.

**Adopt:** at the end of every challenge period — blinded *or* open — ask "which do you think you got?". Report the break-blind rate on the verdict card. Run the primary analysis by allocation and a sensitivity analysis by guess, and **say so when they diverge**. This applies to open-label trials too, where it functions as an expectation-effect measurement.

### G3 · Ingredient decomposition: `food_component` — **D34**

The structural gap, and the largest one found.

Today `meal_item → food` is flat. "שקשוקה" resolves to one `food` row. Its onion and garlic — the exact fructan predictors the FODMAP engine exists to isolate — are invisible unless someone hand-tags the shakshuka row. Correlation power is proportional to the number of independently-varying predictors per meal: "pasta bolognese" is **one** predictor; "durum pasta / beef / tomato / onion / garlic / olive oil / parmesan" is **seven**.

Every mainstream logger throws this away at commit time — MyFitnessPal recipes "function as complete units". USDA FNDDS already ships the decomposition (`FNDDS Ingredients` + `Ingredient Nutrient Values`, mixed dishes → SR-coded components). **No mainstream product persists a queryable ingredient graph.**

**Adopt:** a `food_component` edge table (`parent_food_id`, `component_food_id`, `fraction`, `source`, `is_optional`). Tags and nutrients resolve transitively through it. A saved "my usual shakshuka" template is then **one tap to log and seven ingredient rows in the database** — the reuse-speed vs ingredient-fidelity trade-off that every competitor accepts, refused.

### G4 · Portion precision tiers — **D35**

`meal_item.confidence` today conflates *parse* confidence with *portion* confidence. They are different quantities and only one of them should weight the analysis.

FoodNoms is the only product found that grades its own portions: **Accurate / Approximate (±10%) / Estimate (±30%)**. Two payoffs, and the second is the one that matters to us: it removes the psychological obligation to be exact (the top cause of logging abandonment), *and* it gives the engine a per-observation weight. A statistics-driven app that discards its own uncertainty metadata is throwing away free signal.

**Adopt:** `meal_item.portion_precision ∈ {weighed, measured, estimated, unspecified}`, exactly parallel to the existing `time_precision` (D31). It feeds the day-weight `w(d)` in `04` §5. `unspecified` portions are usable for presence/absence exposure but excluded from dose-response.

### G5 · Personal transit time, measured — **D36**

The best-fitting scientific addition found anywhere in the sweep, and it costs a bottle of blue food colouring.

`04` §6 uses four fixed lag windows for everyone. But whole-gut transit varies from roughly 16 to 32 hours *between* people (citizen-science replication, 21,541 volunteers, 17 countries) and further within one. Attributing today's Bristol 6 to yesterday's lunch without knowing the user's own transit is a systematic misattribution.

The blue-dye method is validated to the extent anything here is (*Gut* 2021, n=863 PREDICT 1 participants): two blue muffins, self-report first blue stool, **median whole-gut transit 28.7 h**. Against stool consistency as a transit proxy it is decisively better — **AUC 0.82 vs Bristol's 0.65**, and 17.1% vs 11.5% of microbiome beta-diversity variance explained.

**Adopt:** an optional, repeatable transit measurement (`transit_marker` tracker: ingest time → first marked stool). The measured value **shifts the user's lag windows** rather than replacing them, and until it exists the population median is used and labelled as such. Ship Ianiro's caveat verbatim: the method has not been compared head-to-head against reference transit methods, and it is not for unsupervised use in diagnosed digestive disease.

### G6 · Symptom-gated and analytic washout — **D37**

`04` §10.2 fixes washout at 3 days. That is in line with consumer protocols (Monash 2–3 d, Whole30 2–3 d, AIP 3–7 d) and **shorter than the research protocols** — Skodje used ≥7 days *extended until symptoms from the previous challenge resolved*. Monash's own instruction is "2–3 days **or until symptoms settle**", and to start each challenge only when "symptoms are well controlled". We implemented the number and dropped the condition.

Separately, the Bayesian N-of-1 methods literature names two distinct washouts, and we implement neither properly: **physical** (no treatment administered) and **analytic** (outcomes at the start of each crossover period are discarded from the likelihood).

**Adopt:** washout becomes `max(3 days, days until outcome returns within δ of elimination-phase baseline)`, capped at 10 days with a "this is taking longer than expected" surface. Plus an analytic washout: the first `k` days of each period are excluded from the likelihood, `k` pre-registered. Report both on the verdict card.

### G7 · The null verdict as a first-class, designed outcome — **D38**

`01` AC1 gates display on minimum exposures. That prevents a bad claim; it does not produce a good answer.

Ingraham quit because 18 months had no legible endpoint. A Daylio user, verbatim: *"The correlation vs causation element isn't as evident as I'd like it to be… wind up just being a lot of data I don't know what to do with."* An app that can confidently say **nothing here** is more trustworthy than one that always finds something — and it is the honest majority outcome, given per-food Bristol effect sizes appear to be an unfilled evidence gap in the published literature.

**Adopt:** a designed null screen. "After 6 weeks and 41 logged exposures, no food shows a credible association with your Bristol scores. Here is what that means, what it does not mean, and three things to try next." In the trial engine, implement it as a **ROPE**: pre-register a region of practical equivalence and report P(effect ∈ ROPE), so "no meaningful effect" is a verdict the engine can positively *conclude* rather than merely fail to reject.

---

## 3. ADOPT at P1

| ID | Gap | Evidence / exemplar | Cost |
|---|---|---|---|
| **G8 · D39** | **Prompt for invisible ingredients** — oil, butter, sauce, condiments, as one-tap adds on the meal review step | Cronometer's photo review does exactly this. The standing critique of photo-AI is that fat is invisible: you can double a dish's oil and never see it. For calories that is a 2× error; **for gut symptoms fat is a primary trigger, so an invisible variable is a missing confounder** that poisons every association downstream | S |
| **G9 · D40** | **Cumulative FODMAP load / stacking** — a rolling per-subgroup load curve with a personal threshold learned from trial data | Monash's position is explicit: load is cumulative **across subgroups**, green-serve cut-offs were set conservatively *to permit multiple green serves*, and meals should be spaced 2–3 h. No app operationalises it. Directly explains the commonest IBS-app complaint — "I ate only safe foods and still reacted". **Caveat to state in-app:** the 2024 trial used fixed doses and did not establish per-person thresholds, so we are *estimating* a threshold, not looking one up | M |
| **G10 · D41** | **Event markers** — antibiotics, travel, illness, cycle phase, a colonoscopy: discrete interventions a daily correlation engine cannot see | Nomie 6.7.4 "Pointers" — tag a point in time, compare notes before and after. Cheap on top of existing tagging, and gut health is dominated by exactly these discrete shocks | S |
| **G11 · D42** | **Adherence engineering** — a short first trial, a per-period completion floor, tuned notification intensity | The numbers are brutal: median retention in remote digital health studies is **5.5 days**; **>50% discontinue within week one**; only ~1 in 10 become frequent users. Our current trial is ~44 days. The caffeine/L-theanine protocol tested 5 vs 15 vs 27 days and landed on **15 as the power/dropout balance** — buy cycles with *more, shorter* periods. Declare a completion floor (≥1/3 of exposures per period) so a missed day is not experienced as failure | M |
| **G12 · D43** | **Re-test scheduling; previous posterior becomes the next prior** | Tolerance is not permanent — Monash Step 3 mandates periodic retesting; AIP retests ambiguous results after ≥2 weeks. Auto-schedule re-challenge of "fail" verdicts after N months and let evidence accumulate across replications. A retention mechanic *and* a validity mechanic | S |
| **G13 · D44** | **CENT/SCRIBE-conformant trial report** — one-click PDF: design, sequence actually completed, raw per-period data, protocol deviations, adverse events, link to the frozen pre-registration | CENT specifically flags primary-outcome identification, adverse events and individual data presentation as commonly missing. This is the artefact a user hands their GI or dietitian, and it is the checklist we can be audited against. In published N-of-1 trials the baseline is dismal: **<50% report washout or run-in, only 15% report any power calculation, <20% account for carryover** | S–M |
| **G14 · D45** | **Population prior on day 1, visibly labelled as a prior, converging to a personal posterior** | Today: "log 3 weeks before I say anything." Honest, but day 1 gives nothing. Food4Me — the largest personalised-nutrition RCT ever run, 1,607 randomised — found personalising on **self-reported diet alone** captured essentially the entire benefit; adding phenotype and genotype added nothing. We already have the input that mattered. The honesty differentiator: ZOE's day-1 score *is* a population model presented as personalisation and is not labelled as such. **Render the prior→posterior transition visibly** — a credible interval that visibly shrinks as evidence accrues | S–M |
| **G15 · D46** | **Surface the confounder in the insight card, not just in a warning flag** | We compute `confounding_detected` when crude-to-adjusted change exceeds 30%, but the user sees a flag, not the mechanism. Bearable's factor↔factor request has **487 votes, filed Dec 2020, promised "within months" in Oct 2021, demoted back to Under Consideration in Oct 2022** — five years of unmet demand at the category leader. Without it you cannot distinguish "dairy worsens bloating" from "dairy co-occurs with alcohol, and alcohol worsens bloating" | M |

---

## 4. ADOPT at P2

- **G16 · Adaptive scope narrowing.** The cleverest idea in the sweep. Mymee reconfigures the tracked field set *weekly* as hypotheses form, keeping logging under 3 minutes/day across a 16-week program — and charges $125/session for a human to do it. Automate it: once the engine has ruled out 40 foods, stop asking about them, and spend the user's limited logging budget on live suspects. Fixes fatigue and raises power on the questions that matter simultaneously. Caveat from the burden literature: naive minimisation backfires — photo and wearable logging produced significantly *worse* recall of *when* to log than standard apps (4.0 ± 2.24 and 5.0 ± 1.81 vs 2.35 ± 1.79, p < 0.001). Vary precision, not the habit.
- **G17 · MCP server over the personal dataset.** Zenobase shipped MCP in May 2026 and is the only one. We already have a pluggable LLM layer and will have a clean REST API; exposing the dataset to the user's own agent is close to free and genuinely novel. Subject to the existing rule that stool/symptom/mood/weight data never leaves for a remote model.
- **G18 · Full-day free-text paste.** The highest-throughput backfill mechanism that exists: six lines at bedtime recovers a whole day. Nutritionix's `/v2/natural/nutrients` is the right shape — one phrase per line, with an `idx` back-reference mapping each result to its input line. Always show which input line produced which entry. Folds into the day builder (`08` §4.15).
- **G19 · Hebrew barcode via a stacked pipeline.** Open Food Facts Israel is thin (**8,089 products**; largest single category 292 items). The Price Transparency Law feeds are not: IsraBis reports **255,000+ active products across all 49 obligated chains, refreshed ~4-hourly**, with Hebrew names and barcodes. Treat that as an **identity layer only** — whether those feeds carry nutrition or ingredient fields is UNVERIFIED. Kaspenu (nonprofit, ~40,000 products, Nutri-Score + NOVA + full ingredients + additives, uses AI for Hebrew product-name processing) is the richest Israeli branded-food asset found and is worth contacting directly given its nonprofit posture; it publishes no API.
- **G20 · HealthKit symptom write-back; asymmetric Health Connect.** iOS ships the GI vocabulary natively — `abdominalCramps`, `bloating`, `constipation`, `diarrhea`, `heartburn`, `nausea`, `vomiting`, `fatigue`, `moodChanges`. Android's Health Connect ships **none** of them and forbids custom types. So: read+write on iOS, read-only enrichment on Android (Nutrition, Hydration, Weight, Sleep, Vitals are all rich), and design the sync asymmetric from day one rather than discovering it in Phase 4. Note Bristol has no native representation on either platform and stays proprietary.

Also worth stealing, cheap, no decision ID needed: **show the parse, don't hide it** — render "**2** × **bowl** of **pasta**" as three editable chips so the user sees which token was guessed (Nutritionix exposes `parsed_query` structurally; Cronometer ships inline swap alternatives; Passio lets you select/unselect parsed items before committing). And **fiducial-object portion coaching** — "put a fork or a coin in the shot" — upgrades an entry from Estimate-tier to Approximate-tier under G4 for the cost of one string.

---

## 5. REJECT — non-goals, with reasons

These are added to `00` §5 so they stop being re-proposed.

| Rejected | Why |
|---|---|
| **Native CGM support** | ZOE — the best-funded player in the category — **removed the CGM** from ZOE 2.0 and cut price ~60%. A JAMA Internal Medicine review (Aug 2026) found no evidence CGMs improve outcomes in people without diabetes, and reported **over two-thirds of non-diabetic users experienced anxiety about developing diabetes** from their readings. A Bath trial found the sensor overestimated time-above-threshold by nearly 400% in healthy adults. And glucose is **the wrong outcome** — it tracks metabolic response, not stool quality. Accept a CSV import; never require or build around it |
| **Ship or resell a microbiome test** | 2–4 week turnaround (Viome complaints report months), $169–$499, and PREDICT 1 puts the microbiome at **6.0% of glycaemic variance**. The AGA position is that microbiome testing for general health optimisation is not supported by sufficient evidence. Accept an uploaded report; do not become a lab |
| **Nutrigenetic scoring** | Evidence-negative, not merely unproven. Food4Me: adding genotype produced **no** improvement over diet-based personalisation. The 2026 *Food & Function* review: single-gene approaches "largely ineffective". Companies have given opposite readings of identical variants |
| **Supplement / probiotic recommendations** | It is the monetisation model for Viome, Thorne, Floré and ZOE, and it is the single largest source of the complaints and credibility damage documented across the sweep. **A self-hosted app with nothing to sell is structurally more trustworthy than every company in this report.** Do not surrender that |
| **Breath-hydrogen hardware integration** | $269 device, up to 10 tests/day, saturates at 10.0 AU with **26% of readings hitting the ceiling**, and validation studies carry three vendor employees as authors with the lead author on the advisory board. Accept a CSV if offered |
| **Human coaching** | Unbundleable from a hosted service model. G13 (conformant report) + a referral surface is the cheap version and should be built first |

One honest note on the strongest retention lever we cannot use. Across ~100,000 participants in remote digital health studies, **clinician referral added 40 days of median retention (4 → 44)** — over ten times any other factor. Monetary compensation added 22. Actually having the condition added 7. The single biggest driver of whether someone keeps logging is *who told them to*, and that is a distribution decision, not a product decision. What the product can do is make the referral surface exist (G13), which is why it is P1 and not P2.

---

## 6. Corrections to existing specs

Three places where the research contradicts what we wrote:

1. **`04` §10.6 — "true blinding is not possible".** Half true, and the half we got wrong is the important half. Blinding is impossible for whole foods and entirely feasible for isolated fermentable carbohydrates via powders, capsules or a food matrix. Rewritten under G1.
2. **`00` §2 — lagged association framed as a differentiator.** Bearable ships a 0–7 day lag sweep today. The differentiator is the *statistical gate and the multiplicity correction*, plus transit-personalised windows (G5). Reframed.
3. **No sham arm anywhere in the trial engine.** Given a 26% placebo reaction rate at our likely threshold, an uncontrolled trial engine will manufacture a false trigger roughly one time in four. G1 and G2 are the fix; until Design D ships, every open-label verdict must carry the "hypothesis-generating, not confirmatory" label.

Two spec claims the research **strengthens**, worth recording because they were judgement calls at the time:

- **The minimum-data gates in `01` AC1 and `04` §9 are the product.** Bearable asserts from six days. Nothing else in the market gates at all.
- **Refusing streaks (`01` §"Missing a day costs nothing") is correct** and is now evidence-backed twice over: the retention literature, and the dropout-is-not-random problem — people stop logging *because* they feel bad, which makes the missingness MNAR and biases any MAR imputation. `04` should state that explicitly and model dropout time, as PRODUCE did.

---

## 7. What this does to the build plan

G3 (`food_component`) and G4 (`portion_precision`) are schema, so they land in **M1** with the rest of the v1.1 addendum or they become migrations later. G1, G2, G6 and G7 are trial-engine work and land in **M5**. G5 is a new tracker definition plus a lag-window change — config and analysis, **M4**. The P1 set is a fast-follow milestone; the P2 set is Phase 4.

Nothing here changes the ~21–23 day estimate materially except G3, which adds roughly two days and pays for itself the first time the engine has to decide whether it was the onion.
