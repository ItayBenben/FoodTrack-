# FoodTrack — Analysis & Trial Engine

Version 1.1 · 2026-08-21

This is the document that decides whether the app is useful or merely tidy. It has one governing rule:

> **Observational data generates hypotheses. Only trials generate evidence.**
> The engine is built so that the user always knows which one they are looking at.

---

## 1. The pipeline

```
observations
   ↓  (1) day construction
daily_rollup  +  daily_exposure
   ↓  (2) outcome definition
outcome series y(d)
   ↓  (3) exposure series with lag windows
X(d, e, lag)
   ↓  (4) eligibility filter  — kill under-powered comparisons before they exist
candidate set
   ↓  (5) association estimation + confounder adjustment
effects with intervals
   ↓  (6) multiplicity control (Benjamini–Hochberg)
q-values
   ↓  (7) confidence tiering  — the honest label
ranked insights
   ↓  (8) narrative generation from numbers only
insight cards
   ↓  (9) trial proposal
N-of-1 protocol
```

---

## 2. Step 1 — Constructing the day

The day is the analysis unit. It runs from `day_rollover` (default 04:00 local) to the next rollover.

**Day quality weight.** Not all days are equal evidence. Each day gets `w(d) ∈ [0,1]`:

```
w(d) = 0.5 · meal_coverage(d) + 0.3 · outcome_recorded(d) + 0.2 · checkin_present(d)

meal_coverage(d)   = min(1, meals_logged / user_median_meals_per_day)
outcome_recorded(d)= 1 if a stool/symptom/all_clear record exists, else 0
checkin_present(d) = 1 if the evening check-in was completed
```

Days with `w(d) < 0.4` are excluded from association estimation and reported as "incomplete days" in the run summary. This is why the "Nothing to report" button matters so much: it converts a `w = 0.3` day into a `w = 0.8` day.

---

## 3. Step 2 — Outcome definitions

Outcomes are declared in tracker definitions (`analysis.role = "outcome"`). The Gut Health pack ships:

| Outcome key | Type | Definition |
|---|---|---|
| `stool.any_abnormal` | binary | Any stool with Bristol ∈ {1,2,6,7} that day |
| `stool.loose` | binary | Any Bristol ∈ {6,7} |
| `stool.hard` | binary | Any Bristol ∈ {1,2} |
| `stool.deviation` | continuous | mean(\|bristol − 4\|) across the day's stools |
| `symptom.bloating` | continuous | max severity 0–10 |
| `symptom.pain` | continuous | max severity 0–10 |
| `symptom.load` | continuous | Σ severities, normalised 0–100 |
| `gut_day_score` | continuous | The composite, below |

### The Gut Day Score (0–100, higher is better)

```
score = 100
      − 30 · stool_deviation_norm        // mean |Bristol−4| / 3, clipped to [0,1]
      − 40 · symptom_load_norm           // Σ severity / (10 · n_tracked_symptoms)
      − 15 · urgency_norm
      − 15 · incompleteness_penalty      // any blood/mucus/nocturnal event
```
Clipped to [0,100]. Every component is shown when the user taps the score. **The weights are configurable, and are presented as "our default weighting", never as a clinical measure.** A separate, properly-cited IBS-SSS-style score (five items, 0–500, mild < 175 / moderate 175–300 / severe > 300) is computed independently for the clinician export, using the published item structure rather than our own weights.

---

## 4. Step 3 — Exposures and lag windows

Gut effects are delayed and the delay is not fixed. Transit time varies from hours to days between people and within one person.

For each exposure `e` on day `d`, evaluate against outcomes in these windows:

| Window | Rationale |
|---|---|
| 0–6 h | Immediate: reflux, osmotic diarrhoea, intolerance reactions |
| 6–24 h | The main event for most food→stool effects |
| 24–48 h | Slow transit, fermentation-driven effects |
| 24–72 h | Cumulative/dose-loading effects, e.g. fructan build-up |

**These windows are defaults, not constants (D36).** Whole-gut transit varies roughly 16–32 hours *between* people and further within one person, so a fixed window systematically misattributes for anyone away from the median. Where the user has measured their own transit time (§4.1), the 6–24 h and 24–48 h boundaries shift by the ratio of their measured transit to the population median, and the shift is stated on the evidence card. Until a measurement exists the population median of ~28 h is used and is **labelled as an assumption**, not silently applied.

Note also what the windows are *for*: a lag is an **output with uncertainty**, never an input the user selects. Bearable lets the user pick the lag and reports whichever looks best, which is uncontrolled multiple testing dressed as a feature. Our lag sweep is corrected across windows in the same BH-FDR family as everything else (§9).

### 4.1 Measured personal transit time  *(D36)*

An optional, repeatable measurement, implemented as a `transit_marker` tracker: the user logs ingestion of a coloured marker, then logs the first stool showing it. The difference is whole-gut transit.

The method is the blue-dye protocol validated in *Gut* 2021 on 863 PREDICT 1 participants — two blue muffins, self-reported first blue stool, **median whole-gut transit 28.7 h**. Against stool consistency as a transit proxy it is decisively better: **AUC 0.82 versus Bristol's 0.65**, and 17.1% versus 11.5% of microbiome beta-diversity variance explained. A citizen-science replication across 21,541 volunteers in 17 countries gave a mean of 23.9 h with country means spanning 16.2–32 h.

Three rules, all enforced in copy:

1. The measurement **shifts the lag windows; it does not replace them.** A single transit measurement is one draw from a variable distribution — three measurements are requested before the shift is applied, and the shift is capped at ±50% of the default boundary.
2. Ship the caveat verbatim: the method has **not been compared head-to-head against reference transit methods**, and it is not for unsupervised use in diagnosed digestive disease.
3. It is never required. Everything works on the population default; the measurement is an accuracy upgrade the user can decline forever.

**Exposure representations, in increasing order of statistical power:**

1. **Specific food** — "hummus". Most interpretable, fewest observations, weakest power.
2. **Food tag / class** — `contains_lactose`, `fodmap_fructan_high`, `fried`, `spicy`, `alcohol`, `caffeine`, `ultraprocessed`. Far more exposure days, and usually the actionable level.
3. **Nutrient dose** — fibre g, lactose g, fat g, caffeine mg. Continuous, supports dose-response, which is much stronger evidence than a binary.
4. **Meta-exposures** — derived, and often the most useful findings in practice: `late_meal` (< 3 h before sleep), `large_meal` (top quartile of the user's own kcal), `meal_irregularity`, `eating_window_hours`, `alcohol_units`, `total_daily_fibre`.

The engine runs all four levels and reports them separately, because "dairy" and "milk specifically" are different claims and conflating them is how food apps mislead people.

**Dose handling.** Binary exposure (any/none) is the default. When a food or tag has ≥ 15 exposure days with meaningful variance, the engine additionally fits a dose-response using tertiles of the user's own intake distribution. A monotone dose-response upgrades confidence by one tier; a non-monotone one caps it.

---

## 5. Step 4 — Eligibility filter (run before estimating anything)

A comparison is discarded, silently and before it can ever reach the UI, unless **all** hold:

| Gate | Default | Why |
|---|---|---|
| Exposed days | ≥ 10 | Below this, intervals are so wide the estimate is meaningless |
| Unexposed days | ≥ 10 | Need a real comparison group |
| Outcome events in each arm | ≥ 3 | Avoids separation and zero cells |
| Total analysed days | ≥ 21 | Under three weeks, weekly rhythms dominate |
| Exposure prevalence | 10%–90% | An exposure present on 95% of days has no contrast |
| Day weight | `w(d) ≥ 0.4` | Excludes badly-logged days |

**This filter is the single most important piece of the engine.** Almost all bad food-app advice comes from reporting a 3-vs-2 comparison as a finding.

---

## 6. Step 5 — Estimation

### 6.1 Binary outcome, binary exposure

Primary estimate: **risk difference** (percentage-point difference), because it is the one lay-interpretable effect measure. Odds ratios are computed and stored, but never shown to the user as the headline.

- Point estimate: `RD = p_exposed − p_unexposed`
- Interval: Wilson score interval on each proportion, Newcombe hybrid for the difference — well-behaved at the small n we live with, unlike the Wald interval.
- Test: Fisher's exact for small cells; χ² otherwise.
- Weighting: each day contributes `w(d)`; effective n is `Σw` rather than a raw count.

### 6.2 Continuous outcome

- Estimate: difference in means with Welch's correction, plus a rank-based Hodges–Lehmann shift as a robustness check. If the two disagree in sign, confidence is capped at `low` and a `distribution_skew` warning is attached.
- Report standardised effect (Cohen's d) alongside the raw difference in the outcome's own units, because "0.8 points of bloating" means more to the user than "d = 0.42".

### 6.3 Confounder adjustment

Fixed confounder set for the Gut Health pack, taken from the trackers the user actually has enabled:

`sleep < 6 h` · `stress ≥ 4/5` · `alcohol any` · `NSAID any` · `antibiotic within 14 days` · `menstrual phase (if tracked)` · `travel/away-from-home flag` · `exercise ≥ 60 min` · `weekend` · `total daily kcal quartile`

Two adjustment strategies, chosen by data volume:

- **n < 60 analysed days → stratified reporting.** Compute the effect within strata of the single strongest confounder and report whether the direction holds. Regression on 40 days with 8 covariates is overfitting theatre; don't do it.
- **n ≥ 60 → penalised logistic / linear regression** (ridge, λ chosen by 5-fold CV) with the confounder set, reporting the adjusted effect and the change from the crude estimate. A crude-to-adjusted change > 30% raises a `confounding_detected` warning that is shown to the user.

### 6.4 Serial correlation

Consecutive days are not independent — a bad gut week is a real thing. Ignoring this inflates significance.

- Estimate lag-1 autocorrelation of the outcome series.
- If `|ρ₁| > 0.2`, compute a **block bootstrap** (moving block, block length ≈ `n^(1/3)`, 2000 resamples) interval instead of the parametric one, and use it for the reported CI.
- Record `rho_1` on the association so the evidence card can disclose it.

### 6.5 Reverse causation and time-order guards

- A meal is only an exposure for outcomes **strictly after** the meal's timestamp. Same-day-but-earlier stools are excluded from the 0–6 h window.
- **Reverse-causation check:** if the user tends to change what they eat *after* a bad day (e.g. eats plain rice after diarrhoea), a naive analysis will implicate rice. The engine therefore also fits the reverse direction (outcome day `d` → exposure day `d+1`). If the reverse effect is as strong as the forward one, a `possible_reverse_causation` warning is attached and confidence is capped at `low`. This is a common and badly-handled failure mode in food-tracking apps.

---

## 7. Step 6 — Multiplicity

The engine tests hundreds of exposure × outcome × lag combinations. Uncorrected, roughly 5% will look "significant" by chance and the app becomes a random-food-blaming machine.

- Benjamini–Hochberg FDR at **q = 0.10** across all comparisons within a run.
- The family is defined per (outcome, lag window) to avoid over-penalising.
- Nested exposures (food ⊂ tag ⊂ nutrient) are grouped so a real dairy effect isn't counted as three independent discoveries.
- **q-value, not p-value, drives the confidence tier.** The p-value is stored but never displayed alone.

---

## 8. Step 7 — Confidence tiers

The tier is what the user actually reads, so it must be conservative.

| Tier | Requirements (all must hold) | UI treatment |
|---|---|---|
| **none** | Fails eligibility | Not shown at all |
| **low** | Eligible, \|effect\| above the minimum interesting threshold, q < 0.25 | Grey card in "Early signals", collapsed by default. Copy: *"a hint, not a finding"* |
| **medium** | q < 0.10, ≥ 20 exposed days, effect survives confounder adjustment with < 30% attenuation, no reverse-causation warning | Full card, **"Test this"** button prominent |
| **high** | All of medium, **plus** at least one of: monotone dose-response; the effect replicates in two non-overlapping halves of the time series; or a completed trial confirms it | Full card, and only trials can put an *observational* association here |

**Minimum interesting effect** (below which nothing is shown regardless of significance): risk difference ≥ 15 pp for binary outcomes, or Cohen's d ≥ 0.35 for continuous. A statistically significant 3-pp effect is not worth changing your diet over, and showing it is a disservice.

---

## 9. Step 8 — Narrative generation

The LLM's job is translation, not analysis. See `03-api-spec.md` §10 for the interface constraints. The payload it receives:

```jsonc
{
  "exposure_label": {"en":"Dairy (lactose)","he":"מוצרי חלב"},
  "outcome_label":  {"en":"Loose stool (Bristol 6–7)","he":"יציאה רכה"},
  "lag": "6–24 hours",
  "rate_exposed": 0.44, "rate_unexposed": 0.19,
  "n_exposed": 41, "n_unexposed": 57,
  "risk_difference": 0.25, "ci": [0.09, 0.41], "q": 0.031,
  "adjusted_for": ["sleep<6h","alcohol","stress","NSAID"],
  "attenuation": 0.12,
  "warnings": ["weekday_imbalance"],
  "confidence": "medium",
  "locale": ["en","he"]
}
```

Required output shape: 2–4 sentences per locale, stating what was observed, how much of it there was, one caveat, and one next step. Banned: any causal verb, any number not present above, any medical term not present above, any recommendation to start or stop a medication.

Validation before storage: (a) every numeral in the output appears in the input; (b) forbidden-phrase lint passes; (c) both locales present. Failure → deterministic template fallback:

> *"On the {n_exposed} days you had {exposure}, {outcome} happened {rate_exposed}% of the time, compared with {rate_unexposed}% on the {n_unexposed} days you didn't. That's a difference of {rd} percentage points. This is an association, not proof — {warning}. The reliable way to find out is a short trial."*

---

## 10. Step 9 — N-of-1 trials

The part that turns a suspicion into something you can act on. Design follows established single-patient trial methodology: blocked assignment, defined washout, pre-registered outcome, and Bayesian estimation rather than p-values.

### 10.1 Design A — Elimination & reintroduction (default)

Best for a specific food or class with a plausible dose threshold.

| Phase | Length | What happens |
|---|---|---|
| **Baseline** | 7 days (or reuse the last 14 days of existing data if coverage ≥ 70%) | Normal eating. Establishes the outcome's baseline rate and variability. |
| **Elimination** | 14 days | Target fully removed. Auto-exposure detection flags slips. |
| **Washout** | 3 days | Still eliminated. Lets the elimination effect stabilise before challenge. |
| **Challenge** | 3 days, escalating | Day 1 low dose, Day 2 moderate, Day 3 high. Doses are target-specific (e.g. lactose: 100 ml → 250 ml → 500 ml milk). |
| **Follow-up** | 3 days | Target removed again. Captures delayed reactions. |

Total ~30 days, or ~23 if baseline is reused.

**Stopping rules:** a strong reaction during challenge (outcome ≥ 2 SD above the elimination-phase mean, or a severity ≥ 8/10 symptom) ends the challenge early and is recorded as a positive result, not as a failure. The user can stop at any time; a stopped trial reports what it has.

### 10.2 Design B — Alternating blocks (for frequent, low-stakes exposures)

For something eaten most days where full elimination is impractical (coffee, bread). Blocks of 4 days, ABBA or randomised in pairs, 4–6 blocks. Counterbalancing beats randomisation at ≤ 3 blocks; randomise at 4+.

### 10.3 Design C — Dose reduction

For exposures where "none" isn't realistic. Three levels of the user's own intake distribution (habitual / half / quarter), 5 days each, order counterbalanced.

### 10.4 Pre-registration

Every trial writes its hypothesis **before** it starts and the record is immutable:

```jsonc
{
  "primary_outcome": "stool.any_abnormal",
  "direction": "decrease_during_elimination",
  "minimum_interesting_effect": 0.20,       // 20pp
  "min_adherence": 0.85,
  "min_days_logged": 0.70,
  "analysis": "bayesian_beta_binomial",
  "prespecified_at": "2026-08-21T10:00:00+03:00"
}
```
This is what stops the trial from being reinterpreted after the fact into whatever result the user hoped for.

### 10.5 Analysis of a completed trial

Bayesian, because with a single participant a posterior probability is what the user actually wants to know, and a p-value on n=30 days is close to meaningless.

**Binary outcome:** Beta-Binomial per phase.
- Prior: `Beta(1,1)` on the baseline rate; the elimination-phase rate uses a weakly informative prior centred on the baseline (`Beta(2,2)` scaled) to avoid overreacting to a lucky fortnight.
- Report `P(RD > minimum_interesting_effect | data)` and the 95% credible interval on the risk difference.

**Continuous outcome:** Bayesian estimation of the phase-mean difference with a Student-t likelihood (robust to the outliers that a single bad day produces), plus an AR(1) term when lag-1 autocorrelation exceeds 0.2.

**Verdict mapping:**

| Posterior probability of a meaningful effect | Verdict shown |
|---|---|
| ≥ 0.90 | **Likely a trigger for you** |
| 0.70 – 0.90 | **Probably a trigger — consider repeating** |
| 0.30 – 0.70 | **Inconclusive** |
| ≤ 0.30 | **Probably not a trigger** — and this is presented as a *win*, because it gives food back |

**Adherence gating:** adherence below `min_adherence`, or logged days below `min_days_logged`, forces **Inconclusive** regardless of the posterior. A trial you didn't follow cannot produce a negative result.

**Every verdict card carries a limitations block**, generated deterministically: unblinded, single participant, expectation effects possible, not generalisable to other people, and a suggestion to repeat if the result matters and was borderline.

### 10.6 Blinding — what's honest to promise  *(rewritten, D32/D33)*

The earlier version of this section said true blinding is not possible and stopped there. That is half right, and the half it got wrong is the important half.

Blinding is impossible for an apple. It is entirely feasible for **isolated fermentable carbohydrates** — which is exactly the FODMAP subgroup structure this app already models. Three precedents, in ascending order of supply-chain difficulty:

| Method | Precedent | Covers |
|---|---|---|
| Powder in water | *Gastroenterology* 2024 — seven indistinguishable powders plus a glucose control, 3×/day × 7 days | lactose, fructose, GOS, fructan, mannitol, sorbitol |
| Concealment in a food matrix | Skodje 2018 — gluten 5.7 g, fructan 2.1 g in muesli bars | gluten, isolated fructans |
| **Self-blinding** | eLife 2021;10:e62878 — user fills opaque capsules, assembles day-labelled weekly envelopes, draws them by QR + RNG; **the decryption key stays server-side**. 1.3% procedural error rate at 0.5–1% of clinical-study cost | anything capsule-deliverable, with no supply chain at all |

The self-blinding protocol is the one that fits a self-hosted app: the user does the physical work, the server holds the allocation, and the user cannot know the arm while the analysis can reconstruct it exactly.

**Why this is not optional.** In the blinded FODMAP reintroduction trial the **inert glucose control triggered a >50-point IBS-SSS rise in 26% of participants** — higher than sorbitol and comparable to fructose and lactose. Skodje found **37% of self-diagnosed gluten-sensitive people peaked on placebo**, more than the 22% who peaked on gluten. Across ten pooled NCGS challenges (1,312 adults) only 16% showed gluten-specific responses and **40% of "responders" were nocebo**. An uncontrolled trial engine manufactures a false trigger roughly one time in four. That is not a rounding error; it is a diet the user restricts for nothing.

**Design D — blinded challenge.** Available only when the target has an isolated-compound form. Mandatory inert control period (glucose powder, or an empty capsule). Randomised, counterbalanced order. Sealed allocation with the key held server-side and revealed only at verdict time.

**Designs A–C remain open-label**, and their verdict cards must carry the string *"open-label — hypothesis-generating, not confirmatory"*. This is a copy-lint-enforced requirement, not a suggestion.

**Blinding-guess capture (D33) applies to every design, blinded or not.** At the end of each challenge period the app asks *"which do you think you got?"*. This matters more than it looks: in the eLife study the break-blind rate was 0.72 against a chance baseline of 0.62, and when **guess** was entered into the models the between-group differences vanished — while holding actual condition fixed, **21 of 22 comparisons differed by guess**. Belief, not substance, drove the effect. So:

- report the break-blind rate on the verdict card;
- run the primary analysis by allocation and a sensitivity analysis by guess;
- **when the two diverge, say so on the card.** In an open-label trial the guess-stratified analysis *is* the expectation-effect measurement, and it is the only honest one available.

The limitations block states which design was used and whether the trial was blinded.

### 10.7 Washout — symptom-gated and analytic  *(D37)*

The 3-day washout in §10.2 matched consumer protocols (Monash 2–3 d, Whole30 2–3 d, AIP 3–7 d) and was **shorter than the research protocols**. Skodje used ≥7 days, *extended until symptoms from the previous challenge resolved*. Monash's own wording is "2–3 days **or until symptoms settle**", and to begin a challenge only when symptoms are well controlled. We implemented the number and dropped the condition.

Two distinct washouts, and both are now required:

1. **Physical washout** — `max(3 days, days until the outcome returns within δ of the elimination-phase baseline)`, capped at 10 days. On hitting the cap the app surfaces *"this is taking longer than expected"* and offers to extend, pause or abandon; it never silently proceeds into a challenge on an unsettled baseline.
2. **Analytic washout** — the first `k` days of each period are excluded from the likelihood, with `k` fixed in the pre-registration. This is the standard remedy where a physical washout is impractical, and it is cheap to apply on top of one.

Both are reported on the verdict card: the physical washout actually taken, and the number of days discarded analytically.

Carryover itself is **not estimable** from a single participant with few crossovers. The verdict must state that carryover was not estimated rather than implying it was controlled; it becomes estimable only under opt-in aggregation across users, which is out of scope for v1.

### 10.8 The null verdict  *(D38)*

"No meaningful effect" must be a conclusion the engine can positively reach, not merely a failure to reject.

Every pre-registration declares a **ROPE** (region of practical equivalence) around zero — for a binary outcome, a risk difference within ±`minimum_interesting_effect`; for a continuous outcome, a phase-mean difference within ±δ. The verdict is then one of four, not two:

| Verdict | Rule |
|---|---|
| **Effect** | P(effect > MIE \| data) ≥ the pre-registered bar |
| **No meaningful effect** | P(effect ∈ ROPE \| data) ≥ the pre-registered bar |
| **Inconclusive** | neither bar met; credible interval spans the ROPE boundary |
| **Abandoned** | completion floor not met (see D42) |

A "no meaningful effect" verdict is presented as a **result the user earned**, with the same visual weight as a positive finding, and it closes the loop on that food — including removing it from the suspect list and from any active restriction. The most common failure of this whole category is that a user's effort has no legible endpoint; a null that the app can state confidently is that endpoint.

---

## 11. Guardrails against harm

An app that suggests removing foods can cause real damage — nutritional deficiency, food fear, and in some people a slide into disordered restriction. These rules are mandatory, not advisory:

1. **Maximum 1 active elimination trial at a time.** Hard limit.
2. **Elimination-load cap:** if the user has already eliminated ≥ 3 food groups, the app refuses to propose a fourth and instead suggests reintroducing something first, explaining why.
3. **Reintroduction is mandatory in the design.** No trial ends at "removed forever". Every eliminated food gets a scheduled challenge.
4. **Nutritional adequacy check:** eliminating a whole group (dairy, grains, legumes) triggers a plain note on which nutrients typically come from it and a suggestion to talk to a dietitian — not a supplement recommendation.
5. **Restriction-pattern watch:** if the count of distinct foods logged per week drops by > 40% from the user's own baseline, or total intake trends sharply down, the app surfaces a gentle, non-clinical check-in and stops proposing new eliminations. It does not diagnose anything.
6. **Red-flag rules always outrank insights.** If a red flag is active, insight and trial cards are visually de-emphasised beneath the "see a doctor" card.
7. **Never suggest stopping a medication**, ever, even when a medication is the strongest statistical signal in the data. The copy for that case is fixed: *"Your data shows a pattern around {medication}. That's worth showing to whoever prescribed it — don't change it on your own."*

---

## 12. Engine parameters (all configurable)

```jsonc
{
  "min_exposed_days": 10,
  "min_unexposed_days": 10,
  "min_outcome_events_per_arm": 3,
  "min_total_days": 21,
  "exposure_prevalence_range": [0.10, 0.90],
  "min_day_weight": 0.4,
  "lag_windows_hours": [[0,6],[6,24],[24,48],[24,72]],
  "fdr_q": 0.10,
  "min_interesting_rd": 0.15,
  "min_interesting_d": 0.35,
  "autocorr_threshold": 0.2,
  "bootstrap_resamples": 2000,
  "confounder_attenuation_warn": 0.30,
  "max_active_trials": 1,
  "max_concurrent_eliminations": 3,
  "trial_default": { "baseline_days": 7, "elimination_days": 14,
                     "washout_days": 3, "challenge_days": 3, "followup_days": 3 }
}
```

---

## 13. Validation of the engine itself

Before this ships, it gets tested against data with a **known** answer:

1. **Synthetic generator** — produce day series with an injected effect of known size, lag, prevalence and confounding. Assert the engine recovers the effect within its stated CI, and that its confidence tiers are calibrated.
2. **Null data test** — 500 simulated users with *no* real effect. **Requirement: fewer than 10% of runs surface any `medium`+ insight.** If the engine invents findings from noise, it is worse than useless.
3. **Power curves** — document, for each outcome type, how many days are needed to detect a 15/25/40-pp effect at 80% power. Show this to the user as "you'll need about N more days" instead of an empty screen.
4. **Reverse-causation fixture** — a series where diet changes *after* bad days. Assert the engine flags it rather than reporting the spurious effect.
5. **Missing-data fixture** — 40% of days missing, non-randomly (worse days logged more). Assert the day-weighting handles it and the run summary discloses the bias risk.

Test 2 is the acceptance gate. Nothing ships until it passes.

---

## 14. Addendum v1.1 — numbers the UI shows that the engine must actually produce

The audit found several figures in the mock-ups that no part of this document could generate. Each is defined here, or the mock-up is corrected.

### 14.1 "You'll need about N more days"

Shown on every "Not enough data yet" row. Computed by `POST /analyze/power`:

```
Given the user's own observed exposure prevalence p_e for that exposure,
and the minimum interesting effect δ (0.15 RD by default):

  n_pairs_required = power_n(two_proportion, p1 = p_base + δ, p2 = p_base,
                             power = 0.80, alpha = 0.05)
  n_exposed_needed = max(min_exposed_days, n_pairs_required)
  days_more        = ceil( (n_exposed_needed − n_exposed_now) / p_e )
```

- The card states the assumption in words, never as a bare number: *"about 4 more days where you eat eggs, if the effect is at least the size worth acting on."*
- If `p_e < 0.10` the number is not shown at all. Instead: *"You eat this too rarely for me to compare it fairly."* A number computed from a prevalence that low would be a fiction.
- If `days_more > 180`, the same suppression applies, phrased as *"this would take longer than is useful."*

### 14.2 Binary symptom outcomes

The Insights mock-up shows "mornings with bloating ≥ 5/10", which the original outcome catalogue could not express — `symptom.bloating` was continuous only. The catalogue gains a binary companion for every continuous symptom outcome:

| Key | Definition |
|---|---|
| `symptom.<name>_notable` | that symptom recorded at **≥ 5/10** on the day |

Both forms are analysed; the binary one is preferred for display because a risk difference in percentage points is far easier to act on than a shift in mean severity. The threshold is a tracker-definition parameter, not a constant.

### 14.3 Why the trial bar (20 pp) is higher than the observational bar (15 pp)

Deliberate, and now stated. The observational threshold governs *what is worth investigating*; the trial threshold governs *what is worth changing your diet over*. A trial is expensive in effort and carries a real restriction cost, so it pre-registers a higher bar. Both are configurable and both are shown to the user at the moment they matter.

### 14.4 Trial power — what "adequate" means on the proposal screen

The proposal's power statement is not the observational power curve. It is:

```
Simulate the pre-registered design 2,000 times under
  H1: the outcome rate shifts by exactly `minimum_interesting_effect`
using the user's own baseline rate and their own observed logging frequency.
"Adequate" = the pre-registered Bayesian decision rule reaches P > 0.90
             in at least 80% of simulations.
```

If a design is not adequate, the proposal says so and offers a longer elimination phase rather than quietly proceeding. A trial that cannot answer its own question should not be started.

### 14.5 Choosing a trial design

| Condition | Design |
|---|---|
| Exposure prevalence < 40% of days and full removal is realistic | **A** — eliminate & reintroduce (default) |
| Prevalence ≥ 40% (eaten most days) | **B** — alternating blocks |
| Prevalence ≥ 40% **and** the user rejects full removal, or dose-response was detected | **C** — dose reduction |

Designs B and C reuse Design A's screens with relabelled phases (`08` §9.2, `09` S80–S89). The user can override the choice from `Adjust`.

### 14.6 The avoid list as an engine input

An active `avoid_entry` (D17) does three things:
1. Suppresses new trial proposals for that target for 90 days.
2. Counts toward `max_concurrent_eliminations` in §11.2.
3. Is **not** excluded from association analysis — if the user eats it anyway, those days are still data, and a signal appearing there is exactly what would justify removing it from the list.

### 14.7 Verdicts on early-stopped trials

A trial stopped before its final day still produces a posterior, computed on the phases that completed. The verdict is labelled `partial` and its limitations block gains a fixed line: *"Stopped on day 9 of 14, so this is less certain than a finished trial would be."* Adherence gating still applies. A partial trial never produces a `high` confidence upgrade for its originating association.

### 14.8 Engine parameters added

```jsonc
{
  "notable_symptom_threshold": 5,
  "trial_power_simulations": 2000,
  "trial_power_target": 0.80,
  "trial_min_interesting_rd": 0.20,
  "avoid_list_suppression_days": 90,
  "dismissal_reopen_delta": 0.10,
  "design_b_prevalence_threshold": 0.40,
  "days_more_max_shown": 180,
  "days_more_min_prevalence": 0.10
}
```

---

## 15. Addendum v1.4 — how long this actually takes (the power reality)

A power calculation run against the realistic logging pattern (5 days/week, exposure present on ~40% of days, 20% baseline rate of an abnormal-stool day) produced the finding that should govern every promise this app makes:

| Logging for | Smallest risk difference detectable at 80% power |
|---|---|
| 6 weeks (30 days) | ~54 pp |
| 8 weeks (40 days) | ~47 pp |
| 12 weeks (60 days) | ~38 pp |
| 16 weeks (80 days) | ~33 pp |
| 26 weeks (130 days) | ~26 pp |
| 52 weeks (260 days) | ~18 pp |

Read that table before writing any user-facing copy about timelines. **`min_interesting_rd = 0.15` is a one-year threshold, not a six-week one.** The v1.0 onboarding line "around 6 weeks the findings get good" was wrong by roughly a factor of three, and shipping it would have produced a user who quits in month two believing the app is broken when it is merely early.

### 15.1 Three consequences, all mandatory

**(a) Honest timeline copy.** Day-one and the Insights empty states say 3–4 months for a clear effect, 6+ for a subtle one. The "not enough data yet" line already computes a real number per exposure (§14.1) — that number is now the primary way expectations are set, and the generic reassurance is secondary.

**(b) Continuous outcomes rank above binary.** A continuous daily severity score is roughly twice as efficient per logged day as a binary good/bad classification:

| Effect | Continuous (Cohen's d) | Binary equivalent |
|---|---|---|
| moderate | d = 0.5 → ~32 weeks | ~26 pp → ~26 weeks |
| noticeable | d = 0.8 → ~12 weeks | ~40 pp → ~12 weeks |

Both are computed; **the continuous form leads the ranking and the display** wherever a tracker offers one, because it reaches a conclusion months earlier for the same effort. Binary outcomes remain for stool, where "abnormal or not" is genuinely the question.

**(c) Trials get longer.** This is the most important change. A 14-day elimination against a 14-day baseline resolves roughly a 45 pp shift and returns *inconclusive* below it — which would have made most trials a waste of three weeks of restriction.

| Detect a shift of | Days needed per phase (30% base rate) |
|---|---|
| 50 pp | 15 |
| 40 pp | 24 |
| 30 pp | 42 |
| 25 pp | 61 |

Revised defaults in §12: **`elimination_days: 21`** (was 14), **`baseline_days: 14`** (was 7, and reuse of existing data is now strongly preferred), washout 3, challenge 3, follow-up 3. Total ~44 days, or ~30 when the baseline is reused.

The proposal screen states the trade in plain words rather than burying it: *"Three weeks is the shortest window that can actually answer this. A two-week version would probably come back 'inconclusive', which wastes the effort of doing it."*

### 15.2 Why trials still beat waiting

Observation waits for exposed and unexposed days to occur naturally, at whatever prevalence your habits produce, tangled with every confounder. A trial **manufactures** them: 21 clean exposed days and 21 clean unexposed days, adjacent in time, with a reintroduction challenge on top. That is why a ~6-week trial can settle a question that observation would need 6 months to approach — and why the app should push a user with a medium-confidence suspect toward testing it rather than toward logging another month.

### 15.3 Parameters revised

```jsonc
{
  "min_interesting_rd": 0.15,          // unchanged, but now labelled a long-horizon threshold
  "display_threshold_rd": 0.25,        // NEW — below this, an observational finding is filed
                                       // under "early signals" no matter how good its q-value
  "prefer_continuous_outcomes": true,  // NEW — ranking and display preference
  "trial_default": { "baseline_days": 14, "elimination_days": 21,
                     "washout_days": 3, "challenge_days": 3, "followup_days": 3 },
  "trial_min_days_per_phase": 15       // NEW — refuse to propose a trial shorter than this
}
```


---

## 16. Addendum v1.6 — estimated timestamps (D31)

Batch logging (`08` §4.15) means many meals will carry a time the app inferred rather than one the user observed. Treating those as exact would quietly corrupt the shortest lag window, where an hour is the whole signal.

### 16.1 The rule

| `time_precision` | 0–6 h | 6–24 h | 24–48 h | 24–72 h |
|---|---|---|---|---|
| `exact` | ✓ | ✓ | ✓ | ✓ |
| `slot_estimate` | **excluded** | ✓ | ✓ | ✓ |
| `day_only` | **excluded** | **excluded** | ✓ | ✓ |

An excluded exposure-day is simply absent from that window's comparison — it is not counted as unexposed, which would be a much worse error than dropping it.

### 16.2 What it costs, honestly

Almost nothing where it matters. The 6–24 h window carries most food→gut effects (§4), and it is untouched. The 0–6 h window loses power for anyone who logs at night — but a 0–6 h finding built on a made-up time was never a finding, so what is lost is a false result rather than a true one.

The run summary states it plainly: *"41 of your 98 days had estimated meal times, so the immediate-reaction window is based on 57 days rather than 98."* If the user wants immediate-reaction findings, the app tells them what would buy it: **logging meals as they happen, or tapping the time to set it exactly.** That is a concrete, honest instruction rather than a vague "log more".

### 16.3 Day-weight is unaffected

An estimated time is still a logged meal. `meal_coverage` in the day-weight formula (§2) counts it fully. Precision and completeness are different things, and conflating them would punish the user twice for the same behaviour.

### 16.4 Parameters

```jsonc
{
  "time_precision_min_window": {
    "exact": 0,
    "slot_estimate": 6,
    "day_only": 24
  },
  "slot_median_min_observations": 3,
  "exact_recording_delay_hours": 2
}
```

---

## 17. Cumulative load and the day-one prior (D40, D45)

Both are P1. Both are specified here rather than left to implementation, because each is a place where a plausible-looking shortcut produces a dishonest number.

### 17.1 Cumulative FODMAP load (D40)

The single commonest complaint in IBS apps is *"I ate only safe foods and still reacted."* Monash's own position explains it: total load is cumulative **across subgroups** — fructose, fructans, lactose, GOS and polyols all contribute to one total — and their green-serve cut-offs were set conservatively **precisely to allow more than one green serve per sitting**. Their practical guidance is to space meals and snacks at least 2–3 hours apart.

So a per-meal model is the wrong shape. The engine maintains a **rolling per-subgroup load curve**:

```
L_g(t) = Σ  dose_g(m) · exp( −(t − t_m) / τ_g )
        m≤t
```

where `g` is the FODMAP subgroup, `dose_g(m)` is the subgroup dose of meal `m`, and `τ_g` is the subgroup's clearance constant. `τ` defaults come from `config/analysis.json` and are **assumptions, labelled as such** — not measurements. A total load curve `L(t) = Σ_g w_g · L_g(t)` carries subgroup weights that are likewise configured defaults.

The exposure available to the association engine becomes `max(L(t))` over the day and `∫L dt`, alongside the existing per-food and per-tag exposures. This is the representation that can distinguish "onion is a trigger" from "onion on a day you'd already had bread and yoghurt is a trigger" — and the second is much more often the true statement.

**The personal threshold** is estimated from N-of-1 dose-ladder data, never looked up. Three constraints, all of which must reach the UI:

1. Below three completed dose ladders there is **no threshold** — the curve is shown, no line is drawn on it.
2. The threshold carries a credible interval and is drawn as a **band, not a line**.
3. The copy says it is estimated. The 2024 blinded reintroduction trial used **fixed** daily doses per cycle and therefore did not establish per-person dose-response; Monash asserts cumulative dosing as clinical doctrine but the quantitative per-person threshold is an open question in the literature. We are estimating something nobody has published, which is a reason for visible humility, not for silence.

**Data caveat:** per-food FODMAP composition is Monash's commercial asset. `config/food-tags/fodmap.json` carries subgroup *classes*, not gram quantities. Until an open composition source exists, `dose_g` is derived from portion mass × a coarse per-class density, and the resulting load is **ordinal, not absolute** — the y-axis is unlabelled by design. Do not print a gram figure the data cannot support.

### 17.2 The day-one prior (D45)

Today the engine says nothing for three weeks. That is honest and it is also the moment most users quit — median retention in remote digital health studies is 5.5 days, and over half discontinue inside week one.

The fix is not to lower the gate. It is to **start from a population prior and show it converging**.

For each candidate exposure–outcome pair, the risk difference is estimated as a Bayesian posterior whose prior is the population effect for that food class, weighted by a concentration parameter `κ`. As personal exposures accrue the posterior moves off the prior and the credible interval narrows. The UI renders exactly that: a bar whose width visibly shrinks, annotated with what is driving it.

```
  Dairy → looser stool
  ├──────────●──────────┤   based on people generally
  ····· your 6 exposures so far ·····
  [ What would change this? ]
```

Three rules that make this honest rather than the thing ZOE does:

- **The prior is labelled as a prior, every time it dominates.** While `n_personal < κ`, the card reads *"this is what's typical, not what's yours"*. ZOE's day-one score **is** a population model presented as personalisation and is never labelled as such; that is the specific behaviour we are declining to copy.
- **A prior never promotes a claim past the confidence gate.** The gates in §9 apply to the *personal* evidence only. A population prior can rank a suspect and can populate a chart; it can never produce a "likely trigger" tier or propose a trial on its own.
- **Where the personal data contradicts the prior, the personal data wins visibly** — the card says *"typical is the opposite; yours doesn't look like that"*. This is the single most valuable output the whole prior mechanism can produce, and it is only possible because both are on screen.

The licence for doing this at all comes from Food4Me, the largest personalised-nutrition RCT run: personalising on **self-reported diet alone** captured essentially the entire measurable benefit, and adding phenotype and genotype added nothing. We already hold the input that mattered. The prior is a starting point for it, not a substitute.
