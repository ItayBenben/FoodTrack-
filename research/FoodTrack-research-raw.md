# FoodTrack — raw competitive research dump

**Generated:** 23 August 2026 · **Scope:** five parallel web sweeps, ~480 tool calls total across the five agents.

This is the **unedited output of all five research sweeps**, verbatim. It is the evidence base behind `docs/10-competitive-gaps.md`, which is the decided version. Where the two disagree, doc 10 wins — it was written after cross-checking every claimed gap against what the specs already cover, and several "gaps" the agents proposed turned out to be things FoodTrack already specifies.

## How to read this

Every agent was instructed to verify claims from real fetched pages and to mark anything it could not confirm as `UNVERIFIED`. Those markers are load-bearing — an UNVERIFIED claim was **not** used as the basis for any decision in doc 10. Vendor-authored claims (a company's own benchmark, a competitor's comparison page) are flagged inline as such.

Known access limitations across the sweeps, so you know what is missing rather than absent:

- **Reddit** (reddit.com, old.reddit.com) blocked automated fetching in every sweep. Patient-voice evidence leans on App Store / Play Store review mining and forum threads instead.
- **PubMed and PMC** consistently served reCAPTCHA rather than content. Where a journal claim appears below it was verified from the publisher's own page, a guideline document, or a society summary.
- **Elsevier properties** (ScienceDirect, gastrojournal, cghjournal, jclinepi), **Wiley** and **LWW** returned 403/402.
- **data.gov.il** returned 404/robots-disallowed on every path tried, including the CKAN API. The Israeli National Nutrition Database (צמרת) is therefore described from third-party corroboration only, and retrieving it manually is an open task.
- Sweep 3 and sweep 4 exhausted the 200-call WebSearch session cap; sweep 4 additionally hit HTTP 429 on its last few fetches.

## Contents

| § | Segment | Agent | File |
|---|---|---|---|
| 1 | Gut & IBS-specific apps | Research gut and IBS apps | `gut-ibs-apps.md` |
| 2 | General symptom trackers with correlation engines | Research symptom trackers | `symptom-trackers.md` |
| 3 | Mainstream food loggers — food-entry UX | Research food logging UX | `food-loggers.md` |
| 4 | Personalised nutrition, microbiome, CGM | Research personalised nutrition | `personalised-nutrition.md` |
| 5 | N-of-1 platforms and the methodology literature | Research N-of-1 methodology | `n-of-1.md` |

---


# § 1 — Gut & IBS-specific apps

# Gut Health / IBS Tracking & Trigger-Identification Apps — Competitive Research Report

Compiled from ~45 searches/fetches across app stores, company sites, clinical literature, and third-party reviews. Reddit's own site blocked automated fetching (403/robots.txt) in this session, so patient-voice evidence below leans on app-store review mining and one forum thread rather than live Reddit threads — flagged explicitly where that matters.

---

## 1. Food/Symptom Correlation Trackers (general-purpose diary + analysis)

### Cara Care (HiDoc Technologies / Perfood GmbH, Germany)
- **Core loop**: log food (photo-assisted), bowel movements, symptoms (bloating/pain/diarrhea/constipation), stress, sleep, meds, period. Dashboard classifies days as "best days" vs "worst days" and shows which foods cluster on each.
- **Analysis approach**: binary day-classification, not a correlation coefficient or p-value. This is a real weakness in practice — users report the algorithm "incorrectly categorizes foods, listing items from worst days as best days and vice versa," and it doesn't separate same-day vs. next-day reactions ([justuseapp reviews](https://justuseapp.com/en/app/1133687886/cara-care-ibs-fodmap-tracker/reviews)).
- **Features**: 12-week structured IBS program bundling unlimited **text chat with a human dietitian**, validated questionnaires for progress tracking, low-FODMAP recipe library, Bristol scale, Apple Health sync, PDF export. Approved as a **prescription digital therapeutic (DiGA) in Germany**.
- **Complaints**: data loss on reinstall with slow support; no barcode scanning; no CSV export; no portion/quantity tracking; can't change diagnosed condition after onboarding; ignores meds/illness in day-scoring; delayed (48h+) reactions not modeled.
- **Business model**: free tracking tier + paid 12-week dietitian program; insurance-billed in Germany; US availability uncertain post various corporate changes.
- Sources: [App Store](https://apps.apple.com/us/app/cara-care-ibs-fodmap-tracker/id1133687886), [Google Play](https://play.google.com/store/apps/details?id=com.gohidoc.cara&hl=en_US), [Lin Health comparison](https://www.lin.health/insights/best-apps-ibs)

### mySymptoms Food & Symptom Tracker (SkyGazer Labs)
- **Core loop**: manual, ingredient-level logging of food/drink/meds/stress/exercise/sleep/energy/Bristol-scale bowel movements. Large barcode-scannable food DB (500k+ items).
- **Analysis approach**: purpose-built **statistical correlation engine** with a **user-configurable analysis window (1–72 hours)** — genuinely lets you test different lag hypotheses per symptom, unlike most competitors' fixed windows. Outputs histograms, trend charts, and a clickable **event list** showing the actual instances behind each correlation (transparency/explainability that most competitors lack). Site now also markets an "AI looks for patterns" layer on top.
- **Clinician tooling**: dedicated **web-based Clinic app** for secure sharing, plus PDF/CSV export; HIPAA/GDPR compliant; multi-user family accounts.
- **Complaints**: steep learning curve/complex UI, fully manual entry (no photo logging historically), dated interface.
- **Pricing**: $9.99/mo, $39.99/6mo, $59.99/yr, 7-day trial; 1M+ users.
- Sources: [App Store listing](https://apps.apple.com/us/app/mysymptoms-food-diary/id405231632), [mysymptoms.net](https://www.mysymptoms.net/)

### Bowelle (iOS-only)
- **Core loop**: food + symptom + stress + hydration + bowel-movement logging with **fully user-defined custom fields** (text/number/tags) — the most flexible schema of any app reviewed.
- **Analysis**: visual charts over time to spot food↔symptom clusters; no stated statistics.
- **Structural traits**: strictly **on-device storage, no server upload unless explicitly shared**; Apple Health integration (weight/sleep/steps); doctor-export PDF.
- **Pricing/traction**: ~$24.99/yr; 4.7★ across ~2,200 ratings — strong validation for a narrow niche.
- Sources: [bowelle.com](https://bowelle.com/), [PoopCheck vs Bowelle comparison](https://poopcheck.app/compare/bowelle/)

### BowelApp
- **Core loop**: fast (1–2 tap) logging of bowel movements (Bristol, urgency, pain, blood/mucus, color), meals (free text + tags), gut signals, and daily context (sleep/stress/exercise/hydration/illness/travel).
- **Structurally clever bit**: every displayed statistic is benchmarked **two ways simultaneously** — against a **cited clinical reference range** (Bristol Stool Form Scale, Rome IV criteria, transit-time literature) *and* against **the user's own learned baseline** once enough history exists. This solves the "is this normal?" question on day one (via the clinical reference) while still personalizing over time (via the rolling baseline) — most apps only do one or the other.
- **Privacy**: zero account required, data lives in Apple's SwiftData on-device, nothing retained server-side except opt-in AI-insight requests and opt-in anonymous diagnostics.
- **Monetization**: free core tracking; Pro subscription **or micro-purchase of a single AI insight** — a pay-per-insight alternative to subscription that's rare in this category.
- Source: [bowelapp.com](https://bowelapp.com/)

### PoopCheck
- **Core loop**: photograph stool → AI vision model (trained on 140,000+ samples) auto-classifies **Bristol type, color, shape** in seconds — no manual scale selection.
- **Analysis**: composite **daily "gut health score"** blending stool classification, regularity, comfort, and lifestyle inputs; trend-based rather than single-entry.
- **Features**: "SOFTie" in-app AI chat assistant grounded in the user's scan history (Premium); pattern/correlation alerts across diet-stress-stool; social layer (25,000+ user community, anonymized); cloud-synced (contrast to Bowelle/BowelApp's on-device model) with end-to-end encrypted photo handling.
- **Pricing**: $6.99/mo or $49.99/yr Premium; free tier with no account required initially.
- Sources: [poopcheck.app](https://poopcheck.app/), [comparison page](https://poopcheck.app/compare/bowelle/)

### Balloon / Plop (stool trackers, mentioned in category roundups)
- Balloon: Bristol logging + **AI-driven fiber tracking**, Apple Watch app, "beautiful" UX, doctor reports. Plop: highly customizable clinical-feeling tracker (food/hydration/meds/symptoms), budget-friendly, visual analytics.
- Source: [balloonguthealth.com roundup](https://balloonguthealth.com/blog/best-ios-poop-trackers-for-2025)

### Dieta Health
- **Core loop**: log food/symptom diary in-app; after **7 days minimum** of entries, unlocks the **web-based "Dieta Analysis Dashboard"** with correlation visualizations and **ML-generated trigger predictions**.
- **Clinician model — the interesting bit**: "Clinician Connect" gives registered dietitians/GIs a **dedicated portal into a patient's raw diary + analysis**, and Dieta gives clinicians the product **free indefinitely** as a pilot-acquisition wedge — a B2B2C growth strategy where the professional becomes the free distribution channel for the paid consumer product.
- **B2B angle**: also sells to **employers** directly ("20% of your workforce has IBS") as a digestive-health benefit.
- Source: [dietahealth.com/d4business](https://dietahealth.com/d4business)

### Nutrola
- Verified ingredient-level food DB, AI photo logging, voice logging, barcode scanning (95%+ coverage), AI "Diet Assistant" for pattern detection, Apple Health/Google Fit sync. Positioned as nutrition-first with gut-health features layered on, not IBS-native. ~€2.50/mo.
- Source: [nutrola.app roundup](https://nutrola.app/en/blog/8-best-nutrition-apps-for-gut-health-2026)

---

## 2. The 2025–26 wave of "AI trigger-finder" apps

A cluster of new, cheap, subscription entrants has appeared very recently, all making similar AI/pattern-matching claims with **little to no published clinical validation**:

### Gutsy AI: IBS Trigger Finder — most structurally sophisticated of the wave
- **Core mechanism**: explicitly models that "food takes 6–72 hours to move through your digestive system, and that timing is different for every person" — it **learns each user's individual transit/lag time** from their own logs rather than assuming a fixed window, then attributes a symptom to the most probable causal meal within a **48-hour symptom window** adjusted by that learned transit time.
- **Features**: photo meal-logging with AI ingredient ID + FODMAP classification + **inflammatory-load scoring** (359-food DB); syncs **hydration, sleep, HRV, exercise from Apple Health** as covariates; daily 0–100 wellness score; structured 3-day FODMAP reintroduction challenges; displays **confidence levels** per identified trigger; doctor-ready PDF export.
- **Business-model trick**: **money-back guarantee explicitly tied to a cited clinical stat** — "86% of IBS patients improve within 6 weeks of identifying their triggers (Nanayakkara et al., 2016); if the program doesn't deliver at least one trigger identification, refund." Smart trust-building device even though it doesn't validate the app's own accuracy.
- **Pricing**: free tier; $19.99/mo or $149.99/yr.
- **Weakness**: no published validation of its own detection accuracy — the only citation backs the *general premise* (identifying triggers helps), not Gutsy's specific algorithm.
- Source: [App Store](https://apps.apple.com/us/app/gutsy-ai-ibs-trigger-finder/id6758587496)

### Triggerbites: AI Food Diary
- **Core mechanism**: **natural-language logging** ("write naturally, the AI extracts everything") rather than structured forms; auto-extracts ingredients and tags against **15+ parallel sensitivity frameworks simultaneously** — low-FODMAP, histamine, salicylates, oxalates, glutamates — so one log serves multiple hypotheses without re-entry.
- **Cold-start solver**: can **import historical data from PDFs, photos, and old notes**, directly addressing the "6 weeks isn't enough" problem by letting users backfill months of pre-existing records instead of starting from zero.
- **Output**: "ranked suspect foods" per symptom, filterable by meal/ingredient/tag/timeframe; configurable multi-window analysis up to 72h; "Nibbles" AI assistant for querying patterns conversationally; 12 languages; offline-first with sync.
- **Pricing**: $3.99/wk to $79.99/yr tiers.
- Source: [App Store](https://apps.apple.com/app/id6755041249), [Triggerbites' own competitor roundup](https://triggerbites.com/blog/best-food-diary-apps-2026)

### Gut Lens — "Find IBS triggers"
- **Core mechanism**: frames tracking as formal **7-day guided elimination/reintroduction "experiments"** rather than open-ended diary-keeping — each experiment has a hypothesis (suspected food), a structure, and an end-of-week readout.
- **Notable features**: **"Flare Risk Prediction"** — a forward-looking daily forecast rather than only backward-looking correlation; built-in gut-directed meditation sessions; voice logging; **toilet locator** (small, cheap, high-retention niche feature addressing real daily anxiety); doctor-ready PDF reports.
- **Pricing**: free + $7.99/mo or $79.99/yr.
- Source: [App Store](https://apps.apple.com/app/id6749161309)

### Oh My Gut! IBS Food Scanner
- **Core mechanism**: photo-scan a meal or restaurant menu → instant **"safe / caution / avoid" traffic-light call**, editable to add hidden ingredients (e.g. garlic powder) the photo couldn't see.
- **Structurally clever bit**: blends **personal history with a crowdsourced community-confidence layer** — e.g., shows "67% of users found this risky" alongside the individual's own emerging pattern. This gives new users a useful signal on day one, before they have enough personal data (a direct partial answer to the cold-start / "not enough data yet" problem).
- **Nudge design**: **automatic check-in prompt ~2 hours after logging a meal** to capture the delayed reaction while it's fresh, rather than relying on the user to remember.
- **Tracking**: one-tap meal/symptom logging, Bristol scale.
- Source: [App Store](https://apps.apple.com/app/id6749310645)

### Gut AI: Food Trigger Identifier
- Photo-based ingredient detection → correlates against logged symptoms. Thin feature set relative to peers; explicit disclaimer that it provides no citations for its recommendations. $6.99/mo or $49.99/yr.
- Source: [App Store](https://apps.apple.com/us/app/gut-ai-food-trigger-identifier/id6743772662)

### FODMAP Coach AI (Kesem Solutions)
- **Core mechanism**: trained on the **Monash FODMAP database**; photo food-ID + automatic FODMAP-content calculation; predicts symptom response from history.
- **Genuinely novel bit**: models **cumulative/stacking FODMAP load across a day** — i.e., dose accumulation across multiple meals rather than attributing symptoms to a single meal in isolation — plus detects **seasonal symptom variation**. Both are threshold/dose-response concepts almost no competitor implements.
- **Reintroduction**: auto-generates a personalized reintroduction schedule with reminders based on individual symptom history and preferences.
- Source: [fodmapcoach.kesemsolutions.com](https://www.fodmapcoach.kesemsolutions.com/best-fodmap-app.html) (company origin/nationality unconfirmed despite Hebrew-sounding name "Kesem")

**Pattern across this whole cluster**: nearly all of these ship with confident "AI finds your triggers" marketing but **carry no peer-reviewed validation of detection accuracy** — only Gutsy AI even cites a paper, and it backs the premise, not the product. This is both the biggest current complaint-in-waiting for this category and a clear opening for a competitor that publishes real validation data.

---

## 3. Structured FODMAP-diet apps (non-AI, protocol-first)

### Monash University FODMAP Diet App — the category's gold standard
- **What it is**: official Monash-certified food database with **traffic-light (green/amber/red) ratings**, structured **3-phase protocol** (elimination → reintroduction → personalization), 70+ recipes, branded-product listings, a symptom diary supporting phase 2 specifically.
- **Business model**: unusual **one-time ~$8–9.99 purchase**, not subscription — an outlier worth noting given how saturated with subscriptions this category is.
- **Complaints**: no FODMAP-subcategory filtering (can't isolate fructans vs. polyols etc.), missing serving-size/measurement guidance in recipes, contradictory bread classification, no calorie/macro tracking, no photo logging or AI.
- Sources: [App Store](https://apps.apple.com/us/app/monash-university-fodmap-diet/id586149216), [Casa de Sante review](https://casadesante.com/blogs/digestive-enzymes/comprehensive-review-monash-university-fodmap-app-for-ibs-management)

### IBS Coach: FODMAP Diet Planner
- **Fixed 28-day low-FODMAP elimination phase** followed by tolerance testing; dietitian-approved recipes; symptom/hydration/med/mood/sleep tracking; daily coaching modules bundling diet + stress-reduction + sleep.
- **Complaint worth noting**: the elimination-phase **start date can't be backdated**, forcing a full needless 28-day restart if a user begins logging retroactively — a small but telling UX failure mode for time-boxed protocols.
- **Pricing**: free + IAPs, £19.99/mo, tiered plans $5.99–$101.99.
- Source: [App Store](https://apps.apple.com/us/app/ibs-coach-fodmap-diet-planner/id1566098174)

---

## 4. Breath testing hardware

### FoodMarble AIRE / AIRE 2
- **What it is**: $269 handheld breath-analysis device measuring **hydrogen and methane** (AIRE 2 added methane over the original hydrogen-only AIRE); one-time purchase, no subscription.
- **App features**: "Challenges" mode walks users through **guided SIBO-testing protocol including a prep-diet**; separate **Food Intolerance Kit add-on** for single-substance challenge testing of lactose, fructose, sorbitol, and inulin; logs meals/symptoms/sleep/stress alongside breath scores; generates personalized dietary recommendations.
- **Real-world weakness (important)**: independent hands-on review reports significant **test-retest unreliability** — "the same food produced low fermentation levels one day and moderate-to-high the next," missed methane in lab-verified cases, and results that "don't correlate reliably with food intake or symptoms." Reviewer concluded it "did not give us any useful information we could act upon."
- Sources: [foodmarble.com](https://foodmarble.com/store/foodmarble-aire-2), [hands-on review](https://goodguttalk.com/blog/foodmarble-my-honest-thoughts-on-the-aire-2-device)

**Finding relevant to the "integration" question**: no consumer diary app found ingests FoodMarble breath data via an open API into a broader trigger-correlation engine — it's a closed loop (FoodMarble device → FoodMarble app only).

---

## 5. Gut-directed hypnotherapy & CBT digital therapeutics

### Nerva (Mindset Health)
- Self-guided **6-week audio program (~15 min/day)** built on the Monash gut-directed hypnotherapy protocol; pure therapeutic content, **no food/symptom tracking or correlation component**. Cited efficacy: 81% reaching meaningful symptom reduction vs. 63% control. $199/yr.
- Sources: [PubMed usage-pattern study](https://pubmed.ncbi.nlm.nih.gov/38882251/), [App Store](https://apps.apple.com/us/app/nerva-gut-brain-program/id1467398796)

### Regulora (metaMe Health) — FDA-cleared prescription DTx
- **7 sessions × 30 min of gut-directed hypnotherapy over 12 weeks**, requires physician prescription, ages 22+, used alongside other IBS treatment.
- **RCT data (n=362)**: 2 of 3 primary endpoints hit clinically significant separation from control; 68% satisfaction, 87% would recommend, 87% adherence, <1% non-serious adverse events, zero serious AEs.
- Source: [FDA-clearance press release](https://www.prweb.com/releases/metame-health-receives-fda-clearance-for-regulora-r-the-first-fda-authorized-treatment-specifically-for-abdominal-pain-due-to-irritable-bowel-syndrome-ibs--841394349.html)

### Mahana IBS — first FDA-authorized IBS app (De Novo, 2020)
- Prescription CBT digital therapeutic built on the UK ACTIB trial; targets thought/behavior/stress patterns in the gut-brain cycle. Prescription required.
- Source: [Lin Health comparison](https://www.lin.health/insights/best-apps-ibs)

### Zemedy (Bold Health)
- Self-guided CBT app (education/relaxation/cognitive modules); small pilot trial vs. waitlist showed improvement; positioned as the budget CBT option; subscription-based.
- Source: [PRNewswire](https://www.prnewswire.com/news-releases/bold-healths-cbt-based-ibs-self-management-app-demonstrates-efficacy-in-clinical-trial-301296311.html)

### Curable
- Broader mind-body pain app (not IBS-specific) using pain-neuroscience education, expressive writing, relaxation; received the highest content score in a peer-reviewed comparative app review — relevant for anyone with central-sensitization-pattern IBS.

### Lin Health — the outlier: human-coached, insurance-billed
- **Live human recovery coach** + in-app messaging + multidisciplinary oversight, drawing on pain reprocessing, CBT, and ACT. **Billed to insurance so most patients pay $0 out of pocket** (currently CO/TX/FL/CA/NY). The differentiator versus every self-guided app above is the live human plus the insurance-billing distribution model.
- Source: [lin.health](https://www.lin.health/insights/best-apps-ibs)

---

## 6. Virtual multidisciplinary GI clinics (care model, not just tracking)

### Oshi Health
- Full virtual GI care team (GI physician/NP, registered dietitian, GI-focused behavioral health specialist, care coordinator) via telehealth. Next-day/evening/weekend visit scheduling, **unlimited async chat with a 24-hour response SLA**, in-app prescription and lab/test ordering. In-network with most major commercial payers (not Medicare/Medicaid), HSA-eligible.
- Source: [oshihealth.com/whats-included](https://oshihealth.com/whats-included/)

### Ayble Health
- "Precision nutrition" digital collaborative-care model pairing patient data with a human coach and an AI layer ("Lupe"). Published **2025 real-world-evidence study in Neurogastroenterology & Motility** on AI-enhanced collaborative care improving IBS symptoms — exact statistics were behind a paywall this session, but the existence of a peer-reviewed real-world outcomes paper is itself notable (almost none of the pure consumer apps have this). Partnered with **Cleveland Clinic** to expand access, and with food-logging company **Sifter** rather than building logging in-house — a build-vs-partner signal worth noting.
- Sources: [Wiley NMO study](https://onlinelibrary.wiley.com/doi/full/10.1111/nmo.70144), [Cleveland Clinic partnership](https://newsroom.clevelandclinic.org/2024/10/18/cleveland-clinic-expands-access-to-care-for-patients-with-chronic-digestive-diseases), [Sifter partnership](https://www.newswire.com/news/sifter-and-ayble-announce-partnership-to-transform-the-management-of-22023156)

### Salvo Health
- Digital-first multidisciplinary GI membership; presented outcomes research at ACG (American College of Gastroenterology). **Embeds directly inside existing GI practices** (co-branded pages for Michigan Gastro, Troy Gastro/Digestive Health Institute, etc.) — a B2B2C distribution model that rides on an established practice's patient trust rather than direct-to-consumer acquisition.
- Sources: [salvohealth.com](https://www.salvohealth.com/), [Michigan Gastro co-brand page](https://michigangastro.com/salvo-health/)

### Vivante Health / GIThrive
- Platform-of-modules strategy: core digestive-health tracking platform to which they **progressively add modules** — most recently a **CBT digital therapeutic bolted directly into the existing platform** rather than shipping as a separate app (contrast with Nerva/Regulora being freestanding). First digestive-health platform accepted onto the **Evernorth Digital Health Formulary** — payer-formulary listing as a distribution/reimbursement channel.
- Sources: [CBT-addition press release](https://www.prnewswire.com/news-releases/vivante-health-adds-cognitive-behavioral-therapy-digital-therapeutic-to-githrive-digestive-health-platform-301717520.html), [Evernorth formulary](https://finance.yahoo.com/news/vivante-githrive-becomes-first-digestive-160000930.html)

### Gali Health (IBD-focused, cautionary data point)
- Was an "AI personal health assistant" for IBD: ingested diagnosis/disease-activity/symptom data, generated personalized recommendations, offered a peer community and shareable reports. **The domain is now listed for sale on a marketplace** — a concrete reminder that this exact "AI health assistant + community + reports" formula has already been tried and folded once; worth understanding why before repeating its playbook.
- Source: [Odys Marketplace domain listing](https://galihealth.com/hc/how-gali-works/)

---

## 7. Adjacent: personalized-nutrition/microbiome platform (not IBS-specific but structurally relevant)

### ZOE
- Originally required a CGM + blood test + stool microbiome kit; has since **shifted to a single at-home stool microbiome kit plus a questionnaire**, using a **proprietary algorithm trained on 300,000+ microbiome profiles** to *predict* blood-fat and blood-glucose response **without requiring every user to wear a CGM**. "Processed Food Risk Scale" for scan-based food scoring.
- **Structural lesson**: this is a population-scale-model-substitutes-for-individual-testing strategy — amortize an expensive signal (CGM, or in an IBS context, breath testing/microbiome sequencing) across a large research cohort once, then predict an individual's likely response from a cheap proxy test. No IBS-focused competitor in this research does anything like it.
- Source: [zoe.com/how-it-works](https://zoe.com/how-it-works)

---

## 8. Israeli / Hebrew-language landscape

Findings here were thin. One Hebrew-language app surfaced directly: **"מעקב צואה – IBS וקרוהן"** (Stool Tracking – IBS and Crohn's) on the Israeli App Store ([link](https://apps.apple.com/il/app/%D7%9E%D7%A2%D7%A7%D7%91-%D7%A6%D7%95%D7%90%D7%94-ibs-%D7%95%D7%A7%D7%A8%D7%95%D7%94%D7%9F/id1613642833?l=he)) — a basic stool tracker, no indication of correlation/AI features from the listing title. **FODMAP Coach AI's** developer name ("Kesem Solutions") sounds Hebrew (*kesem* = "magic") but I could not confirm Israeli origin from the site content. Beyond these two weak signals, no dedicated Hebrew-language IBS/gut-health tracking product with real traction turned up in this research — this reads as a genuinely under-served segment relative to the crowded English-language market above.

---

## 9. Direct answers to your specific questions

**Do any do proper N-of-1 trials / structured reintroduction with statistics?**
No consumer app found implements a true blinded, randomized, statistically-powered single-subject trial. The rigorous version of this exists only in academic clinical trials — e.g., the 2024 *Gastroenterology* blinded randomized FODMAP-reintroduction trial from Peter Gibson's group ([link](https://www.gastrojournal.org/article/S0016-5085(24)00170-7/fulltext)) and the companion *CGH* paper "All FODMAPs Aren't Created Equal" ([link](https://www.cghjournal.org/article/S1542-3565(24)00413-0/fulltext)) — neither is translated into any product surfaced here. Closest consumer approximations: Gut Lens's structured 7-day elimination/reintroduction "experiments," FODMAP Coach AI's personalized reintroduction schedules, and Gutsy AI's displayed (but unvalidated) "confidence levels." mySymptoms is the closest thing to real statistics among diary apps (configurable-window correlation with visible underlying event lists), but even it isn't blinded or randomized. **This is a clear, unclaimed white space.**

**Do any integrate with breath testing, CGM, or stool microbiome tests?**
- Breath testing: only FoodMarble, and it's a closed device+app loop with poor real-world reliability — no third-party diary ingests its data.
- CGM: no IBS-specific app integrates continuous glucose data into trigger modeling. Gutsy AI pulls HRV/sleep/exercise from Apple Health but not glucose. ZOE (general wellness, not IBS-branded) is the only product using glucose response prediction, and it has moved *away* from requiring a physical CGM toward a predictive-model substitute.
- Microbiome: no pure IBS trigger-tracker integrates a stool microbiome test. ZOE again is the only adjacent example, and it's general-wellness, not IBS-labeled.

**How do they handle the "6 weeks isn't enough data" problem?**
Mostly, they don't — explicitly. Workarounds observed: (a) rolling personal baselines that keep updating indefinitely rather than a fixed cutoff (BowelApp, Gutsy AI's learned transit-time model); (b) historical backfill/import to shortcut the cold start (Triggerbites); (c) blending a **crowdsourced population prior** with sparse personal data so day-one users get *something* useful (Oh My Gut!'s "67% found this risky"); (d) a minimum-days gate before showing any dashboard at all (Dieta Health requires 7 days first). The academic side (a 2026 Frontiers in Immunology precision-nutrition-in-IBS framework, [link](https://www.frontiersin.org/journals/immunology/articles/10.3389/fimmu.2026.1809221/full)) explicitly names this as an unsolved field-wide problem: inconsistent "responder" endpoints across studies, taxonomic (vs. functional/metabolomic) features that don't transport across cohorts, noisy self-reported adherence, and near-absent external validation. **No product found explicitly tells the user "you've only had this food on a symptom day 3 times — that's not enough to conclude anything"** — i.e., no sample-size/confidence-gated trigger claims exist in any consumer app. This is the single clearest gap in the market.

**Do any support dietitian/clinician collaboration, and how?**
Yes, at two very different levels of depth:
- *Diary-level, one-way*: nearly every app now ships a "doctor-ready PDF" export (Bowelle, BowelApp, Gut Lens, Gutsy AI, Cara Care, Monash app) — this is table stakes, not a differentiator anymore.
- *True two-way portal*: mySymptoms' dedicated Clinic web app, and Dieta Health's "Clinician Connect" (which also uses **free-forever clinician accounts as a B2B2C growth wedge**) stand out as actual bidirectional access rather than static exports.
- *Collaboration baked into the care model itself*: Oshi Health, Salvo Health, Vivante/GIThrive, Ayble Health, and Lin Health aren't trackers with an export button — they're services where a human RD/GI/behavioral specialist directly reads the logged data as part of paid care. **No product found lets a clinician comment directly on a specific flagged log entry** (e.g., annotate one meal or one flare) — everything is a whole-diary PDF/CSV dump, not entry-level dialogue.

**What do IBS patients wish existed?**
Reddit itself was inaccessible to automated fetch this session (403/robots.txt on all attempted routes), so this is inferred from app-store review complaint patterns rather than direct forum quotes, plus one usable forum thread (HealthUnlocked's Crohn's & Colitis Support community, where a user downloaded "a couple" of tracker apps, found them with too few reviews to trust and not good enough, and asked for something that tracks "meds, symptoms, food etc." together — [link](https://healthunlocked.com/crohns-colitis-support/posts/146672145/ibd-tracker-app-recommendations), unanswered in the visible thread). Recurring complaint themes across app-store reviews for the products above, which functionally represent the wishlist:
- Delayed reactions (24–72h) not modeled — most apps still implicitly assume same-day causation.
- Meal-level rather than ingredient-level attribution (can't tell if it was the garlic or the onion).
- No portion/dose tracking (can't tell if a small amount is tolerable).
- Condition/setup locked at onboarding, can't add a second condition later.
- Data loss on reinstall with no reliable backup/restore.
- Subscription fatigue — nearly every 2025–26 entrant is $50–150/yr for what's fundamentally a diary with an unvalidated "AI" label.
- No confidence/uncertainty shown alongside trigger claims — flat lists presented as fact.

---

## 10. Ranked list of concrete features worth stealing

Ranked by (implementability × how directly it addresses a real, currently-unmet gap):

1. **Sample-size/confidence-gated trigger claims.** Never say "garlic is a trigger" — say "garlic appeared before a flare 3 of 4 times you ate it; that's too few instances to be confident" and visually distinguish "likely," "possible," and "not enough data yet" foods. Nobody does this. Directly answers the "6 weeks isn't enough" problem and is the single most defensible differentiator against the current wave of confident-but-unvalidated "AI trigger finder" apps.

2. **Per-user learned symptom-lag window** (Gutsy AI). Don't assume a fixed 4h or 24h correlation window — infer each user's own typical gut-transit time from their logs and attribute symptoms to the most probable causal meal within a widening 6–72h window that gets more accurate the longer they use the app.

3. **Formal Experiment as a first-class data object**, not just diary entries — a named challenge with a hypothesis (suspected trigger), a protocol (dose/schedule), a start/end date, and an explicit verdict at the end (Gut Lens, FODMAP Coach AI, Monash's 3-phase structure). The most ambitious version borrows directly from the actual clinical RCT design (Gibson lab's blinded randomized reintroduction) — single-blind self-administered micro-dosing where the user doesn't know which sachet/day contains the suspect compound, closest thing to real N-of-1 rigor achievable in a consumer app.

4. **Dual-reference benchmarking** (BowelApp): show every metric against both a cited clinical reference range (Bristol/Rome IV) *and* the user's own rolling personal baseline, so a single data point is meaningful from day one, not just after months of accumulation.

5. **Cumulative/stacking dose modeling across a day** (FODMAP Coach AI) — attribute symptoms to total compound load across multiple meals, not one isolated meal; threshold/dose-response effects are real and current tools ignore them.

6. **Historical backfill/import** (Triggerbites) — accept PDFs, photos of paper logs, and exports from other apps to shortcut cold start, directly attacking the "not enough data" problem from the data-volume side rather than the statistics side.

7. **Community-prior blending for cold start** (Oh My Gut!) — show a crowdsourced population signal ("X% of users flagged this") alongside the still-thin personal signal, so day-one users get something actionable before their own data accumulates.

8. **Multi-framework compound tagging on one log** (Triggerbites) — tag every food against FODMAP, histamine, salicylate, oxalate, and glutamate content simultaneously so a user testing multiple hypotheses doesn't have to re-log.

9. **On-device-first, zero-account privacy architecture** with pay-per-insight as an alternative to subscription (Bowelle/BowelApp) — meaningful trust differentiator in a category logging bowel/symptom data, and a monetization model that avoids subscription fatigue.

10. **Structured post-meal nudge timing** (Oh My Gut!'s automatic 2-hour check-in) baked into notification logic rather than relying on the user to remember to log a delayed reaction.

11. **Forward-looking flare-risk forecasting**, not just backward correlation (Gut Lens) — turns the product from a passive diary into an active daily advisor.

12. **Clinician portal as a free B2B2C acquisition channel** (Dieta Health) — give RDs/GIs free accounts so they prescribe the app to patients, rather than only selling direct-to-consumer.

13. **Entry-level clinician dialogue**, not just whole-diary export — let a clinician comment on one specific flagged meal/symptom entry rather than only receiving a static PDF. No product reviewed does this; it's a genuine gap between "tracker with an export button" and "actual collaboration."

14. **Bundle a therapeutic module directly into the tracking platform** rather than shipping it as a separate purchase (Vivante's approach of adding CBT DTx into GIThrive) — capture the hypnotherapy/CBT spend Nerva and Regulora currently take as a standalone add-on.

15. **Publish real validation data as the marketing wedge.** Given how much of the current "AI trigger finder" wave (Gutsy AI, Gut Lens, Gut AI, Oh My Gut!, FODMAP Coach AI) makes confident claims with no cited accuracy validation, being the one competitor that runs and publishes an actual accuracy/outcomes study (even a modest one, à la Ayble's 2025 NMO real-world-evidence paper) is a differentiator that's cheap relative to building the algorithm itself and directly answers the credibility gap users are implicitly complaining about.

16. **Population-scale predictive model to substitute for an expensive individual test** (ZOE's playbook: train once on a large cohort with the expensive input, then predict individual response from a cheap proxy) — a longer-horizon data-moat strategy relevant if this product eventually wants to reduce reliance on things like breath testing or stool sequencing for every user.

17. **Toilet locator and other small daily-utility features** (Gut Lens) — cheap to build, unrelated to the core analytics engine, but a real daily-anxiety pain point that drives incidental engagement and retention.
---

# § 2 — General symptom trackers with correlation engines

# Segment Report: General Symptom Trackers with Correlation/Analytics Engines

**Headline finding:** Across every product verified, the "correlation engine" is a marketing term, not a statistical one. Exactly one product (Exist.io) computes a p-value at all, and it hides it from the UI behind a 5-star icon. Zero products verified show confidence intervals, sample size at the point of claim, or any multiple-comparison correction — despite testing hundreds of factor×outcome pairs. Bearable, the category leader, will assert a correlation from **six days of data**. This is the single largest defensible gap for FoodTrack.

---

## Per-product profiles

### 1. Bearable — category leader
**URL:** https://bearable.app/ · **Verification: HIGH** (own site, support docs, public roadmap, both app stores, third-party review)

**Positioning.** "Symptom & mood tracker" for chronic illness. 4.8★/6.1K ratings iOS ([App Store](https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097)), 4.5★/10.3K Play ([Play](https://play.google.com/store/apps/details?id=com.bearable&hl=en_US)).

**Tracking model.** Mood, emotions, sleep, symptoms, energy, meds, nutrition, hydration, menstrual cycle, activity, **bowel movements**, weather, social. "Record your Mood, Emotions, Sleep, Symptoms, & Energy Levels with just a few taps each day" — "No typing needed" ([bearable.app](https://bearable.app/), [symptom-tracker](https://bearable.app/symptom-tracker/)). Custom symptoms and symptom *groups*, rated by severity and frequency. Syncs HRV, resting HR, body temp, steps, weight, BP from Apple Health / Google Fit / Fitbit.

**Insight engine — the detail that matters.**
- Minimum data threshold is **strikingly low**: "6 days of health metric data" plus "three days with and three days without" a factor ([support](https://bearable.app/support/howto/how-to-use-bearable-to-discover-whats-improving-and-worsening-your-health/)). Usable results claimed after "7 to 14 days."
- **Time-lag: yes, and it is their best feature.** Verbatim from Bearable: *"The same day effect button lets you choose to see what impact the factors had on the same day, the next day, and up to 7 days after the factor occurred"* ([premium page](https://bearable.app/why-subscribe-to-bearable-premium/)). This is a 0–7 day lag sweep — more than Exist offers. **FoodTrack cannot claim lag analysis as a differentiator; only lag analysis *with statistics* is defensible.**
- **No p-values, no confidence intervals, no sample size, no multiple-comparison correction** disclosed anywhere in their public documentation. Reports are "Effect on" percentages and comparison charts. Guidance is behavioral, not statistical: *"The quality of your insights will only be as good as the quality of the data you collect"* ([insights tips](https://bearable.app/support/tips/getting-the-most-out-of-bearables-insights/)).
- **Health Experiments (closest thing to N-of-1 in the segment).** User picks type (Mindful/Active/Sleep/Dietary/Other), a factor, duration, time of day, one main outcome + up to 7 secondary. Baseline = either ≥3 days tracked before start, or non-completion days inside the window. Results are a slideshow: completion days, outcome graphs, "percentage change in your outcome score," plus **"With vs. without"** and **"Since start vs. before"** comparisons. Explicitly states *"correlation does not necessarily mean causation."* Confounder advice is to avoid introducing new factors, or complete on as many days as possible. Recommends running "at least 3 times." **No randomization, no washout, no significance test, no power calculation** ([experiments guide](https://bearable.app/support/tips/health-experiments-a-guide-to-learning-how-your-habits-impact-your-health/)).

**Config flexibility.** Strong. Custom symptoms, custom factors, custom ratings, symptom groups. Custom factors/symptoms are **premium-gated**.

**Data ownership.** CSV export (not PDF — a named complaint). Data encrypted in transit; deletion on request (Play listing). No public API, no self-hosting. **Web interface has 380 votes and is marked "not currently planned"** ([roadmap](https://changemap.co/bearable-/bearable-roadmap/)).

**Price.** Free tier: unlimited custom tracking, weekly reports, **30-day data window**. Premium $34.99/yr or $6.99/mo, 7-day trial; discounts to ~$18.99; sponsorship program for those who can't pay. IAP tiers observed: $4.49–$49.99. Paywalled: correlations, advanced reports, custom experiments, custom factors/symptoms, full history, passcode lock.

**Top 3 complaints.**
1. **Logging friction causes abandonment.** Verbatim user comment on their own roadmap: *"I gave up on using the Bearable app because it's too complicated to add entries."* Another: *"half the problem with tracking is not having a phone in hand."* Users specifically ask to log **bowel movements without carrying their phone**. Apple Watch quick entry: 209 votes, status "Suggestions" — not even planned ([roadmap item 4440](https://changemap.co/bearable-/bearable-roadmap/task/4440-apple-watch-quick-entry-features/)).
2. **Overwhelm / setup burden.** "Too many options"; some users report "more than 10 minutes" to log ([ChoosingTherapy](https://www.choosingtherapy.com/bearable-app-review/)); Neura Health notes setup "can take time... the number of available categories may feel overwhelming" ([Neura](https://neura.health/insight/bearable-symptom-tracker-app-review)).
3. **Stability + monetization resentment.** App "will suddenly freeze, force quit, or will become very laggy"; long-time free users "frustrated by monetization shift" (ChoosingTherapy).

**Unmet demand worth reading closely.** Factor-to-factor correlations: **487 votes, requested Dec 2020, promised "within months" in Oct 2021, demoted from "Planned" back to "Under consideration" in Oct 2022, still unshipped.** User requests inside it map directly onto FoodTrack's thesis: *"Cause-and-effect tracking: understanding which factors precede outcomes (e.g., which foods affect digestion)"* and *"Time-based correlation: comparing factors entered on the same day or before, not after"* ([roadmap item 4314](https://changemap.co/bearable-/bearable-roadmap/task/4314-correlations-between-factors/)).

---

### 2. Exist.io — the only real statistical engine in the segment
**URL:** https://exist.io/ · **Verification: HIGH** (site, KB, developer API docs, app stores)

**Positioning.** Personal analytics aggregator, by Hello Code (Melbourne, AU). Web-first; iOS/Android are "limited functionality compared to the web version" ([FAQs](https://exist.io/page/faqs/)).

**Tracking model.** 20+ integrations: Apple Health, Fitbit, Garmin, Oura, Withings, Strava, RescueTime, Todoist, Toggl, GitHub, Mastodon, Last.fm, Trakt, Spotify, calendar, weather, Swarm. Plus manual mood and custom tracking.

**Insight engine — the most transparent in the segment.**
- API returns: **`value`** (coefficient, e.g. `-0.5577851552276848`), **`p`** (e.g. `1.1564227190131434e-26`), **`percentage`** (abs strength), **`stars`** (1–5 confidence), **`occurrence`** (sample size field), **`strength_description`** ("Quite often go together"), **`stars_description`** ("Certain to be related"), **`period`** (days), **`offset`** ([developer.exist.io](https://developer.exist.io/reference/correlations/)). Filters: `strong` and `confident` (five-star).
- **Minimum data: "at least three weeks' worth of data for an attribute, excluding days with no data."** Recomputed **weekly, every Monday** ([KB 18](https://kb.exist.io/article/18-how-long-does-it-take-to-find-correlations)).
- **Lag: exactly one day.** *"If a correlation between two attributes isn't found for the same day, Exist will check for correlations between attributes across two consecutive days."* Examples: today's alcohol → tomorrow's sleep. **No longer or configurable lags** ([KB 55](https://kb.exist.io/article/55-will-exist-find-correlations-across-multiple-days)).
- **Best-in-segment causation hygiene.** *"Correlations can't determine the cause of the relationship—this is up to you to have a think about!"* and *"One attribute changing might cause the other to change or vice versa, or a third variable might affect both attributes, or the relationship might be a coincidence."* Critically: *"All correlations can be read with either attribute first, because they don't imply any causation"* — they deliberately refuse directional framing ([KB 37](https://kb.exist.io/article/37-what-are-correlations)).
- **The p-value exists in the API but the UI shows stars.** Users can rate a correlation down to suppress it, and shuffle/pick any two attributes manually ([blog](https://exist.io/blog/new-ios-correlations/)).
- **UNVERIFIED:** the specific coefficient (Pearson vs Spearman) is never stated publicly; the field shape implies a parametric r. Star-to-p thresholds are undisclosed.

**Config flexibility.** Custom attributes as *"a quantity, time period, scale from 1–9, percentage, or time of day. Or just add a tag to a day"* ([exist.io](https://exist.io/)). **Known weakness:** tags aren't quantities — *"I can add 'coffee,' but if I want to mention more than one coffee, I have to add new tags for '2 coffees,' '3 coffees'"* ([Terpstra](https://brettterpstra.com/2017/08/02/quantify-everything-with-exist-dot-io-custom-tracking/)).

**Data ownership.** Full export from settings; *"It's your data, not ours."* **Public read/write API** — the best in the segment. Not self-hostable. *"We make money selling Exist subscriptions, not your data."*

**Price.** $6.99/mo or $62.90/yr. 30-day free trial, no free tier. Single plan.

**Top 3 complaints.**
1. **Tiny install base / stagnation risk.** iOS app: **4.4★ from only 10 ratings**, last updated Apr 2025 ([App Store AU](https://apps.apple.com/au/app/exist/id986201088)). ProductHunt has **one** review ([PH](https://www.producthunt.com/products/exist/reviews)). Competitor Correla claims Exist has had "limited [features] since 2022" — **UNVERIFIED, competitor-sourced**.
2. **Signup friction.** *"I couldn't get passed the ridiculous password requirements on sign up. Apparently a 17 character password... is 'too weak'"* (App Store AU).
3. **Custom tracking can't express magnitude** (Terpstra, above) — fatal for food quantity.

---

### 3. Correla — new entrant, direct Exist competitor
**URL:** https://correla.app/ · **Verification: MEDIUM** (single vendor comparison page; self-serving)

Launched 2025. Claims "analysis-first architecture" pairing correlations with plain-language explanations "rather than raw statistical coefficients." Integrates Fitbit, Garmin, Oura, Apple Health, Google Fit, Todoist, RescueTime. Custom metrics; **multiple mood logs per day** (vs Exist's one). Adds **location context** (home/office/gym) to pattern analysis. Requires ~30 days of data. iOS + Android + web. $3.99/wk or $44.99/yr. "Encrypted servers in the US," never sells health data, CSV/JSON export "no lock-in" ([comparison page](https://correla.app/compare/exist-io-alternative)). **All claims here are vendor-authored and UNVERIFIED independently.** Statistical method not disclosed.

---

### 4. Flaredown — the open-source, research-donating chronic illness tracker
**URLs:** https://flaredown.com/ · https://github.com/rubyforgood/Flaredown · **Verification: HIGH**

**Positioning.** "The world's most advanced symptom tracker," free, built by patients, now maintained by creator Logan Merriam under Ruby for Good.

**Tracking model.** **Over 200,000 foods** for sensitivity identification, meds + dosages, natural treatments/supplements, stress/mood/depression/anxiety, **auto-tracked weather**, activity/exercise/sleep, and user-created custom categories. *"Will check in with you daily to make consistent tracking easy."*

**Insight engine.** **This is the notable absence.** No correlation or statistical engine is documented on the site or in the repo README. The value proposition is longitudinal visualization plus **population-level** research: data is anonymized and shared with researchers, with datasets published on Kaggle. No per-user causal analysis.

**Config flexibility.** Custom trackables. **UNVERIFIED:** field types not documented publicly.

**Data ownership — best in segment.** **GPLv3.** Rails + PostgreSQL 12.8 + MongoDB 4.4.9 + Redis 6.2.3 (Ruby 3.2.3), Ember.js frontend, React Native mobile, Docker Compose provided. 1,533 commits, active GitHub Actions. Self-hosting is technically feasible though not explicitly documented as a supported path.

**Price.** Free.

**Top complaints.** **UNVERIFIED** — no substantial App Store or forum complaint corpus surfaced. Primary structural risk is single-maintainer sustainability and a heavyweight 4-datastore stack.

---

### 5. Daylio — the logging-speed benchmark
**URL:** https://daylio.net/ · **Verification: HIGH** (site + App Store reviews)

**Positioning.** Micro-diary / mood tracker. **4.8★ from 61K ratings** ([App Store](https://apps.apple.com/us/app/daylio-journal-mood-tracker/id1194023242?see-all=reviews)) — the largest verified user base in this report.

**Tracking model.** **Two taps**: pick mood, pick activities. Plus notes, writing templates, photos, **voice memos**. Custom moods (own color + emoji), custom activities from an icon library.

**Insight engine.** Mood trend lines, "correlation stats" showing activity↔mood relationships, monthly/yearly stats, and **Year in Pixels** (whole year as a grid of colored dots). **No statistical method, thresholds, significance, or lag handling disclosed anywhere.** Free tier statistics are explicitly "limited."

**Data ownership.** PDF, CSV, chart images (premium). Encrypted backup to Google Drive/iCloud. *"Only Daylio app is able to read your entries"* — local-first. No API, no self-hosting.

**Price.** $4.99/mo or $35.99/yr, 7-day trial ([Calmevo review](https://calmevo.com/daylio-review/)).

**Top 3 complaints.**
1. **The single most important quote in this report** — a user articulating exactly the failure mode FoodTrack must avoid: *"The correlation vs causation element isn't as evident as I'd like it to be...wind up just being a lot of data I don't know what to do with"* (App Store).
2. **No Apple Health integration.** *"It would be great to be able to automatically integrate data from Apple Health, showing HRV and sleep quality that would have obvious bearing on mood"* (App Store).
3. No end-to-end encryption; no automatic context capture (location/weather) (Calmevo).

**Positive signal worth noting:** chronic-illness users praise it precisely for low effort — *"It doesn't take up a ton of energy for anyone out there with chronic illnesses or fatigue."* Daylio wins on effort, not analysis.

---

### 6. Nomie 6 / Daily Nomie — the self-hosted quantified-self option
**URLs:** https://github.com/open-nomie/nomie6-oss · https://www.dailynomie.com/ · **Verification: HIGH**

**Positioning.** "Open source life tracker / mood tracker / data journal." Original commercial Nomie shut down; **community fork "Daily Nomie" is actively maintained** by Ronald de Lange since early 2023; latest release **v6.7.4.1-dn (April 2026)** ([dailynomie.com](https://www.dailynomie.com/)).

**Tracking model — clever and worth stealing.** Natural-language note parsing extracts structured data in real time: `#sleep(160000)`, `#mood(4)`, `@person`, `+context`. One text box does typed logging, people, context, and locations simultaneously. Tracker types include standard trackables, **range trackers**, **combo trackers**, custom trackables.

**Insight engine.** Dashboard analytics, timeline, goals, **dual-axis correlation charts**, and "AI-powered insights" introduced in 6.7.4. **No statistical method, significance, or lag handling documented.** Release 6.7.4-dn adds **Pointers** — tag a point in time (e.g. a medical check-up), get reminders on it, and a **Pointer Widget that compares values of notes tagged with that Pointer** — effectively a lightweight before/after event-anchored comparison ([release notes](https://www.dailynomie.com/2025/05/24/%F0%9F%8E%81-nomie-release-6-7-4-dn/)).

**Data ownership — strongest self-hosting story.** **MIT license.** *"Nomie 6 can be run on any web server without special server side code."* Data local (PouchDB/LocalForage) **or in your own CouchDB** — *"your data is either stored locally on your device... or in your CouchDB which only you control."* Encryption not specified (**UNVERIFIED**).

**Price.** Free, open source.

**Complaints.** **UNVERIFIED** — no review corpus. Structural risks: the original service died, current version is a single-maintainer fork, and nomie6-oss upstream shows only 51 commits with last release 6.3.0 (Feb 2023).

---

### 7. Zenobase — now open source, and the sleeper pick
**URLs:** https://zenobase.com/ · https://blog.zenobase.com/ · https://github.com/zenobase · **Verification: HIGH** (GitHub org + blog index)

**Positioning.** "Store, aggregate and visualize your data" — a generic time-series bucket store for quantified-self data, by Eric Jain, built because he was *"fed up entering data into a dozen different, specialized tracking apps"* ([Open Humans wiki](https://wiki.openhumans.org/wiki/Tracking_with_Zenobase)).

**Data model.** Everything is mapped to simple types and thrown into **buckets**: each datapoint has tags, measurements with units, timestamps, source. Handles biometrics, location, environmental sensors, manual entries, and arbitrary custom sensor data via API.

**Insight engine.** Interactive dashboards with drill-down, histograms, timelines, **scatter plots for correlation analysis**. Blog archive includes "Correlating" (2014) and **"A/B Testing Personal Data" (2013)**. **No p-values, significance, or lag handling documented anywhere (UNVERIFIED / likely absent).** Visual correlation, not inferential.

**Data ownership — major 2026 development.** Blog posts: **"Open Source" (2026-04-07)**, "Infrastructure" (2026-04-20), **"MCP Support" (2026-05-15)**. GitHub org confirms: **`zenobase` (Java 25 / Helidon SE backend, MIT, last updated Jul 21 2026)** and **`zenobase-web` (Vue, MIT, Jul 21 2026)**. README: *"Java 25 / Helidon SE backend for zenobase/zenobase-web, deployed to api.zenobase.com"*; `./run.sh` "builds and starts a backend container on http://localhost:9000, including OpenSearch and localauth0 containers"; docker-compose.yml present ([repo](https://github.com/zenobase/zenobase)). Import from spreadsheets; REST API; Fitbit/Foursquare integrations.

**MCP support (May 2026) is strategically important** — it means an LLM agent can query a personal QS datastore directly. Post body not retrievable (404 on permalink); **contents UNVERIFIED**.

**Price.** Historically freemium (AlternativeTo lists it proprietary/freemium — now **outdated**, contradicted by the MIT repos). Current pricing **UNVERIFIED**.

---

### 8. CareClinic — Bearable's closest commercial rival
**URL:** https://careclinic.io/ · **Verification: HIGH for complaints** (App Store reviews); **MEDIUM for pricing** (competitor-sourced)

**Tracking model.** Symptoms, medications + adherence, vitals (BP, blood glucose), nutrition, period, mood, **stool**, sleep, plus health records (labs, vaccines, imaging). Syncs Apple Health, Google Fit, wearables, glucose meters, BP monitors. Uses a **1–10 severity scale** and **time-stamped** symptom entries (vs Bearable's 0–5) — a genuine advantage for intraday food→symptom analysis.

**Insight engine.** "Charts reveal clear connections between daily life and symptoms," "spot triggers," insight reports showing correlations. **No method, threshold, significance, or lag disclosed. UNVERIFIED whether any statistical computation occurs at all** beyond charting.

**Config flexibility.** Customizable symptoms/meds/vitals — but **customization is paywalled entirely**; free tier gets three preset symptoms.

**Data ownership.** Charts and PDF reports for providers. **Uninstalling permanently deletes data with no recovery** (per user reviews). No API, no self-hosting.

**Price.** Homepage says "$0.00 USD." Bearable's comparison claims **$59.99/yr or $9.99/mo** — *competitor-sourced, flag bias* ([Bearable vs CareClinic](https://bearable.app/bearable-vs-careclinic-which-one-should-you-choose/)). Their KB references "monthly, annual, or **lifetime** plans" with "unlimited tracking, advanced analytics, PDF reports, caregiver sharing" ([KB](https://start.careclinic.io/knowledgebase/premium-subscriptions/)); exact figures **UNVERIFIED**.

**Top 3 complaints** — all verbatim from App Store, 4.2★/2.3K ratings ([reviews](https://apps.apple.com/us/app/tracker-reminder-careclinic/id1455648231?see-all=reviews)):
1. **Data integrity bugs.** *"Every third or fourth time I document symptoms, it double or triple counts them and throws off"* — plus session-expiry errors that make editing past entries impossible.
2. **Aggressive paywall.** *"You can only track three symptoms before it's nagging you to pay for the subscription"*; prompts appear *"every. Single. Time. That you open the app."*
3. **Food logging is broken.** *"Food logging requires re-entering details repeatedly; app doesn't save entries."* Also *"Overly complicated and difficult to navigate."* **This is the exact workflow FoodTrack must nail.**

---

### 9. Guava Health — records aggregation + insights
**URL:** https://guavahealth.com/ · **Verification: HIGH** (site + plans page)

**Positioning.** Aggregate clinical records + wearables + self-logged data. Connects to **100,000+ providers** (Epic, Cerner, Mayo). 20+ languages, web/iOS/Android.

**Tracking model.** Labs, imaging, doctor notes from patient portals; Fitbit, Apple Health, Google Fit, Garmin, Oura, Dexcom, Withings, WHOOP; user-logged symptoms, meds, caffeine, sleep, cycle, **food**, BP. Automatic extraction from thousands of lab-report formats. **Photo AI for food nutrient detection** (premium).

**Insight engine.** "Health Insights" — *"Find your symptom triggers, evaluate treatments, and uncover factors influencing your health"*; *"shows correlations between your fitness data and other factors, so you can see whether certain foods may be affecting your sleep, for instance"* ([FAQ](https://guavahealth.com/is-guava-right-for-me-faq)). **"No statistical methods, algorithms, or specific computational approaches are disclosed."** The most explicit black box in the segment.

**Price — notable tiering.** Free tier is generous: portal sync, device sync, track symptoms/meds/cycle/food/activity, *"simple summaries, trends, and correlations,"* sharing, document upload. **Premium $8/mo or $78/yr** adds *"Automatic health insights discover relationships across all your data,"* emergency card, unlimited profile managers, auto lab-result import, **Guava Assistant AI** (prepares for doctor visits, **enters data for you**), photo food AI, family plan ([plans](https://guavahealth.com/plans)).

**Data ownership.** *"We do not sell your data, and you are in complete control of who you share your profile with."* HIPAA/GDPR claimed on homepage; the FAQ omits explicit HIPAA language. **Export capability not documented — the FAQ addresses importing only. Flag as UNVERIFIED / possible gap.**

**Complaints.** **UNVERIFIED** — Trustpilot returned 403; no usable review corpus retrieved.

---

### 10. Mymee — human-in-the-loop trigger identification
**URL:** https://www.mymee.com/ · **Verification: HIGH** (own FAQ + method page)

**Positioning.** Autoimmune/chronic-condition digital therapeutic. Not really an app company — an app-plus-coach service sold to individuals, providers, and payers.

**Tracking model.** Baseline **exposome** assessment: *"symptoms, food, supplements, Rx/pharmacogenetics, vaccine, infection, surgical history, environment."* Then daily logging in *"less than 3 minutes a day."* **Users start by tracking food intake**, then the app *"is reconfigured to hone in on your various symptoms and dietary, environmental, and lifestyle triggers."*

**Insight engine — the genuinely different model.** The app is **reconfigured weekly by a human coach** to *"test correlations between your triggers and symptoms."* Certified coaches run *"weekly trigger analysis and care sessions"* using "Mymee's data analytics platform." They call it *"self-evidence-based methodology."* Reported outcome: *"a mean improvement across 59 patient-reported symptoms of 40% in an average of 17 weeks"* ([method](https://www.mymee.com/the-mymee-method)).

**The insight to steal:** *tracking scope narrows adaptively as hypotheses form.* Nobody else does this. It's why 3-minutes-a-day stays true across a 16-week program.

**Price.** **$125/session**, 16-week core program, HSA/FSA eligible; "Mymee Care" maintenance tier after ([FAQ](https://www.mymee.com/mymee-faq)).

**Data ownership.** *"We will never provide your personal health information to any third party, including your insurer and employer."* De-identified aggregate reporting only. No export/API/self-hosting documented.

**Complaints.** **UNVERIFIED** — no consumer review corpus (B2B2C distribution). Obvious barrier: cost and coach dependency.

---

### 11. Visible — ME/CFS pacing, the best "low-effort logging" design
**URL:** https://www.makevisible.com/ · **Verification: HIGH for product**, MEDIUM for pricing (third-party review; own pricing page 404'd)

**Positioning.** *"Activity tracking for illness, not fitness."* Long Covid, ME/CFS, fibromyalgia, POTS, EDS.

**Tracking model.** **Visible Band 2.0, manufactured by Polar** — continuous HR, waterproof, 5-day battery. Plus self-reported sleep quality, symptom severity, **emotional and social exertion**, medication, infections. Free tier uses **smartphone-camera HRV** (no hardware).

**Insight engine.** **PacePoints** — a daily energy *budget* spent through the day, with real-time over-exertion notifications. **Morning Stability Score** measures drift from your **90-day rolling average**, not absolute daily wellness. Trends show "what's making you better or worse." Claims 86% feel "more in control," 91% better energy management. **No correlation engine, no statistical disclosure.** The intelligence is in the *metric design*, not in inference.

**Price.** Free research app (symptom logging, Morning Stability Score, camera HRV). Membership **$19.99/mo or $179.88/yr ($14.99/mo)**. **Band 2.0 $79.70** one-time. Year one ≈ $259.58 ([aelívra review](https://aelivra.co/explore/compare/visible-review)). HSA/FSA eligible.

**Top 3 complaints** (aelívra):
1. **Band connectivity** — frequent unpairing across multiple app versions; dominates reviews.
2. **Subscription holds your data hostage** — "frustration that the subscription gates access to their own data if cancelled."
3. **Metric is poorly explained** — the Morning Stability Score's "drift from 90-day average" framing "Visible explains poorly"; users question its accuracy. Also skin reactions to the band; no Apple Watch/Garmin/Fitbit compatibility.

---

### 12. Symple — effectively dormant
**Verification: LOW.** Listed by JAN as tracking "up to 10 symptoms at a time" plus "medications, exercises, and other factors," Apple + Android ([JAN](https://askjan.org/products/Symple-Symptom-Tracker-Health-Diary.cfm)). The Symple Health Inc. App Store developer page rendered no app listings. No pricing, no correlation engine, no export details retrievable. **Treat as abandoned; not a competitive threat. Its 10-symptom cap is the historical ceiling the category has moved past.**

---

### 13. Apple HealthKit — as an aggregation layer
**Verification: HIGH** (Apple developer docs)

**This is a free interop win for FoodTrack.** HealthKit ships **exactly the GI symptom vocabulary FoodTrack needs**, verbatim as `HKCategoryTypeIdentifier` symptom types ([symptom-type-identifiers](https://developer.apple.com/documentation/healthkit/symptom-type-identifiers.md)):

- **Abdominal and Gastrointestinal:** `abdominalCramps`, `bloating`, `constipation`, `diarrhea`, `heartburn`, `nausea`, `vomiting`
- **Constitutional:** `appetiteChanges`, `chills`, `dizziness`, `fainting`, `fatigue`, `fever`, `generalizedBodyAche`, `hotFlashes`
- **Neurological:** `headache`, `memoryLapse`, `moodChanges`
- **Sleep:** `sleepChanges`, `nightSweats`
- **Skin:** `acne`, `drySkin`, `hairLoss`
- Plus heart/lung, musculoskeletal, nose/throat, reproductive, urinary sets.

Severity scale is `HKCategoryValueSeverity`: notPresent / mild / moderate / severe (**scale enum UNVERIFIED** — inferred from the docs model, not read verbatim). Also `sleepAnalysis`, `mindfulSession`. **No Bristol stool type exists** — FoodTrack's Bristol scale has no native HealthKit representation and must stay proprietary or map lossily onto `diarrhea`/`constipation`.

### 14. Google Health Connect — as an aggregation layer
**Verification: HIGH** (Android developer docs)

Seven categories: Activity, Body Measurement, Cycle Tracking, Nutrition, Sleep, Vitals, Wellness ([data types](https://developer.android.com/health-and-fitness/health-connect/data-types)). Nutrition Record is rich (calories, macros, vitamins A/B6/B12/C/D/E/K, calcium, magnesium, iron, zinc, sodium, potassium, fiber, cholesterol, caffeine); Hydration Record; Weight/Height/BodyFat/BMR/LeanBodyMass/BoneMass/BodyWaterMass. Background read access is available for continuous analysis.

**Two hard limits, both critical for FoodTrack:**
1. **No GI/stool/symptom data types whatsoever.**
2. **No custom data types** — "a fixed set of predefined data types only."

**Implication: FoodTrack's core outcome variables are unrepresentable on Android's aggregation layer.** Health Connect is an *input* source (nutrition, weight, sleep, vitals) but can never be an output sink for stool/symptom data. Plan for asymmetric sync: read-rich on Android, read+write on iOS.

### 15. Self-hosted landscape — the gap is conspicuous
**Verification: HIGH** ([awesome-selfhosted health & fitness](https://awesome-selfhosted.net/tags/health-and-fitness.html))

Complete list: **Endurain** (fitness, AGPL-3.0), **FitTrackee** (workouts, AGPL-3.0), **Mere Medical** (medical records aggregation, GPL-3.0, offline-capable), **OpenELIS Global** (lab LIS, MPL-2.0), **OpenEMR** (EHR, GPL-3.0), **Statistics for Strava** (AGPL-3.0), **wger** (workout/nutrition/weight, AGPL-3.0). Adjacent: **OpenNutriTracker** (calorie tracker, privacy-focused).

**None address symptom tracking, mood/habit tracking, or food→symptom correlation.** The full self-hosted competitive set for FoodTrack is: **Flaredown** (GPLv3, no correlation engine), **Nomie/Daily Nomie** (MIT, visual charts only), **Zenobase** (MIT as of 2026, scatter plots only). **There is no self-hosted product that does statistically-grounded food→gut association analysis. That is FoodTrack's whitespace.**

### 16. StudyMe — the N-of-1 exemplar to copy
**Verification: HIGH** ([Trials, 2022](https://link.springer.com/article/10.1186/s13063-022-06893-7))

Open-source, free, Android + iOS, **no registration, all data local**. Users configure Goal → Interventions → Measures → Study Design → Schedule. Two designs: **withdrawal (A/B)** and **alternating treatment**. Default **ABAB with 7-day phases**, editable — deliberately balanced *"to avoid temporal effects in analysis."*

**Design lessons, directly transferable:**
- **Language substitution:** trial→"experiment," outcome→"goal," measures→"data you want to collect."
- **Editable defaults beat blank forms:** users could not schedule trials until defaults were added; SUS score reached **82 (grade A, 90–95th percentile)**, 13/13 participants built valid trials.
- **Users propose vague interventions** ("do more sports") — the app must force specificity.

**Its two admitted failures are FoodTrack's opportunity:** *"The app notably lacks randomization and blinding features,"* and the authors *"did not set a main focus... on implementation of complex statistical methods"* — results are purely descriptive phase comparisons.

### 17. mySymptoms Food Diary — adjacent, closest analytic competitor
**Verification: MEDIUM** (App Store listing + homepage)

Not strictly in-segment but the nearest direct rival. Tracks food/drink (barcode scan + database + custom items), meds, stress, exercise, environment, symptom **intensity and duration**, energy, sleep quality, and **bowel movements on the Bristol scale**. Defaults to showing prior entries for faster repeat logging. Produces a **ranked suspect list** — a screenshot shows "dairy and cappuccino as top suspects" for stomach pain. Marketed as *"Our AI looks for patterns in what you eat and how you feel."* **No time-lag window, no confidence scoring, no minimum data threshold, and no algorithm disclosed publicly.** Subscription with 7-day trial; PDF/CSV export ([App Store](https://apps.apple.com/app/id405231632), [mysymptoms.net](https://mysymptoms.net/)).

### 18. The existential-risk read
**Verification: HIGH** ([Paul Ingraham, tryeverything.substack.com](https://tryeverything.substack.com/p/the-ignominious-failure-of-tracking))

18 months of meticulous self-logging in a "Spreadsheet of Misery" produced **not one robust correlation** between any symptom and any modifiable risk factor. His single promising finding (cyclamate sweetener → chronic symptom) **collapsed when acted upon**. Hundreds of hours: *"all my logging...was all in vain. And so I quit."*

His diagnosis is the thesis FoodTrack must answer: *"If a correlation... is strong enough to be identifiable... you probably already knew it,"* while subtle correlations remain *"extremely elusive."* Causes named: too many variables, measurement noise, insufficient analytic expertise. **He used no app — meaning no product in this segment has solved the problem he hit.**

---

## Feature inventory (flat, deduped)

**Logging & input**
Two-tap mood/severity entry · multi-select activity chips · custom emoji/color moods · free-text notes · voice memos · photo attachments · barcode scanning for food · food database (200k+ items) · repeat-last-entry defaults · natural-language hashtag parsing (`#sleep(160000)`, `@person`, `+context`) · timestamped (intraday) entries · duration-plus-intensity symptom capture · Bristol stool scale · 0–5 and 1–10 severity scales · writing/journal templates · daily check-in prompt · home-screen widgets (requested, not shipped) · Apple Watch quick entry (requested, not shipped) · AI assistant that enters data for you · photo→nutrient AI detection · adaptive narrowing of tracked fields by a coach

**Automatic capture**
Apple Health / Google Fit / Health Connect sync · Fitbit, Garmin, Oura, Withings, WHOOP, Dexcom, Strava · HRV, resting HR, body temp, steps, weight, BP · smartphone-camera HRV · continuous HR armband · automatic weather · location/geo context · patient-portal medical record import (Epic/Cerner) · lab PDF/image auto-extraction · productivity/media sources (RescueTime, Todoist, Toggl, GitHub, Spotify, Last.fm, Trakt, Mastodon)

**Analysis & insight**
Pearson-style correlation coefficient · p-value (API-only) · 5-star confidence rating · strength-as-percentage · plain-language correlation sentences ("you spend more time asleep when you go to bed earlier") · bidirectional non-directional phrasing · same-day correlation · **+1 day lag** (Exist) · **0–7 day lag sweep** (Bearable) · factor→outcome "Effect on" reports · with-vs-without comparison · since-start-vs-before comparison · percentage change in outcome score · ranked suspect list · manual two-attribute correlation picker · shuffle/serendipity discovery · thumbs-down to suppress a correlation · scatter plots · histograms · dual-axis correlation charts · event-anchored before/after comparison (Nomie Pointers) · Year-in-Pixels calendar heatmap · weekly/monthly/yearly aggregates · rolling 90-day baseline drift score · energy-budget points with real-time overspend alerts · symptom prevalence · weekly summary email · population-level research datasets (Kaggle)

**Experimentation**
Structured self-experiment builder · experiment type taxonomy · one primary + up to 7 secondary outcomes · baseline period (≥3 days) or in-window non-completion days as control · ABAB alternating phase schedule · withdrawal vs alternating-treatment designs · editable default 7-day phases · confounder guidance · "run it at least 3 times" repetition advice · A/B testing of personal data

**Configuration**
Custom symptoms, factors, activities, ratings · symptom groups · value types: quantity, duration/period, 1–9 scale, percentage, time-of-day, boolean tag, integer · range trackers · combo trackers · tag-only "this happened" logging · thresholds to convert numeric metrics into categorical factors (requested)

**Reminders & fatigue**
Time-based logging reminders · medication reminders + refill alerts · adherence tracking · goals/habits/streaks/achievements · event-anchored (Pointer) reminders · "less than 3 minutes a day" design constraint

**Data & platform**
CSV, JSON, PDF export · chart image export · doctor-shareable report/summary · encrypted cloud backup (Drive/iCloud) · local-only storage · self-hosted CouchDB sync · static-file web deployment · Docker Compose · public read/write REST API · **MCP server** · GPLv3 / MIT / AGPL licensing · caregiver & family profile sharing · emergency card · passcode lock · de-identified research donation

**Monetization**
Free tier with rolling data window (30-day) · symptom-count cap on free tier · customization paywalled · correlations/analytics paywalled · history paywalled · monthly / annual / lifetime tiers · 7-day and 30-day trials · hardware + subscription bundle · per-session coaching fee · HSA/FSA eligibility · hardship sponsorship program

---

## Ranked gap candidates for FoodTrack

Ranked by importance to a food→gut *causation* app specifically. Cost is engineering effort: **S** ≈ days, **M** ≈ weeks, **L** ≈ months.

---

**1. Show the statistics, and refuse to show a claim that isn't supported. — Cost M**
*Exemplar: Exist.io computes `p` and `occurrence` but buries them behind stars; Bearable asserts from 6 days.*
This is the only durable moat in the segment. Every competitor either shows a decorative percentage (Bearable, Daylio, Guava, CareClinic, mySymptoms) or computes real statistics and then hides them (Exist). Surface effect size, n, CI, and p — and **suppress the card entirely below a power threshold**, showing "keep logging: 11 more exposure days needed" instead. Bearable's "3 days with, 3 days without" bar is indefensible for an app claiming food causation, and it's the specific reason Ingraham's 18 months produced nothing trustworthy. Do the opposite loudly.

**2. Multiple-comparison correction, made visible. — Cost M**
*Exemplar: none. No product verified in this segment mentions it.*
FoodTrack will test hundreds of food×outcome×lag combinations. At α=0.05 across 300 tests, ~15 false positives appear by construction — which is precisely how a user gets an app-endorsed "cyclamate causes your symptom" that evaporates on contact. Ship FDR/Benjamini-Hochberg and say so in the UI ("we tested 340 combinations; 3 survive correction"). This single line of copy is more credible than every competitor's marketing page combined, and it is cheap.

**3. Randomized, blinded-where-possible N-of-1 challenge trials with a real analysis. — Cost L**
*Exemplars: Bearable Experiments (no randomization, no stats); StudyMe (ABAB phases, open source, but explicitly "did not set a main focus... on implementation of complex statistical methods," and "notably lacks randomization and blinding").*
This is the biggest unoccupied position in the whole market and it's directly FoodTrack's stated feature. Take StudyMe's design vocabulary (editable ABAB defaults, plain language, SUS 82) and add what both exemplars omit: randomized phase order, washout periods sized to gut transit, capsule/opaque-vehicle blinding guidance for food challenges, pre-registered primary outcome, and a proper paired analysis at the end. Nobody has shipped this.

**4. Transit-aware, per-food lag modeling — not a fixed lag menu. — Cost L**
*Exemplars: Exist = +1 day only; Bearable = user-selected 0–7 day buttons; everyone else = same-day or unspecified.*
Note the correction: **lag alone is no longer a differentiator** — Bearable ships 0–7 days. The differentiator is that Bearable makes the *user* pick the lag and then reports whichever one looks best, which is uncontrolled multiple testing dressed as a feature. FoodTrack should fit the lag distribution (and correct across the lag sweep), tie the window to observed personal transit time, and report the lag as an *output* with uncertainty, not an input the user fishes with.

**5. Sub-60-second logging: watch, widget, voice, and repeat-last. — Cost M**
*Exemplars: Daylio's two-tap (4.8★/61K ratings, praised by chronic-illness users for low energy cost); mySymptoms' repeat-prior-entry defaults; Nomie's one-line natural-language parse.*
The verified killer of this category is not bad analysis, it's abandonment. From Bearable's own roadmap: *"I gave up on using the Bearable app because it's too complicated to add entries"*; *"half the problem with tracking is not having a phone in hand"*; users explicitly asking to **log bowel movements without their phone**. Apple Watch entry has 209 votes and isn't even planned. A stool log that requires unlocking a phone in a bathroom will not survive contact with real life — and every statistical feature above is worthless without dense data.

**6. Adaptive scope narrowing as hypotheses form. — Cost M**
*Exemplar: Mymee — the app "is reconfigured to hone in on your various symptoms and dietary, environmental, and lifestyle triggers," weekly, keeping logging under 3 minutes/day across a 16-week program.*
The cleverest idea found in this research. Every other product's tracking burden is constant or grows; Mymee's *shrinks* as the hypothesis space collapses. FoodTrack can automate what Mymee pays a coach $125/session to do: once the engine has ruled out 40 foods, stop asking about them, and spend the user's limited logging budget on the live suspects. This simultaneously fixes fatigue (#5) and increases statistical power on the questions that matter.

**7. HealthKit symptom round-trip; asymmetric Health Connect strategy. — Cost S**
*Exemplars: HealthKit ships `abdominalCramps`, `bloating`, `constipation`, `diarrhea`, `heartburn`, `nausea`, `vomiting`, `fatigue`, `moodChanges` natively; Health Connect ships none of them and forbids custom types.*
Cheapest credibility win available. On iOS, read *and* write the GI symptom set so FoodTrack data enriches the OS layer and interoperates with clinical apps — Daylio is actively criticized for not doing this. On Android, plan for read-only enrichment (Nutrition, Hydration, Weight, Sleep, Vitals are all rich) and accept that Bristol/symptom data can never leave via Health Connect. Design the sync architecture asymmetric from day one rather than discovering this later.

**8. Honest uncertainty language and a "we found nothing" state. — Cost S**
*Exemplars: Exist.io's causation hygiene is best-in-class — "Correlations can't determine the cause... this is up to you to have a think about!", "a third variable might affect both attributes, or the relationship might be a coincidence," and the deliberate refusal of directional phrasing. Counter-exemplar: a Daylio user — "The correlation vs causation element isn't as evident as I'd like it to be...wind up just being a lot of data I don't know what to do with."*
Cheap, and it's the difference between a tool and a horoscope. Critically, build a **first-class null result screen**: "After 6 weeks, no food shows a credible association with your Bristol scores. Here's what that means and what to try next." Ingraham quit because 18 months of effort had no legible endpoint. An app that can confidently say *nothing here* is more trustworthy than one that always finds something.

**9. Full data ownership: export, API, MCP, self-host. — Cost M**
*Exemplars: Exist.io's public read/write API and "It's your data, not ours"; Zenobase's 2026 MIT relicense plus MCP support; Nomie's user-controlled CouchDB; Flaredown's GPLv3. Counter-exemplars: Visible gates your own data behind an active subscription; CareClinic permanently destroys data on uninstall; Guava documents no export path at all.*
FoodTrack is self-hosted, so this is table stakes — but **the MCP server is the differentiating move**. Zenobase shipped MCP in May 2026 and is the only one. A personal gut-health dataset that an LLM agent can query directly is a genuinely new capability, and it costs little on top of a clean REST API.

**10. Factor↔factor correlations and confounder surfacing. — Cost M**
*Exemplar: none shipped. Bearable's request has 487 votes, was filed Dec 2020, promised "within months" in Oct 2021, and was demoted from Planned back to Under Consideration in Oct 2022.*
Five years of unmet, well-articulated demand from the category leader's own users — including the request for *"time-based correlation: comparing factors entered on the same day or before, not after."* For a causation app this isn't a nice-to-have: without it you cannot tell "dairy worsens bloating" from "dairy co-occurs with alcohol, and alcohol worsens bloating." Surfacing the confounder alongside the claim is both the honest thing and the visibly differentiated thing.

**11. Event-anchored before/after comparison. — Cost S**
*Exemplar: Nomie 6.7.4 "Pointers" — tag a point in time (a colonoscopy, an antibiotic course, a travel trip), get reminders on it, and compare values of all notes tagged with that Pointer.*
Small, elegant, and a natural fit for gut health, where discrete interventions (antibiotics, probiotics, an elimination phase, a trip abroad) matter enormously and are invisible to a daily-correlation engine. Cheap to build on top of an existing tagging model.

**12. Designed derived metrics, not just raw logs. — Cost M**
*Exemplars: Visible's PacePoints (a spendable daily energy budget with real-time overspend alerts) and Morning Stability Score (drift from a 90-day rolling baseline).*
Visible has no correlation engine at all and still delivers value, because the *metric itself* encodes the clinical insight. The gut analogue: a rolling "gut stability" index over Bristol variance + symptom load, a fiber/FODMAP load budget, or a personal transit-time estimate. Caveat learned from their reviews: **explain the metric properly** — aelívra reports Visible "explains poorly" that the score is drift-from-baseline rather than absolute wellness, and users consequently distrust it.

**13. Pricing/packaging posture. — Cost S**
*Exemplars to avoid: CareClinic caps free users at three symptoms and nags "every. Single. Time. That you open the app"; Bearable's 30-day free data window and paywalled custom factors bred resentment among early free users. Exemplar to copy: Bearable's hardship sponsorship program; Guava's genuinely useful free tier.*
Less relevant to a self-hosted personal app, but the lesson transfers to defaults: never gate the user's own history or their ability to define what they track. Those two paywalls generate the loudest complaints in the entire segment.

---

### Verification notes
- **HIGH confidence** (primary source fetched): Bearable, Exist.io, Flaredown, Daylio, Nomie/Daily Nomie, Zenobase, CareClinic (complaints), Guava, Mymee, Visible (product), HealthKit, Health Connect, StudyMe, awesome-selfhosted.
- **MEDIUM**: Correla (vendor-authored comparison only), CareClinic pricing (competitor-sourced, bias flagged), Visible pricing (third-party; own pricing page 404'd), mySymptoms.
- **LOW / treat as dormant**: Symple.
- **UNVERIFIED and explicitly flagged in-line**: Exist's exact coefficient type and star→p thresholds; Zenobase current pricing and MCP post contents; Guava export capability; Nomie encryption; Flaredown and Nomie complaint corpora; HealthKit severity enum; Correla's engine.
- **Blocked**: Trustpilot (403 on both makevisible.com and guavahealth.com); Reddit domain-filtered search (proxy HTTP 400); Symple developer page and several vendor pricing pages returned 404 or empty renders. WebFetch itself was never rate-limited — **no WEBFETCH_BLOCKED condition occurred**.
---

# § 3 — Mainstream food loggers (food-entry UX)

## Per-product profiles

*(Everything below is from pages actually fetched this session. Items I could not confirm from a fetched page are tagged **UNVERIFIED**. WebFetch was blocked by the proxy on reddit.com and loseit.com — noted where relevant. WebSearch budget was exhausted at 200 calls; no search was blocked before that.)*

---

### MyFitnessPal
**Modalities.** Search (20.5M+ foods per App Store copy; "22 million" per the Today-tab help article — the two MFP-owned sources disagree), barcode scan (Premium), **Meal Scan** photo AI (Premium), **Voice Log** (Premium), Quick Add calories/macros (Premium), recipes (manual, bulk-paste, URL import), Meals/"remembered meals", copy-meal-to-another-day, Wear OS. Summer 2025 release consolidated "scan, speak, and search" into one search view for all tiers.
- Voice Log: `+` → Voice Log; accepts free phrasing — *"For Breakfast, I had one cup of plain Greek Yogurt, Honey, and some Blueberries"*; you can edit serving size/count/meal before committing. iOS+Android only, Premium only, **English-only device language**, v24.35.0+, **requires network**, and **cannot log custom items, recipes, quick adds, weight, exercise or water**. ([help](https://support.myfitnesspal.com/hc/en-us/articles/30332897072269-Voice-Logging), [launch PR](https://www.prnewswire.com/news-releases/say-it-log-it-myfitnesspal-unveils-voice-log-302329040.html))
- Meal Scan: CV model "suggests verified foods from our vast food database"; adjust servings after the match; undetected items are added by manual search inside the scan flow. Premium; iOS 18 / Android 13+; v22.17+; English. **Photo upload (vs live camera) is iOS-US only.** No accuracy figures published. ([FAQ](https://support.myfitnesspal.com/hc/en-us/articles/360045761612-Meal-Scan-FAQ)). Underlying vendor is **Passio AI**; Passio's own guide says food-amount/volume estimation is *"in the works"* — i.e. Meal Scan portioning is not volumetric today. ([Passio](https://www.passio.ai/blog/essential-guide-to-myfitnesspal-meal-scan))
- **Fastest affordance:** Today tab — "swipe right just below the meal name to bring forward the foods last logged under that meal." One gesture re-logs an entire meal. Also recents/frequents surfaced on tapping Log. ([help](https://support.myfitnesspal.com/hc/en-us/articles/39985611667341-Introducing-the-brand-new-Today-tab))

**Ambiguity.** Guesses and shows a best-match list; never asks a clarifying question. Docs explicitly do not address ambiguous voice input beyond a "Try again" button.

**Database.** Hybrid: crowd-sourced user submissions + branded feeds. Green-check "verified" marks exist but are widely distrusted — an MFP community thread has a user reporting a verified entry *"off by hundreds of calories,"* with MFP's response being "use Report Food." ([thread](https://community.myfitnesspal.com/en/discussion/10889831/ditch-the-green-check-marked-verified-entries)) The MFP-authored explainer page returned 403 to WebFetch — **UNVERIFIED** on official curation process.

**Recipes/composites.** Three creation paths: manual ingredient entry, **bulk paste** ("paste or type your ingredients into the box, and we'll match them with foods in our database"), and URL Recipe Importer (English devices only). Nutrition is summed across ingredients then divided by servings. **Whether the diary retains ingredient-level rows after logging a recipe is not documented — UNVERIFIED, and the phrasing "recipes function as complete units" suggests aggregation.** ([help](https://support.myfitnesspal.com/hc/en-us/articles/360032271452-How-to-create-and-find-your-recipes))

**Retroactive.** Copy an entire meal, or cherry-picked items across meals, to any date (web/iOS/Android). No documented bulk day-copy, no documented "copy yesterday" shortcut. ([help](https://support.myfitnesspal.com/hc/en-us/articles/360032622131-How-do-i-copy-a-meal-from-one-day-to-another))

**Export/API.** CSV only, **Premium/Premium+ only**, three files (meal-level nutrition + timestamps, progress, exercise), date-range selectable, all-or-nothing file selection. Granularity is meal-level; per-food-item rows not confirmed. No API mentioned. ([help](https://support.myfitnesspal.com/hc/en-us/articles/360032273352-Data-Export-FAQs))

**Complaints.** The 2022 barcode paywall is still the defining grievance (Slashdot, XDA, Pocket-lint, Droid-Life, ResetEra all covered it). App Store reviews surfaced meal-planner portion rigidity ("only options are portions equal to mine or double") and no per-person ingredient breakdown for family meals.

**Pricing.** Premium $79.99/yr (App Store shows $9.99–$19.99/mo, $49.99–$79.99/yr bands); Premium+ $99.99/yr adds Meal Planner.

---

### Cronometer
**Modalities.** Four official ways: **Photo Logging** (Gold), **Voice Logging + Siri** (Gold), Food Search, Barcode. Plus recipes, custom foods, favourites, Multi-Add, Repeat Items (Gold). ([blog](https://cronometer.com/blog/4-ways-to-log-food-on-cronometer/))
- Photo Logging launched **8 Sept 2025**, Gold-only. Positioned as *"an advanced search engine for your meals."* ([PR](https://www.prnewswire.com/news-releases/cronometer-launches-premium-photo-logging-fast-verified-nutrition-tracking-for-real-life-302549752.html))
- Voice: *"Two eggs, sourdough toast, and butter."* Siri iOS-only ("Hey Siri, log food in Cronometer"), v4.53.1+. Docs are unusually candid: *"Quantities may not always be captured perfectly on the first try"* and new foods *"may default to common serving sizes (like grams)."* Framed explicitly as **"a fast first pass"** — no clarifying dialogue. ([blog](https://cronometer.com/blog/voice-logging-siri/))

**Portion estimation — best-in-class affordances.** Photo-log guidance tells users to include *"a standard household item, like a fork or a quarter, in the photo"* for scale, or to photograph the plate **on a scale with the weight visible**. Review screen offers **swap buttons** for near-miss ingredients and **plus buttons** for commonly-forgotten items — *"butter on toast, oil used in cooking, or condiments."* ([blog](https://cronometer.com/blog/photo-logging/))

**Ambiguity — the most sophisticated handling found.** Rather than picking one answer, it **surfaces the alternatives inline**: e.g. offers both whole-wheat and gluten-free bread with a one-tap swap. Ambiguity becomes a visible, cheap-to-correct choice instead of a hidden guess.

**Database.** Tiered and labelled by source in results. Lab-analysed: NCCDB (17,000+ foods, 70 nutrients), USDA SR28 (8,000+), CNF, IFCDB, NEVO, CoFID, NUTTAB, CFCD. Label-derived: CRDB (user-submitted, **"Every user submitted food is reviewed by our curation team before being added"**), FDC UPC, Nutritionix (400,000+ barcodes). Search shows a source letter code and a nutrient count (e.g. "82 listed nutrients"); filters by USDA/NCCDB/CRDB/Custom. A **magic-wand icon** marks entries where a branded/user item was auto-cross-referenced against a lab database to backfill missing nutrients. ([data sources](https://support.cronometer.com/hc/en-us/articles/360018239472-Data-Sources), [search](https://cronometer.com/blog/food-search-updated/))

**Retroactive.** Free navigation to any date. **Timestamps are Gold-only.** **Repeat Items are Gold-only AND "can only be logged for today's date — prompts will not be shown on past or future dates."** Photo timestamps are used to place a retroactive log at the right meal time. ([timestamps](https://support.cronometer.com/hc/en-us/articles/360021811032-Timestamps), [repeat](https://cronometer.com/blog/repeating-food/))

**Export/API.** CSV export exists. **No public API** — a staff reply in the forum: *"Unfortunately, we don't currently have an API,"* with the thread running Jan 2019 → May 2024 and still unresolved; API access reportedly exists only for HIPAA-compliant practitioners. Community has built scrapers (`jrmycanady/gocronometer`, `cronometer-export`). ([forum](https://forums.cronometer.com/discussion/1801/cronometer-export-api))

**Complaints.** A representative forum thread: search *"takes wayyyy longer for the search results to appear,"* iOS logouts, notification overlays mid-log, and anger that roadmap effort goes to podcasts/scores/news feeds instead of **API, note search, first-day-of-week** — *"Jack of all trades, master of none."* No dev reply on that thread. ([thread](https://forums.cronometer.com/discussion/5176/cronometer-experience-is-a-mess))

**Pricing.** Basic free (84+ nutrients, 1M+ foods, barcode). Gold $10.99/mo or $59.99/yr ($4.99/mo equivalent). Gold gates: photo log, voice log, recipe importer, **timestamps**, macro scheduler, repeat items, unlimited history, custom charts, Crono Coach. ([gold page](https://cronometer.com/gold/))

---

### MacroFactor
**The speed benchmark holder.** MacroFactor publishes a **Food Logging Speed Index (FLSI)** — counts *"discrete actions (taps, clicks, selections)"* from start screen to end screen across four standardised tasks, over **21–22 apps** (Avatar Nutrition, Cal AI, Carb Manager, Carbon, Cronometer, FatSecret, Fitatu, FitGenie, FoodNoms, Foodvisor, Lifesum, LoseIt, MacroFactor, MyDietCoach, MyFitnessPal, MyMacros+, MyNetDiary, MyPlate, Noom, Nutracheck, Yazio, 1st Phorm).

| Task | Winner | Actions |
|---|---|---|
| Case 1 — search-log 2 foods, non-default servings, 3-digit qty | MacroFactor (speed mode) | **10** (MyNetDiary 11) |
| Case 2 — multi-add 2 foods, default servings | MacroFactor / FitGenie | **6** |
| Case 3 — barcode scan + non-default serving | MacroFactor (speed) | **5** |
| Case 4 — quick-add arbitrary calories | MacroFactor | **3** (1st Phorm 4) |
| **Cumulative** | MacroFactor | **24** (was 26 in 2022) |

Nearest competitor needs **+25%** actions; the average app **+70%**. Cal AI needs **45** — *"roughly 1.9 times as many."* ([FLSI 2025](https://macrofactor.com/fastest-food-logger-2025/), [vs Cal AI](https://macrofactor.com/macrofactor-vs-cal-ai/))

**Modalities.** Barcode + nutrition-label scan, search, **AI Describe** (*"describe your meal using voice or text, and we will interpret the ingredients and quantities"*), **AI photo** in three variants — Photo / **Photo & Text** / Upload-from-library, Quick Add, Custom Foods (barcode-attachable), Recipes, Library. All feed a shared **"Plate"** staging area — **multi-add** lets you *"add the default serving of any food directly to the minified Plate"* without leaving search, then commit the whole plate as one meal. Timeline-style log (does not force meal buckets). watchOS since v5.4.0 (Sept 2025). Speed mode vs Context mode toggles. ([new logger](https://macrofactor.com/new-food-logger/), [help](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor), [AI help](https://help.macrofactorapp.com/en/articles/258-ai-food-logging))

**Portion estimation.** AI returns estimated serving sizes; guidance is to include *"your fist or a common object in the photo"* or shoot *"with a food scale in view."* Every item stays editable; **you can expand a meal to edit individual ingredients.**

**Database.** 1,150,000 *"fully verified"* search foods (blog) / **1.36M verified + 4M barcode entries incl. the NCC research database** (comparison page — the two MacroFactor pages disagree on the number). AI photo *"search[es] our database for matching branded products"* rather than fabricating entries.

**Retroactive.** Return to previous dates to add/modify. **No documented copy-day or copy-meal feature — UNVERIFIED.**

**Pricing.** $11.99/mo, $47.99/6mo, $71.99/yr. **7-day trial, no free tier.**

**Counter-evidence on the speed claim.** MyNetDiary ran a rival test — one real user's week, **127 entries / 70 unique foods**, all taps and scrolls counted, seven apps: MyNetDiary 711 actions (5.60/entry), Lose It! 872 (+23%), **MacroFactor 877 (+23%)**, Noom 896 (+26%), Yazio 997 (+40%), Cronometer 1,003 (+41%), MyFitnessPal 1,035 (+46%). MyNetDiary won 21 of 27 meals; Lose It! and MacroFactor 4 each. Vendor-run and openly critical of FLSI's isolated-task framing — **both benchmarks are vendor-authored; treat directionally.** ([MyNetDiary](https://www.mynetdiary.com/which-calorie-tracker-app-is-the-fastest.html))

---

### Ate / YouAte (AteMate)
**The anti-calorie photo journal — closest philosophical relative to FoodTrack's "log first, analyse later."**
- **Photo *is* the log.** Lock-screen widget → **3 taps**. No calories, no macros, no database lookup, no search. Optional post-hoc reflection prompt ("Am I actually hungry?"), voluntary.
- **AteMate AI** is opt-in and only **auto-tags foods** for later search/filter — *"purely opt-in; the photo log works fine without it… The AI doesn't estimate calories."*
- Single chronological timeline mixing food, exercise, sleep, water, mood — *"scroll your week to spot the pattern"* (late workout → late meal → poor sleep) **without prescribing meaning**. New "Weekly Path Review" auto-surfaces patterns.
- No ads, no third-party behavioural analytics, no AI training on user data. Sharing with a coach is opt-in per person.
- ~$4.99/mo or $29.99/yr, 7-day trial. Play Store: 100K+ installs, **3.7★ / 574 reviews** — complaints are Android camera-permission bugs and "obviously built for iOS."
([youate.net](https://youate.net/), [Play](https://play.google.com/store/apps/details?id=com.youate.android&hl=en))

---

### Yazio
- 100M+ users (Dec 2025 factsheet), **20 languages, 150+ markets — Hebrew not listed**. HQ Erfurt, Germany. 4M+ searchable foods; strong European brand coverage.
- **AI photo scan launched June 2025**, now **Pro-only** (was briefly free). Detects ingredients, gives *"an initial estimate of the portion sizes and nutritional values"*, everything editable, scanned meals savable as reusable templates. Explicit disclaimer: *"AI recognition only provides a rough estimate and cannot guarantee 100% accurate results."*
- Barcode **moved behind Pro** — same paywall regression as MFP. A review notes the free tier *"feels more like a trial than a usable product"* and a sales banner sits mid-dashboard.
- Copy from previous days, widgets, Apple Watch, 2,900+ recipes. **No voice logging documented.**
- FLSI: 997 actions in the MyNetDiary test (+40%). Pricing $47.90/12mo (US App Store).
- App Store review complaints: Watch app crashes, Fitbit reconnection prompts interrupting meal logging, support chat closing mid-verification.
([Yazio help](https://help.yazio.com/hc/en-us/articles/39137901903889-What-is-the-AI-Calorie-Tracking-Feature-and-how-does-it-work), [factsheet PDF](https://filecontent.yazio.com/press/factsheet-yazio-en.pdf), [review](https://www.trygaya.com/review/yazio-review))

---

### FoodNoms
**The privacy/Apple-native outlier, and the source of the single best portion idea found.**
- Modalities: barcode ("incredibly fast"), **nutrition-label camera scan**, database search, **Smart Suggestions keyed to time-of-day + recent history**, **natural-language meal description** ("plain language" → Foodnoms AI), **AI Meal Scanner** (photo), **recipe import from URL or Safari extension**, **recipe creation by pasting a raw ingredient list**, Quick Entry, water/caffeine/alcohol.
- **Siri & Shortcuts: 44 actions across 8 categories**, plus App Shortcuts for Quick Entry, Log, Log Favorites, **Copy Logged Food**. Control Center widgets, Home/Lock Screen widgets, iPhone/iPad/Mac/Watch.
- **Portion confidence tiers — the standout pattern: "Accurate, Approximate, and Estimate," where Approximate carries 10% variance and Estimate carries 30%.** The app tracks and displays how sure it is about the portion, rather than pretending every number is exact.
- **AI grounding:** doesn't free-hallucinate — it generates search terms, queries the Foodnoms database, **retries with alternative keywords if nothing matches**, picks the best match, then determines portion; only falls back to a pure AI estimate when the DB has nothing. Explicit acknowledgement that portioning is *"more difficult when you must approximate or handle ambiguity."* 630,000+ foods, generics from USDA lab analysis.
- Privacy: mostly on-device, **no account required**, no ads, iCloud or Foodnoms Cloud sync, HealthKit read+write, **CSV export**.
- Pricing: 10 free AI uses, then Foodnoms+ **$39.99/yr or $5.99/mo** (7-day trial on annual). A lifetime option exists.
- **Risk flag: the public changelog's latest entry is 2024.25 (2024-11-30) — no 2025–2026 releases listed. UNVERIFIED whether the app is still actively developed.**
([MacStories review](https://www.macstories.net/reviews/foodnoms-a-privacy-focused-food-tracker-with-innovative-new-ways-to-log-meals/), [AI features](https://foodnoms.com/press/new-ai-features), [meal scanner](https://foodnoms.com/news/recipe-import-ai-meal-scanner), [Shortcuts](https://foodnoms.com/help/siri-and-shortcuts), [changelog](https://foodnoms.com/changelog/))

---

### Bitesnap / Bite AI
- Photo → ML identification → **full macro + micronutrient breakdown**, with automatic portion estimation and manual correction. **Free, no premium tier.**
- Smaller database than MFP; *"complex dishes, mixed meals, or unusual foods may be misidentified."*
- Bite AI ran developer-facing **Food Recognition API / Food Logging SDK** products (docs.bite.ai, bite.ai/food-recognition, bite.ai/food-logging-sdk).
- **Status uncertain:** getbitesnap.com content fetched carries a **2017 copyright** and no shutdown notice. **UNVERIFIED whether actively maintained.**
([review](https://home-cooks.co.uk/pages/review-bitesnap), [getbitesnap.com](https://getbitesnap.com/))

---

### Lose It!
- **Snap It** (photo, since 2016) — *"understands not just what's in your photo, but also the context of your meal — from individual ingredients to complete dishes"*, and maps results **to the user's own frequently-logged items**.
- **Say It** (voice) — *"Say 'I had 2 eggs, toast with butter and jam' to log your meal"*, matched against 56M+ (App Store) / 63M+ (press release) foods. Both AI features are offered to **free** members as trials before upgrade — notably more generous than MFP/Cronometer.
- Barcode, search, custom recipes/meals, patterns & insights, Apple Watch, Fitbit/Garmin/Withings/Google Fit/HealthKit sync.
- **The only vendor with published outcome data on AI logging:** members using AI logging showed **6% greater weight loss**, logged meals **3.5× faster**, and logged **2× as many foods**. (Vendor-reported.)
- FLSI/MyNetDiary: 872 actions (+23%) — 2nd fastest in that test.
- Review complaints centre on barcode + portion accuracy: *"bag of Trader Joe's beef jerky is not 90 cal, it's 360cal."*
- Pricing $9.99–$79.99; lifetime $49.99–$59.99; free basic tier.
- **loseit.com/snapit returned 403 to the proxy — official Snap It page not fetched.**
([newswire](https://www.newswire.com/news/lose-it-finds-ai-powered-logging-boosts-weight-loss-success-and-22557702), [App Store](https://apps.apple.com/us/app/lose-it-calorie-counter/id297368629))

---

### Lifesum
- Feb 2025: **"world-first AI-powered multimodal tracker"** — image recognition for complex dishes + voice + barcode + manual text, all four in one flow.
- CXO Lars Hansson: *"Traditional meal tracking is often tedious and time-consuming, so our goal was to make it seamless and effortless."* Claims *"higher retention, goal completion, and strong user engagement"* — **no numbers published**.
- Acquired Lykon (2024) to add biomarker analysis.
([PR](https://www.prnewswire.com/news-releases/lifesum-transforms-meal-tracking-with-ai-powered-multimodal-tracker-for-personalized-nutrition-302367832.html))

---

### Nutritionix (Track app + API)
**The oldest and most explicit natural-language time-to-log claim in the segment.**
- Track app: NLP search, **voice-to-text mic button**, barcode, **760+ US restaurant chain menus**, 800K+ foods covering ~95% of US/Canada grocery, custom recipes/foods. Marketing claim: **"Log all of your foods in as little as 60 seconds per day"** (also on Nutritionix's own Facebook: *"natural language technology to help you log all of your foods in under 60 seconds per day. Just type, speak, or scan"*). 4.8★ / 43,000 reviews. Track Pro $5.99/mo or $29/yr.
- **API — the reference implementation of food NL parsing.** `POST /v2/natural/nutrients`, body is **plain text, one phrase per line**, `Content-Type: text/plain`:
  ```
  1 tbsp sugar
  16 fl oz water
  1/2 lemon
  ```
  Returns per-line `parsed_query` objects — **`{qty, unit, food, query}`** — plus `serving_weight`, `est_calories`, `ndb_no`, full nutrient array, `idx` back-referencing the input line, and a `total` sum object. Fractions parse ("1/2" → 0.5); `unit` may be null. Optional `gram_weight` multiplier. **Docs do not cover unparsed items or rate limits — UNVERIFIED.**
- Pricing (per a third-party self-hosting analysis, early 2026): Free 200 calls/day with mandatory attribution; Hobby ~$50/mo for ~10K/day; Production $500–$2,000+/mo; Enterprise custom. NL parsing accuracy characterised as **~85%**. That analysis recommends most self-hosters **stay on free USDA + Open Food Facts** and hand-enter restaurant items.
([API docs](https://github.com/nutritionix/api-documentation/blob/master/v2/natural.md), [Track](https://apps.apple.com/us/app/nutritionix-track/id1061691342), [pricing analysis](https://selfhostednutrition.org/api/nutritionix-api-when-to-use/))

---

### SnapCalorie
**The only product attacking portion volume with hardware.**
- Founded by **Wade Norris (co-founder of Google Lens)** + Scott Baron. Training set: **5,000 meals photographed with robotic rigs, every ingredient weighed**, multiple angles/lighting.
- **Uses the phone's depth sensor to measure food volume** — *"something no other apps on the market do properly."*
- Accuracy claims: **~15% mean caloric error** (±150 kcal on a 1,000 kcal dish), vs nutrition labels 20% legal allowance, **dietitians estimating from photos 40%**, **average users of competing apps 53%**. TechCrunch quotes "under 20%." Cites a 2020 study where the best competitor (Calorie Mama) was correct only 63% of the time.
- **Ambiguity handling — distinctive:** users can **add contextual hints** (menu description, known ingredients) which the algorithm folds into the prediction. Human reviewers in the QA loop.
- Norris's framing is the core thesis: *"Human beings are terrible at visually estimating the portion size of a plate of food."*
- Acknowledged limitation: American food bias in training data.
- Free tier: **3 AI logs/day**; paid premium above that.
([FAQ](https://www.snapcalorie.com/faq.html), [TechCrunch](https://techcrunch.com/2023/06/26/snapcalorie-computer-vision-health-app-raises-3m/))

---

### Cal AI (and the 2024–26 AI-photo cohort)
- Photo scan, barcode, nutrition-label scan, macro breakdown, **food memory** (remembers frequently logged meals), portion adjustment. **No voice or text-describe documented on the Play listing.** Integrated MyFitnessPal's database in Dec 2025 (per MacroFactor) though *"search results still returned a relatively limited number of items."*
- FLSI: **45 actions** — 1.9× MacroFactor. Pricing ~$9.99/mo or **$30/yr**, family $59.99/yr — materially cheaper than the incumbents, which is much of the appeal.
- **Play Store complaints (fetched):** grapes logged at 60 kcal vs 260 actual; meat under-estimated ~50%; barcode results *"completely wrong"*; barcode scans return no serving size; **items auto-add to the day with no way to save for later**; streak-tracking bug.
- **Hacker News critique of the whole category** — the structural argument FoodTrack should internalise: photo AI cannot see fats and oils. *"You can increase the amount of oil or butter in a recipe, doubling or tripling its calorie count, and you would never be able to tell from a picture."* Dressing hides what's underneath. Testimonials show the AI merely reading a nutrition label that already had the numbers. The claimed "90% accuracy" is undefined. Several commenters concede the app works as a **behaviour-change ritual** regardless of numeric accuracy.
([Play](https://play.google.com/store/apps/details?id=com.viraldevelopment.calai&hl=en_US), [HN](https://news.ycombinator.com/item?id=43563580), [MacroFactor comparison](https://macrofactor.com/macrofactor-vs-cal-ai/))

---

### Samsung Food (ex-Whisk)
- **Recipe-box-first, not a food log.** Save recipes from any website (Chrome extension, one click); drag-and-drop weekly meal planner; recipe → shopping list in one click; **nutrition info + calorie counts + a health score for any saved recipe, including user-created ones**; recipe communities. Free across iOS/Android/Galaxy Store/web/Chrome.
- **Vision AI** (Samsung Food+, IFA 2024) photographs food **to populate a Food List / pantry inventory**, not to log intake. "Search with Your Food List" prioritises recipes using what you already have.
- Tracks calorie intake within daily meal schedules and macro targets with custom goals.
- **Samsung Health integration not mentioned on the fetched pages — UNVERIFIED.**
([samsungfood.com](https://samsungfood.com/), [Samsung newsroom](https://news.samsung.com/my/upgraded-samsung-food-raises-the-bar-for-food-experiences-at-ifa-2024))

---

### Paprika
- **Does not compute nutrition.** There is a free-text "Nutritional Info" field you fill in manually; it prints with the recipe.
- Web clipping from *"hundreds of different recipe sites"*, manual clipboard import, 12+ import file formats including `.paprikarecipes` and YAML.
- **Ingredient parsing expects `quantity unit ingredient`** (e.g. `1 cup milk`) and auto-consolidates like items across recipes for grocery lists. Scale & Convert preserves scaling into the grocery list.
- Export: per-recipe HTML with schema metadata, or bulk `.paprikarecipes`. Cloud sync every 5 min / WiFi-only / manual.
- No official API; `johnwbyrd/kappari` is a legally reverse-engineered API + SQLite cache spec.
([iOS guide](https://www.paprikaapp.com/help/ios/))

---

### Google Health (2025–26 entrant — worth watching)
Four logging paths: database search, barcode scan, **conversational logging via the Gemini-powered Health Coach — *"say 'I ate 1 banana' or 'Add one glass of orange juice to my food log'"* (text or voice)**, and **photo logging** ("find suggested food entries based on what is contained in your photo"). **Estimated macros are previewed on the main logging page before you finalise the entry** — a good ambiguity-surfacing pattern. Ingests nutrition from **MyFitnessPal and Cronometer via Health Connect / Apple Health with automatic dedup prioritisation.**
([support](https://support.google.com/googlehealth/answer/14237210?hl=en))

---

### Adjacent — the food→symptom correlation incumbents (your actual category)

**mySymptoms Food Diary** — the closest existing product to FoodTrack.
- Food logged by **search or barcode**, with **manual ingredient-and-quantity entry** and custom recipes/meals for reuse — i.e. **ingredient-level by construction**, but entirely by hand: **no AI, no photo parse, no NL parse found.**
- Symptoms with intensity + duration + notes; custom symptoms; **Bristol scale bowel movements**; energy, sleep.
- **Correlation analysis** across foods and symptoms, with reports, metrics, histograms, trend charts, and an **"event review"** listing every co-occurrence instance.
- **PDF + CSV export**; clinician-sharing web app; HIPAA/GDPR claims.
- **$9.99/mo, $39.99/6mo, $59.99/yr**, 7-day trial. ([App Store](https://apps.apple.com/us/app/mysymptoms-food-diary/id405231632))

**Cara Care (IBS/FODMAP)** — Food Tracker with favourites + photos and ingredient entry; **Poop Tracker** (bowel-movement types) and Symptom Tracker (bloating, constipation, diarrhoea, pain); dashboard shows **"Food on your best and worst days"**; share data with a provider; free basic + paid 12-week dietitian program. 100K+ installs. Reviewer explicitly asks for a **barcode scanner so ingredients get filled in automatically instead of reading labels** — direct evidence that this category's logging friction is unsolved. ([Play](https://play.google.com/store/apps/details?id=com.gohidoc.cara&hl=en_US))

---

### Infrastructure: Passio Nutrition-AI (the SDK behind MFP Meal Scan and others)
- One SDK covering **visual meal detection, barcode + nutrition-label scan, voice logging, semantic text search**, plus volume estimation. Both on-device and cloud deployment.
- **3.5M+ structured foods / 2.5M+ categorised**, with a consistent taxonomy and macro+micro breakdowns. 100M+ API requests/yr, 99.8% uptime.
- **Voice SDK specifics:** accepts full sentences — *"I had scrambled egg whites, bacon, and whole-grain toast"* — splits into separate foods with quantity/serving/calories where available, and lets the user **select/unselect items before committing**. **Works in any language supported by the phone's OS speech engine** — meaning Hebrew dictation is viable at the ASR layer even where the app's NLU isn't.
- Customers: Novo Nordisk, Ochsner Health, Teladoc, Lumen, InsideTracker, Dr. Berg, FasterWay.
([passio.ai](https://www.passio.ai/), [voice](https://www.passio.ai/voice-logging))

---

### Data sources — comparison for a self-hosted Hebrew-first app

| Source | Coverage | NL parse | Ingredient decomposition | Cost / licence | Self-host verdict |
|---|---|---|---|---|---|
| **USDA FoodData Central** | Foundation, SR Legacy, Branded, **Survey/FNDDS** | No | **Yes — via FNDDS** | **Public domain**, 1,000 req/hr, bulk download | **Best base layer** |
| **FNDDS specifically** | 2001-02 → **2021-23** (Oct 2024) | — | **`FNDDS Ingredients` + `Ingredient Nutrient Values` files decompose mixed dishes to SR codes** | Public domain, **`.xlsx` + Access + SAS** | **The single most valuable asset for a correlation app** — plus **`Portions and Weights.xlsx`** giving household-measure → gram weights |
| **Open Food Facts** | Global barcodes; **Israel = 8,089 products** | No | Ingredient *lists* (text), not nutrient-decomposed | **ODbL**; MongoDB / JSONL / **Parquet** / CSV (~0.9 GB gz) + **14-day delta exports**; live API on a "1 call = 1 real scan" honour rule | Take the **dump**, not the API |
| **Nutritionix** | 800K foods, **760+ US restaurant chains** | **Yes — `/v2/natural/nutrients`, the reference design** | Per-line ingredient objects | Free 200/day + attribution → ~$50/mo → $500–2,000+/mo | Study the API shape; don't depend on it |
| **Edamam** | ~900K (100K generic incl. **90K generic meals**, 790K UPC, 130K branded restaurant) | **Yes**, NLP + **Vision API** for dish→ingredients (up to 160 nutrients) | **Yes, per-ingredient-line** | Nutrition Analysis $29/mo (2.5K recipes / 10K lines) → $299/mo; Food DB $14 → $69 → $299/mo. **Caching restricted to protein/fat/net-carbs/calories, only behind password-protected accounts; scraping prohibited; attribution mandatory** | **Licence terms are hostile to a self-hosted personal log** |
| **Spoonacular** | Recipes + food | Parse-ingredients endpoint | Yes (recipe ingredients) | Point quota; image analysis = 3 pts | Recipe-shaped, not diary-shaped |
| **FatSecret** | **2.3M foods, 58+ country datasets, 26 languages, 90%+ global barcode coverage, "100% verified, zero duplicates"** | **Yes — NLP over text or voice**, plus image recognition (both **paid add-ons**) | Not documented | **Basic: free, 5,000 calls/day, US-only English, no barcode/NLP/image.** **Premier Free: unlimited, US-only, barcode yes — for companies <$1M revenue/funding, non-profits, students.** Premier: 58 countries, custom price | **Best regional-localisation story of any commercial API — but Israel/Hebrew is not confirmed in the fetched tier tables. Worth a direct sales enquiry.** |

---

## Food-entry UX pattern library

Every distinct fast-logging pattern found, with who does it.

**A. Capture-first / defer resolution**
1. **Photo *is* the log; resolution optional and deferred** — *Ate/YouAte* (3 taps from lock-screen widget; AI tagging strictly opt-in). The only product that decouples capture latency from parse latency.
2. **Photo + free-text hint together** — *MacroFactor* ("Photo & Text" mode); *SnapCalorie* (add menu description / known ingredients as hints).
3. **Photo timestamp used to place the entry at the right meal time** — *Cronometer*.

**B. Natural-language parse**
4. **Free-text/voice sentence → multi-item parse** — *MacroFactor* AI Describe, *Cronometer* Voice, *MFP* Voice Log, *Lose It* Say It, *FoodNoms* AI describe, *Lifesum*, *Google Health*, *Nutritionix Track*, *Passio SDK*.
5. **Line-per-food plain-text protocol** — *Nutritionix `/v2/natural/nutrients`* (one phrase per line → `{qty, unit, food}` per line, with `idx` back-reference).
6. **Paste a whole ingredient list → auto-match each line to DB entries** — *MFP* bulk recipe import, *FoodNoms* ("create recipes by typing or pasting a list of ingredients"), *Paprika* (`quantity unit ingredient` convention).
7. **Retry with alternative search terms before giving up** — *FoodNoms AI* (generate terms → query DB → **retry with different keywords** → best match → portion → only then fall back to AI estimate).
8. **Ground the LLM in the local DB rather than letting it invent numbers** — *FoodNoms* (ChatGPT + 630K-item DB), *MacroFactor* (searches its verified DB for branded matches), *Cronometer* (NCCDB/CFCD-backed).

**C. Repetition & recall — the cheapest wins**
9. **Swipe-to-relog the last instance of this meal** — *MFP* Today tab (swipe right under the meal name). One gesture, whole meal.
10. **Multi-add / staging plate** — *MacroFactor* (add default servings to a "minified Plate" without leaving search, commit as one meal); *Cronometer* Multi-Add; *FitGenie*.
11. **Time-of-day-aware suggestions** — *FoodNoms* Smart Suggestions; *MacroFactor* "hourly go-tos"; *MFP* recents/frequents.
12. **Scheduled repeating items** — *Cronometer* Repeat Items (Gold; **today-only**).
13. **Copy meal / copy items across days** — *MFP* (cherry-pick items across meals → any date); *Yazio*; *Cronometer* copy/paste.
14. **Map photo results to *this user's* frequently-logged foods, not the global DB** — *Lose It!* Snap It. Personalised vocabulary as a disambiguator.
15. **Save an AI-scanned meal as a reusable template** — *Yazio*.
16. **Search-result sorting by Most Frequent / Most Recent + favourites** — *Cronometer*.

**D. Reduce taps at the mechanical level**
17. **Quick Add raw calories/macros with no food attached** — *MacroFactor* (3 actions), *MFP* (Premium), *1st Phorm*.
18. **Timeline log with no forced meal buckets** — *MacroFactor*.
19. **Speed mode vs Context mode** — *MacroFactor* (user chooses fewer taps vs more information).
20. **Barcode + nutrition-label OCR as separate modes** — *FoodNoms*, *MacroFactor*, *Passio*, *Cal AI*.
21. **Shortcuts/Siri surface with pre-filled parameters** — *FoodNoms* (**44 Shortcuts actions in 8 categories**; App Shortcuts for Quick Entry, Log, Log Favorites, Copy Logged Food); *Cronometer* ("Hey Siri, log food in Cronometer"); *MacroFactor* watchOS.
22. **Lock Screen / Control Center / Home Screen widgets** — *Ate*, *FoodNoms*, *Yazio*.

**E. Portion affordances**
23. **Confidence-tiered portions** — *FoodNoms*: **Accurate / Approximate (10% variance) / Estimate (30% variance)**. Nobody else does this.
24. **Fiducial-object coaching** — *Cronometer* ("a fork or a quarter in the photo"), *MacroFactor* ("your fist or a common object").
25. **Scale-in-frame** — *Cronometer* and *MacroFactor* both suggest photographing the plate **with the food scale reading visible**.
26. **Depth-sensor volumetry** — *SnapCalorie* (the only one).
27. **Household-measure portion tables** — *USDA FNDDS `Portions and Weights.xlsx`*.
28. **Photographic portion guides (tablespoon/teaspoon/cup sizes)** — *FoodGroups.co.il*, in Hebrew.
29. **Default-serving-with-one-tap-override** — universal; *MacroFactor* optimises the non-default case explicitly (FLSI Case 1/3).

**F. Ambiguity surfacing**
30. **Show alternatives inline with a one-tap swap** — *Cronometer* photo log (whole-wheat vs gluten-free bread, swap button per row).
31. **Prompt for commonly-forgotten hidden ingredients** — *Cronometer* ("butter on toast, oil used in cooking, or condiments", added via + buttons).
32. **Select/unselect parsed items before committing** — *Passio* voice SDK; *Cronometer* review screen.
33. **Preview computed macros before finalising** — *Google Health*.
34. **Source-quality labels in search results** — *Cronometer* (database letter code + nutrient count + magic-wand for AI-backfilled entries).

**G. Composite meals**
35. **Recipe import from URL / share-sheet extension** — *FoodNoms* (Safari extension), *MFP*, *Cronometer* (Gold), *Paprika*, *Samsung Food* (Chrome extension).
36. **Recipe ingredients matched to real DB entries rather than AI-estimated** — *FoodNoms* (*"leverages real data from the Foodnoms database"* to assign portions).
37. **Expandable meal → edit individual ingredients** — *MacroFactor* ("expand the meal to make changes to individual ingredients for more precision").
38. **Auto-grouping of related items into one meal** — *FoodNoms* ("intuitively grouped together").

---

## Ambiguity handling — how each product deals with vague input

The test case: **"a bowl of pasta"** — no quantity, no sauce, no preparation.

| Product | Asks or guesses? | Mechanism | Quantity when unstated |
|---|---|---|---|
| **Cronometer** (voice) | **Guesses, openly** | Explicitly a *"fast first pass"*; user reviews and adjusts | *"New foods may default to common serving sizes (like grams)"*; docs warn *"quantities may not always be captured perfectly on the first try"* |
| **Cronometer** (photo) | **Guesses + shows rivals** | **Best pattern found:** ambiguous items ship with alternatives and a **swap button**; **+ buttons** prompt for hidden oil/butter/condiments | Visual estimate; coached to include a fork/coin or a visible scale reading |
| **MacroFactor** | Guesses | AI Describe *"interpret[s] the ingredients and quantities"*; result lands in the editable Plate; meals expand to per-ingredient rows | Estimated serving sizes, all editable |
| **MyFitnessPal** (voice) | Guesses, no dialogue | Returns "best matches"; edit serving/count/meal before logging; **"Try again"** if wrong | Not documented — **UNVERIFIED** |
| **MyFitnessPal** (Meal Scan) | Guesses | Suggests verified DB foods; **manual search inside the flow for undetected items** | Adjust servings post-match |
| **FoodNoms** | **Guesses, then quantifies its own uncertainty** | DB query → **keyword retry** → best match → portion; AI estimate only as fallback | **Labels the result Accurate / Approximate (±10%) / Estimate (±30%)** |
| **SnapCalorie** | Guesses, **but lets you feed it context** | User can attach hints — menu text, known ingredients — before inference; human reviewers in the loop | **Depth-sensor volume**, ~15% claimed mean caloric error |
| **Lose It!** | Guesses, biased to *you* | Maps recognised foods **to the member's own frequently-logged items** | Not documented — **UNVERIFIED** |
| **Yazio** | Guesses, disclaims | *"Only provides a rough estimate and cannot guarantee 100% accurate results"*; everything editable; save as template | AI proposes portion sizes; user urged to correct |
| **Cal AI** | Guesses, poorly | Users report systematic under-count; **barcode scans return no serving size at all**; **items auto-commit with no "save for later"** | Portion adjustment exists but starts from a bad prior |
| **Passio SDK** | Guesses, then filters | Splits the utterance into items with qty/serving/calories **where available**; user **selects/unselects before logging** | Omits quantity when it can't infer one |
| **Nutritionix API** | **Structurally exposes the guess** | Returns `parsed_query {qty, unit, food, query}` per line — **you can see exactly what it thought you said**; `unit` may be null | Falls back to a default serving; `gram_weight` override available |
| **Google Health** | Guesses, previews | Conversational input; **estimated macros previewed on the logging page before finalising** | Not documented — **UNVERIFIED** |
| **Ate** | **Refuses the question** | No quantity model at all — the photo is the record | N/A |
| **mySymptoms / Cara Care** | **Asks — by making you type it** | Manual ingredient + quantity entry, no parser | User supplies everything |

**The universal finding: not one product asks a clarifying question.** Every AI-parsing product guesses and makes correction cheap. The differentiation is entirely in *how legible and how cheap the correction is* — Cronometer's inline swaps, FoodNoms' confidence labels, Nutritionix's exposed `parsed_query`, Passio's select/unselect. The failure mode to avoid is Cal AI's: guess silently, auto-commit, no undo path.

---

## Ranked gap candidates for FoodTrack

Ranked by **(value to a food→gut-symptom correlation engine) × (competitive whitespace) ÷ cost**.

---

**1. Make the ingredient — not the meal, not the calorie — the atomic logged unit.** — cost **M**
*Exemplars:* MacroFactor's expandable Plate (per-ingredient editing); Cronometer's photo log returning ingredient rows with swap/add; **USDA FNDDS `FNDDS Ingredients` + `Ingredient Nutrient Values`, which decompose mixed dishes into SR-coded components**.
*Why it matters:* correlation power is proportional to the number of independently-varying binary/continuous predictors per meal. "Pasta bolognese, 620 kcal" is **one** predictor. "durum wheat pasta / beef / tomato / onion / garlic / olive oil / parmesan" is **seven**, and onion+garlic are exactly the FODMAP predictors a gut app must isolate. Every mainstream logger throws this away at commit time: MFP recipes *"function as complete units"*; Cal AI *"hid ingredients when confidence was low."* **Nobody in the mainstream segment persists a queryable ingredient graph. This is the single largest whitespace and it is FoodTrack's entire reason to exist.**

**2. Prompt for the invisible ingredients — oil, butter, sauce, condiments.** — cost **S**
*Exemplar:* Cronometer photo review offers *"butter on toast, oil used in cooking, or condiments"* as one-tap adds.
*Why it matters:* the Hacker News critique of the whole photo-AI category is that fat is invisible — *"you can increase the amount of oil or butter in a recipe, doubling or tripling its calorie count, and you would never be able to tell from a picture."* For calories that's a 2× error; for **gut symptoms fat is a primary trigger**, so an invisible variable is a *missing* variable, and a missing confounder poisons every association FoodTrack computes. Cheapest high-value feature on this list.

**3. Confidence-tiered portions instead of false precision.** — cost **S**
*Exemplar:* FoodNoms — **Accurate / Approximate (10%) / Estimate (30%)**. Literally nobody else.
*Why it matters:* two payoffs. (a) It **removes the psychological obligation to be exact**, which is the top cause of logging abandonment. (b) It gives the correlation engine a **per-observation weight** — an "Estimate"-tier portion should contribute less to an association than a weighed one. A statistics-driven app that discards its own uncertainty metadata is throwing away free signal.

**4. Never block on ambiguity: guess, commit, and make correction one tap.** — cost **S**
*Exemplars:* Cronometer's *"fast first pass"* + inline swap alternatives; Passio's select/unselect; Nutritionix's exposed `parsed_query {qty, unit, food}`.
*Why it matters:* every serious product converged here independently. **Show the parse, don't hide it** — render "**2** × **bowl** of **pasta**" as three editable chips so the user sees exactly which token was guessed. The anti-pattern to avoid is Cal AI's silent auto-commit. For FoodTrack, a *partially* correct entry logged in 4 seconds beats a perfect entry that never gets logged.

**5. Capture-now / resolve-later as a first-class state.** — cost **S–M**
*Exemplar:* Ate — 3 taps from a lock-screen widget, photo *is* the log, parsing strictly optional and deferred.
*Why it matters:* FoodTrack's outcome variables (stool, symptoms) arrive **hours after** the exposure, and its users log at restaurants, at family meals, mid-flare. An "unresolved" entry that holds a photo + timestamp preserves the **exposure event** even when the ingredient decomposition never happens; a "you must finish this form now" model loses the whole row. Statistically, a timestamped unresolved meal is still usable as a covariate; a missing meal is not.

**6. Hebrew-first natural-language parse grounded in a Hebrew food database.** — cost **L**
*Exemplars:* none — this is empty space. **MFP Voice Log requires an English device language. MFP Meal Scan is English-only. Yazio ships 20 languages and Hebrew is not among them. FatSecret ships 26 languages but Hebrew is unconfirmed. Passio's voice SDK is the only credible route** — it *"works in any language supported by your mobile OS speech engine,"* so Hebrew dictation is solved at the ASR layer even where NLU isn't.
*Why it matters:* it is simultaneously the largest engineering cost and the most complete moat. Design note: Hebrew is agglutinative with prefixed prepositions (ב/ל/מ/ה/ו) and no vowels — "בצלחת" vs "בצל" ("in a plate" vs "onion") is a real collision, and getting onion wrong is catastrophic for a FODMAP correlation. **Kaspenu already uses AI for Hebrew product-name processing and categorisation**, and the **NutriMatch paper (npj Digital Public Health, 2025)** validates the general approach — LLM-based semantic matching handling *"subtle linguistic variations, synonyms, and culturally specific food terms"* that keyword matching cannot, with Tzameret as one of its alignment targets.

**7. Retroactive logging as a free, first-class path — not a premium afterthought.** — cost **S**
*Anti-exemplars:* **Cronometer gates timestamps behind Gold**, and **Repeat Items *"can only be logged for today's date"***; MFP has no bulk day-copy.
*Why it matters:* a symptom-correlation app is **inherently retrospective** — the user opens it because something went wrong last night and wants to reconstruct yesterday. Needs: edit any date, set an arbitrary time on any entry, paste a whole day, and a "backfill yesterday" flow. Self-hosting makes gating absurd; ship it all free. Correlation lag windows (0–48h) are only computable if timestamps are accurate, so **time-of-day must be a required, always-free field.**

**8. One-gesture repeat of a habitual meal.** — cost **S**
*Exemplars:* **MFP's swipe-right-under-the-meal-name** re-logs the last instance of that meal — the single cheapest re-log gesture found anywhere; MacroFactor's multi-add plate; Cronometer's Repeat Items; FoodNoms' time-of-day Smart Suggestions; **Lose It mapping photo results to the user's own frequent foods**.
*Why it matters:* real diets are dominated by a small repertoire. Repeat exposures are what give a correlation engine its N. Making the 30th espresso cost one gesture is worth more to the statistics than making the exotic meal perfect.

**9. Full-day free-text paste ("brain dump") → parsed line-per-food.** — cost **M**
*Exemplars:* Nutritionix `/v2/natural/nutrients` (plain text, one phrase per line, `idx` mapping results back to input lines); MFP recipe bulk-paste; FoodNoms "paste a list of ingredients."
*Why it matters:* the highest-throughput backfill mechanism that exists. A user types six lines at bedtime and recovers an entire day. Combined with #7 it turns "I forgot to log for three days" from data loss into a 90-second recovery. The `idx` back-reference pattern is the right design — always show which input line produced which entry.

**10. Composite meal templates that stay decomposed.** — cost **M**
*Exemplars:* MacroFactor (expand meal → edit ingredients); FoodNoms (recipe ingredients matched to real DB entries, then auto-grouped); Yazio (save AI-scanned meal as template).
*Why it matters:* "my usual shakshuka" must be **one tap to log and seven ingredient rows in the database**. Every mainstream app forces a choice between reuse speed and ingredient fidelity. FoodTrack must refuse that trade: template = a saved ingredient graph, not a saved calorie total. This is #1 and #8 fused, and it's the feature that makes daily logging sustainable **without** degrading the correlation substrate.

**11. Photo + text hybrid input.** — cost **S**
*Exemplars:* MacroFactor's explicit "Photo & Text" mode; SnapCalorie's context hints (menu description, known ingredients).
*Why it matters:* the user always knows something the camera cannot see — "half portion", "cooked in butter", "the mild version". Letting them append 5 words to a photo is nearly free and resolves most of the fat/oil blindness in #2.

**12. Portable, ingredient-level, timestamped export + a real API.** — cost **S**
*Anti-exemplars:* **MFP export is Premium-only, CSV-only, meal-level.** **Cronometer has no public API** — a request open from Jan 2019 to May 2024 with an official *"we don't currently have an API,"* forcing the community into scrapers (`gocronometer`).
*Why it matters:* free positioning against the entire segment, and self-evident for a self-hosted app. Concretely: export must carry **per-ingredient rows with timestamps and portion-confidence tiers**, or downstream re-analysis is impossible.

**13. Fiducial-object and scale-in-frame portion coaching.** — cost **S**
*Exemplars:* Cronometer ("a fork or a quarter"), MacroFactor ("your fist or a common object", "with a food scale in view"). SnapCalorie's depth-sensor approach is the technically superior route but **cost L** and hardware-dependent.
*Why it matters:* near-zero implementation cost, and it upgrades entries from Estimate-tier to Approximate-tier (#3), which directly raises the weight those observations carry in the analysis.

**14. Hebrew barcode coverage via a stacked pipeline.** — cost **M**
*Approach:* Open Food Facts **Israel dump (8,089 products — thin: the largest single Israeli category has just 292 items)** as the ODbL base, layered with the **supermarket price-transparency catalogue (49 chains, 255,000+ active products, Hebrew names + barcodes, refreshed ~4-hourly)** for *name↔barcode* resolution, plus user-submitted label photos to fill nutrition.
*Why it matters:* barcode is the fastest logging modality that exists, and in Israel it is effectively unserved by the open ecosystem. Caveat: **the price-transparency feeds are not confirmed to carry nutrition or ingredient data — UNVERIFIED**; treat them as an identity/name layer only.

**15. Hebrew photographic portion guides using local vessels.** — cost **M**
*Exemplar:* **FoodGroups.co.il** already publishes *"photographs of foods divided into food groups and images of various portion sizes (tablespoons, teaspoons, different cup sizes)"* in Hebrew.
*Why it matters:* "1 cup" is not a native Israeli kitchen unit. Pita, a serving of hummus, a Turkish-coffee cup, a standard salad bowl are. Localised visual anchors raise portion-tier accuracy far more cheaply than any CV work.

**16. Watch / widget / Siri-Shortcuts capture surfaces.** — cost **M**
*Exemplars:* **FoodNoms' 44 Shortcuts actions across 8 categories** with pre-fillable parameters and App Shortcuts for Quick Entry / Log / Log Favorites / **Copy Logged Food** — the deepest OS integration in the segment; Ate's lock-screen widget (3 taps); Cronometer's Siri; MacroFactor's watchOS.
*Why it matters:* halves time-to-capture, and for FoodTrack's *non-food* streams — stool, symptom, wellbeing — a watch/widget tap is the difference between a complete outcome series and a series with holes. **Outcome-variable completeness matters more to a correlation engine than exposure-variable precision**, and this is the cheapest way to buy it.

---

### Anti-patterns observed — do not replicate
- **Paywalling the primitive.** MFP put the barcode scanner behind Premium in Aug 2022 (Slashdot / XDA / Pocket-lint / Droid-Life / ResetEra coverage); Yazio has since done the same. Cronometer gates **timestamps**. For a personal self-hosted app these are free by construction — say so.
- **Silent auto-commit.** Cal AI's *"cannot save foods for later; they automatically add to daily counts."*
- **English-language gating.** MFP Voice Log and Meal Scan both require an English device language. This is precisely the wall a Hebrew-first user hits today.
- **Verified badges that aren't.** MFP's green check on an entry *"off by hundreds of calories."* If FoodTrack shows provenance, show the actual source (Tzameret / FNDDS / OFF / user) and let the user judge — the way Cronometer's source letter-codes and nutrient counts do.
- **Precision theatre.** JMIR-cited evidence that **over 65% of 46 reviewed calorie apps over- or under-estimated intake**, alongside MyFitnessPal usage falling **from 5.4 to 1.4 logging days/week by week 12** (per a secondary summary of a 2024 JMIR mHealth scoping review — **UNVERIFIED at the primary source**). Precision the app cannot deliver, demanded from a user who will quit by week 12, is the category's central design failure. For FoodTrack the correct posture is: **coarse, complete, and honest about uncertainty beats fine, sparse, and confidently wrong.**

---

## Israeli / Hebrew food data — everything found

### National food composition (generic foods)
- **Tzameret (צמרת)** is Israel's national food composition database. **Independently confirmed** in *NutriMatch* (npj Digital Public Health, 2025), which describes it as *"an Israeli FCDB focused on nutrient data for locally consumed foods"* and uses it as an alignment target. That paper also documents the **Human Phenotype Project — "over 10,000 Israeli adults (40–70y) who log their diet continuously via a mobile app linked to an Israel-specific FCDB"** — i.e. Israel already has a large-scale, Hebrew, continuous-diet-logging cohort. ([Nature](https://www.nature.com/articles/s44482-025-00001-7))
- **"מאגר התזונה הלאומי הישראלי"** (Israeli National Nutrition Database) is published on **data.gov.il** at `data.gov.il/dataset/nutrition-database`. **The page consistently appears in search results but WebFetch got 404/robots-disallowed on `/dataset/`, `/he/dataset/`, `/en/dataset/`, the CKAN `package_show` API, and a specific resource UUID; curl through the proxy got `CONNECT tunnel failed, 403`.** Field list, record count, formats and licence are therefore **UNVERIFIED — but the dataset exists and is the highest-priority thing to retrieve manually.**
- Secondary, **UNVERIFIED**: an Israeli MCP-server directory describes that database as **4,500+ Israeli foods × 74 nutritional components**, explicitly including hummus, falafel, jachnun and Israeli salad, and offering **Hebrew and English search plus Israeli recipe ingredient analysis**. ([agentskills.co.il](https://agentskills.co.il/he/mcp/israel-nutrition))
- **FoodGroups.co.il** states outright that it draws on *"the National Nutrition Database of Israel"* alongside manufacturer labels and USDA — third-party corroboration that the MoH dataset is usable and in active use. It also publishes **Hebrew photographic portion guides** (tablespoons, teaspoons, various cup sizes) organised by food group. ([foodgroups.co.il](https://foodgroups.co.il/))
- FAO/INFOODS lists only a **1980 Hebrew Food Composition Table (97pp)** plus two citrus-juice papers — the international registry is badly out of date on Israel. ([FAO](https://www.fao.org/infoods/infoods/tables-and-databases/isreal/en/))

### Branded / barcode products
- **Open Food Facts Israel: 8,089 products.** Category depth is thin — largest categories are Plant-based foods & beverages 292, Plant-based foods 265, Dairies 184, Snacks 146, Fermented foods 143, Beverages 142, Fermented milk products 142, Cereals & potatoes 115, across 707 categories. **Free under ODbL**, full dumps as MongoDB / JSONL / **Parquet (Hugging Face)** / CSV plus **14-day delta exports**. Hebrew product names are present in the data (e.g. `world.openfoodfacts.org/product/7290001817728/ציטוס-puff-עלית`). ([il-en.openfoodfacts.org](https://il-en.openfoodfacts.org/), [categories](https://il-en.openfoodfacts.org/categories), [data](https://world.openfoodfacts.org/data))
- **Kaspenu (כספנו)** — nonprofit Israeli barcode-scanning app, launched **April 2025** by Yaelle Ifrah with co-founder Jeremy Atia and volunteers from Google, IBM and eToro. **~40,000 products, 15,000–18,000 actively available** (App Store says "15,000+"). Per product it surfaces: a 0–100 health & nutrition score, **Nutri-Score, NOVA classification, Israeli MoH nutritional-labelling status, full ingredient lists, additives, allergens**, kosher and local-production flags, plus cross-chain price comparison. **Uses AI for Hebrew language processing and product categorisation.** Sources: user submissions, Ministry of Economy site, manufacturer/importer public documents, price data under the Price Transparency Law. 4.8★/33 reviews, free, no ads. **No public API or data feed documented — UNVERIFIED.** This is the richest Israeli branded-food nutrition asset found; worth contacting directly given the nonprofit posture. ([JPost](https://www.jpost.com/israel-news/article-854169), [App Store](https://apps.apple.com/il/app/כספנו-הסריקה-החכמה/id6740878730), [kaspenu.org](https://www.kaspenu.org/en/blank-4))
- **Food Price Transparency Law feeds** — **IsraBis reports 255,000+ active products across all 49 legally-obligated chains, refreshed every 4 hours**, pulled from the government transparency database. Open tooling exists: `erlichsefi/israeli-supermarket-scrapers` (raw per-chain XML, inconsistent schemas and encodings) and `AKorets/israeli-supermarket-data` (normalised to CSV via pandas). **Whether these feeds carry nutrition or ingredient fields is not documented — UNVERIFIED; assume barcode + Hebrew product name + price only, i.e. an identity layer, not a nutrition layer.** ([israbis.com](https://israbis.com/en), [GitHub](https://github.com/AKorets/israeli-supermarket-data))
- Israeli EAN prefix is **729**, useful for filtering national products out of global dumps.

### Israeli/Hebrew consumer apps (direct competitors on Hebrew UX)
- **קלוריה / Kaloriya** (`com.protein2`) — **"over 60,000 local dishes"** tailored to Hebrew speakers, plus 3,000,000+ international products. Barcode, **AI meal photography**, manual search, 1,000 recipes, keto/paleo/WW templates, weight/water/exercise. **50K+ installs, 4.5★ / 808 reviews**, ad-supported. **The most direct Hebrew-first competitor found.** ([Play](https://play.google.com/store/apps/details?id=com.protein2&hl=en))
- **HitMeal** — Hebrew, barcode, search, meal plans by nutrition experts, a "Meal Scanner". ₪21.90–₪129.90 IAP tiers. **4.2★ / 117 reviews.** Complaint: recipes section has *"no support for filtering/grouping/sorting."* ([App Store IL](https://apps.apple.com/il/app/hitmeal-מחשבון-קלוריות/id1544461026?l=he))
- **kcal.co.il** — Hebrew web calorie tool with *"מאגר מזון ישראלי עשיר"*, barcode scanning, suggested portion sizes, fasting tracking, 300+ activities; cites Israeli MoH, USDA, NIH and NHS as guidance sources. ([kcal.co.il](https://kcal.co.il/))
- **קל-קאונטי**, **CaliAI - מעקב תזונתי**, **Be On Green (מעקב אוכל כשר חכם)** — additional Hebrew entrants surfaced in App Store IL search; **not individually fetched — UNVERIFIED.**

### The Hebrew gap, stated plainly
Of every mainstream product profiled: **MyFitnessPal Voice Log and Meal Scan both hard-require an English device language. Yazio ships 20 languages across 150+ markets and Hebrew is not among them. FatSecret ships 26 languages and 58 country datasets with NLP and image recognition as paid add-ons — Israel/Hebrew unconfirmed in the fetched tier tables and worth a direct enquiry. Cronometer, MacroFactor, Lose It and Lifesum publish no Hebrew support.** The one credible off-the-shelf route to Hebrew voice capture is **Passio's SDK, which delegates to the OS speech engine and therefore "works in any language supported by your mobile OS"** — meaning Hebrew ASR is solvable off-the-shelf and the genuinely hard, genuinely defensible work is **Hebrew food-entity resolution against Tzameret + FNDDS + Open Food Facts Israel**, exactly the problem NutriMatch demonstrates LLMs are good at.

---

**Method note.** WebFetch was blocked by the proxy (403) on `reddit.com`, `old.reddit.com` and `loseit.com`; `blog.myfitnesspal.com` and `odata.org.il` returned 403; `data.gov.il` returned 404/robots-disallowed on every path tried including via curl. Reddit sentiment is therefore reported only where a fetched secondary source quotes it, and is flagged as such. Vendor-run benchmarks (MacroFactor FLSI, MyNetDiary action count, Lose It outcome stats, SnapCalorie error rates) are labelled as vendor-authored throughout.
agentId: a5c642cfe6f13d051 (use SendMessage with to: 'a5c642cfe6f13d051', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 182485
tool_uses: 183
duration_ms: 984655</usage>
---

# § 4 — Personalised nutrition, microbiome, CGM

Note: claude-sonnet-5[1m] (the safety classifier) was unavailable (timed out) when reviewing this subagent's work. Please carefully verify the subagent's actions and output before acting on them.
WEBFETCH partial — the last few fetches hit HTTP 429 at the proxy after ~60 successful fetches; WebSearch also hit its 200-call session cap. Everything below is from pages actually fetched. Items I could not verify are marked **UNVERIFIED** and listed at the end.

---

# Competitor & concept research: science-backed personalisation tier

## Per-product profiles

### ZOE (joinzoe.com / zoe.com) — the closest strategic analogue to FoodTrack

**What it measures / how it becomes guidance.** ZOE's *current* product (ZOE 2.0) is a deliberate retreat from hardware. ZOE's own page states: "We have removed the need for eating cookies, blood fat, and continuous glucose monitors from ZOE 2.0," and "our ZOE algorithm can now predict your blood fat and blood glucose response by asking carefully selected health questions" ([zoe.com/learn/zoe-2-0-science-made-simple](https://zoe.com/learn/zoe-2-0-science-made-simple)). The FAQ repeats it: "you no longer need to eat cookies, take a blood sample, or wear a continuous glucose monitor" ([zoe.com/en-gb/faqs](https://zoe.com/en-gb/faqs)). The remaining test is a stool kit → shotgun metagenomic sequencing (MetaPhlAn4, ">5 million marker genes"), scoring the top 100 health-associated bacteria (50 "good", 50 "bad") and returning **a gut score out of 1,000** ([zoe.com/how-it-works](https://zoe.com/how-it-works), [zoe.com/learn/zoe-gut-microbiome-tests](https://zoe.com/learn/zoe-gut-microbiome-tests)). The microbiome test is now an **optional add-on**, not a prerequisite — "The redesigned app no longer requires a gut microbiome test to begin using it" ([The Grocer](https://www.thegrocer.co.uk/news/nutrition-brand-zoe-launches-radically-redesigned-new-app/709452.article)).

**Scoring model.** Foods are scored **0–100**, described as "a combination of predicted blood sugar response, blood fat response, and gut health impact" ([WellnessVerge](https://www.wellnessverge.com/zoe-personalized-nutrition-review)). A separate **Processed Food Risk Scale (0–100)** scores any scanned product on energy density, intake rate, hyperpalatability and non-culinary additives, bucketed into five bands from "Unprocessed" to "Highest Risk" ([ZOE 2.0](https://zoe.com/learn/zoe-2-0-science-made-simple)). The weighting between the three biological components is **not published**: "the exact weighting of these factors remains proprietary and undisclosed" ([mbiome](https://mbiome.co.uk/articles/zoe-review)). **No uncertainty is shown** — a score is presented as a point value. ZOE's own supplement is engineered to game its own scale: "Daily30 has been designed to score 100 in the ZOE App" ([FAQs](https://zoe.com/en-gb/faqs)).

**Cold start.** This is now ZOE's whole design. Day 1 = questionnaire + self-reported metrics → predicted glucose/fat responses; food scores exist before any biological sample. AI photologging gives instant macro/plant/processing feedback, and an AI chatbot ("Ziggie") delivers habit and education content ([The Grocer](https://www.thegrocer.co.uk/news/zoe-gut-health-app-losses-swell-as-it-slashes-membership-price/718306.article)).

**Logging burden.** Minimised via AI photologging ("snap products and receive instant analysis including macronutrients, plant content, and processing risk level") plus barcode/product scanning.

**Feedback timing.** Now **immediate but predicted**, not measured — score on log. Previously it was 14-day CGM + standardised muffin challenges with a 2–4 week wait to first results ([HealthRX](https://healthrx.com/brands-zoe/prescription-process), which appears to describe the legacy ZOE 1.0 flow — see conflict note below).

**Evidence base.** PREDICT 1 (Berry et al., *Nature Medicine* 2020, n=1,002 UK twins/unrelated + n=100 US validation): between-person coefficients of variation of **103% for triglyceride, 68% for glucose, 59% for insulin** responses to identical meals; gut microbiome explained **7.1%** of postprandial lipaemia variance vs meal macronutrients 3.6%; for glycaemia, meal macronutrients **15.4%** vs microbiome **6.0%**; genetic variants explained 9.5% (glucose), 0.8% (TG), 0.2% (C-peptide); prediction models reached **r = 0.77 (glucose), r = 0.47 (TG)** ([Nature Medicine](https://www.nature.com/articles/s41591-020-0934-0)). The METHOD RCT (*Nature Medicine* 2024, n=347, 18 weeks, control = USDA guidance leaflet + videos + weekly coach emails): triglycerides −0.13 mmol/L (P = 0.016), LDL no difference (P = 0.521), weight −2.46 kg (95% CI −3.67 to −1.25), waist −2.35 cm, HbA1c −0.05%, HEI diet quality **+7.08 points** ([Nature Medicine](https://www.nature.com/articles/s41591-024-02951-6)).

**Scientific criticism.** Dr Nicola Guess (Oxford) on METHOD: the trial "tested whether the Zoe program, with all its support, self-monitoring, education and other bells and whistles was better than a leaflet"; only the intervention arm logged food in real time (an independent calorie-reducing nudge); no blinding, and "people who know they are receiving the new cutting edge science-based program are likely to believe they will feel better." Weight loss was ~0.15 kg/week vs 0.5–1 kg/week for standard diets, against ~£700/year cost ([NutraIngredients](https://www.nutraingredients.com/Article/2024/05/10/Zoe-hails-personalized-nutrition-trial-success-results-come-under-scrutiny/)). Which?'s public-health nutritionist Shefalee Loth: "I wasn't convinced that it offered truly personalised nutrition advice as claimed" — the core advice (more plants, more fibre, less UPF) is "broadly applicable to everyone" ([Which?](https://www.which.co.uk/reviews/nutrition-and-supplements/article/zoe-review-is-it-worth-it-aOVeL1R5BW52)). mbiome adds: no RCT has compared ZOE's *scores* against generic guidance; a single stool sample is a snapshot; and there is orthorexia risk from constant numerical food scoring ([mbiome](https://mbiome.co.uk/articles/zoe-review)).

**Cost / hardware.** UK: **£9.99/month** after a 60% cut, plus **£149** for the optional microbiome test ([The Grocer](https://www.thegrocer.co.uk/news/zoe-gut-health-app-losses-swell-as-it-slashes-membership-price/718306.article)); Which? lists bundle £268.88, app-only £119.88/yr, £74.97/3mo, £2.30 7-day trial. US was $29/month or $348/year with >100,000 paying members in 2024 ([TechCrunch](https://techcrunch.com/2024/07/30/nutrition-microbiome-zoe)). **Hardware dependency: now zero.**

**The strategic signal for FoodTrack.** ZOE's finances for the year to Aug 2025: losses **over £20m** (nearly double), membership revenue **£17.4m** (from £27.7m), total revenue **£34.1m** (from £66.1m) — the company deliberately traded revenue for accessibility by killing the CGM, the blood-fat test and most of the price ([The Grocer](https://www.thegrocer.co.uk/news/zoe-gut-health-app-losses-swell-as-it-slashes-membership-price/718306.article)). The best-funded, best-evidenced player in this segment concluded that measurement hardware was a growth ceiling, not a moat.

**Conflict to note:** HealthRX (dated May 2026) still describes a kit at $359–499 / £299–359 *including an Abbott Libre Sense CGM and standardised test meals*, with membership at $24.99–59.99/month ([HealthRX](https://healthrx.com/brands-zoe/pricing-analysis)). This contradicts ZOE's own site and The Grocer. Treat ZOE's primary pages as authoritative; the HealthRX figures likely describe the legacy ZOE 1.0 flow.

**Data export.** GDPR rights are explicit: access, **portability ("a copy of your Personal Data in a machine-readable format")**, and erasure, via dpo@joinzoe.com or privacy.zoe.com. Anonymised data is shared with "academic research organizations (such as universities) and pharmaceutical companies." Sample retention is delegated to labs and varies by jurisdiction ([Privacy Policy](https://zoe.com/privacy-policy/14th-jan-2025)).

---

### Viome

**What it measures.** Metatranscriptomics — RNA sequencing "licensed from Los Alamos National Lab" — plus blood in higher tiers, producing "over 30 different health scores" across three layers: **Integrative Health Scores** (Gut Health, Cellular & Energy Efficiency, Immune System Health, Biological Age, Inflammation Response, Oral Health, Heart & Metabolic Health, Brain & Cognitive Health), **Functional Scores**, and **Pathway Scores**. Gut Health alone carries "more than 20 scores and pathways" ([Viome](https://www.viome.com/blog/you-decoded-guide-viomes-health-intelligence-test-scores)).

**Scoring / food model.** Four buckets: **Superfoods** ("your microbiome absolutely loves"), **Enjoy** ("reliable everyday options"), **Minimize** ("could cause mild disruptions if eaten frequently or in large amounts"), **Avoid** ("identified to create disruptions or imbalances") ([Viome](https://www.viome.com/blog/understanding-your-viome-food-categories-and-how-to-use-them)). Critically, Viome's own explainer **does not state how many foods are scored, the assignment mechanism, or any confidence/uncertainty metric**. This is a categorical, black-box, single-timepoint verdict system.

**Cold start.** Entirely test-driven. There is no useful output until the sample is sequenced — the opposite of ZOE 2.0.

**Cost.** HealthRX (May 2026): Gut Intelligence $249, Health Intelligence $299, Full Body Intelligence $499; supplements $49/month (gut tier) or $79/month; first-year totals $837–$1,447; auto-renewing; 30-day refunds only on **unopened** kits ([HealthRX](https://healthrx.com/brands-viome/pricing-analysis)). Innerbody lists coupon prices $169/$229/$289 with subscriptions $59–$170/month and free annual retesting ([Innerbody](https://www.innerbody.com/viome-review)).

**Scientific criticism — the strongest in this segment.** Elisabeth Bik's review of Viome's own preprint: methods insufficient to reproduce; no direct 16S-vs-metatranscriptomics comparison on the mock communities; negative-control read counts undisclosed; and decisively, top KEGG functions were present in **>99.9% of samples** — undermining the claim that functional data can differentiate individuals. Figures 5–7 showed taxonomy discriminating individuals *better* than gene expression, contradicting the paper's own thesis. Bik: "Viome's claims that their test can connect the microbiome transcriptome to a subject's diet… appear to be very far-fetched" ([Microbiome Digest](https://microbiomedigest.com/2019/04/25/a-review-of-the-recent-viome-preprint/)). NBC News documented lost samples, rejected samples and delays of 5+ months, and quoted NIH's Christopher Lynch ("A lot of companies are interested in the space, but they don't have the research to show that it's actually working") and Stanford's Justin Sonnenburg on the difficulty of distinguishing solid science from over-reach ([NBC News](https://www.nbcnews.com/health/health-news/microbiome-tests-promise-improve-gut-health-science-isn-t-solid-n1277196)). Regulatory posture: wellness product, no 510(k)/De Novo/PMA; CLIA/CAP certified (analytical, not clinical, validity); a 2022 *Gut Microbes* paper validates **analytical consistency only**; no independent RCT shows following Viome's recommendations beats standard advice; the AGA states microbiome testing for general health optimisation "is not supported by sufficient evidence" ([HealthRX](https://healthrx.com/brands-viome/safety-track-record)).

**User complaints.** BBB: **31 complaints in 3 years** — Product Issues (17), Service/Repair (8), Sales & Advertising (3), Delivery (2), Billing (1); 24 answered but not accepted. Themes: undisclosed long-term commitments with cancellation fees in the hundreds; a customer who was promised "20 personalized health scores" and "advanced RNA testing" receiving "two generic PDFs"; adverse GI reactions to recommended supplements with refunds refused; **a customer refused their underlying test data despite Viome retaining the sample for research**; months-long delays against a stated 2–3 week turnaround ([BBB](https://www.bbb.org/us/wa/bellevue/profile/vitamins-and-supplements/viome-1296-1000057403/complaints)).

**Data export.** No user-facing raw-data export documented; the BBB complaint above suggests active refusal.

---

### Tiny Health

Deep shotgun metagenomics — "over 120,000 bacteria, viruses, fungi, and protozoan parasites—down to a 0.005% relative abundance," strain-level, CLIA/CAP lab, proprietary pipeline (thMP/thDB/thDD) plus ML personalisation and functional profiling ([Technology](https://www.tinyhealth.com/technology)). Report structure: Summary & Expert Highlight, Key Insights, **Microbiome Breakdown** (each microbe labelled beneficial / unfriendly / variable / **unknown**), Conditions (signatures associated with elevated risk), and an Action Plan with named products and brands ([How it works](https://www.tinyhealth.com/how-it-works)). Adult test **$249**, results in 3–4 weeks, includes one **group** coaching call ([store page](https://www.tinyhealth.com/store/adult-gut-health-test)). Membership **Tiny+ at $399/year** = 2 tests + 1 coach session + unlimited text/email; extra kits $169, extra calls $39 ([support](https://support.tinyhealth.com/hc/en-us/articles/20070978221595-Membership-cost-and-discounts)). Cold start: none — test-gated, 3–4 weeks. Notable design detail worth stealing: the explicit **"unknown"** category for microbes, the only honest uncertainty signal I found anywhere in this segment. Raw-data access is not stated on the technology page (fastQ files are generated). No peer-reviewed validation is listed there.

### Thorne Gut Health Test

Metagenomic sequencing analysed by "Onegevity Health Intelligence," a proprietary multi-omic AI. The GutBio Report covers dysbiosis, intestinal permeability, digestion, inflammatory response, pathogen screen and microbial diversity, with numerical scores plus diet/lifestyle/probiotic/supplement recommendations; **~$198**; results feed discounted Thorne probiotic subscriptions ([GutHealth.org](https://guthealth.org/thorne-review/)). Collection is via a patent-pending **biodegradable "Microbiome Wipe"** that dissolves in the preservation solution — the lowest-friction stool collection in the segment ([Thorne press release](https://www.thorne.com/press-releases/thorne-relaunches-its-gut-health-test-with-the-first-to-market-user-friendly-microbiome-wipe-that-revolutionizes-the-testing-experience)). Criticism: no FDA approval; "the scientific and medical evidence regarding the microbiome…may not fully support all of the claims Thorne makes"; supplement upsell is the business model.

### Ombre (formerly Thryve)

16S rRNA (V3–V4 / V4) on Illumina MiSeq, 10–15M reads per run, screening 10,000+ species but showing "only the ones that are statistically significant in your sample"; report includes "evidence supported food recommendations based on your bacteria levels" ([Ombre](https://www.ombrelab.com/products/ombre-gut-health-test), listing $229.99; Innerbody lists $119.99 one-time / $89.99 subscription — **price discrepancy, unresolved**). **Ombre is the one company here that hands users their raw FASTQ files** ([Innerbody](https://www.innerbody.com/thryve-review)) — directly relevant to FoodTrack's import story. Criticism: 16S is weak at species level; and the reviewer found recommendations "sometimes referenced bacteria the tester had in *lower* levels than community averages," i.e. the food logic did not follow from the data. Trustpilot **3.4/5 from 97 reviews**: 4+ week delays ("Months later no results, no refunds"), cancellation loops, "They only allow picking one type of diet to give recommendations," and one user reporting a system bug that produced **two years of incorrect dietary guidance** ([Trustpilot](https://ca.trustpilot.com/review/ombrelab.com)).

### Sun Genomics / Floré

Whole-genome sequencing detecting "over 23,000 microbes… including bacteria, fungus, yeast, parasites, and viruses" at strain level; results drive a **custom-compounded probiotic**, with free reformulation if ineffective; test **$169**, subscription includes free retesting **every four months**; benchmarked against the American Gut Project ([GutHealth.org](https://guthealth.org/flore-review/)). Criticisms: "some health claims may be exaggerated," limited diet recommendations relative to competitors, no FDA approval, BBB A+ business rating but a 1-star customer rating (n=2).

### DayTwo — the cautionary tale

Founded 2015 on Segal/Elinav's Weizmann work; microbiome-based prediction of individual glycaemic response; raised **$85m** (Marius Nacht, Samsung Next, J&J Innovation Fund); **shut down August 2024** after downsizing from 100+ to 35 staff. Cause of death: "the Israeli company's platform was not distinct enough from other nutritional menus" and it failed to achieve health-service adoption. What happened to customer data is unspecified ([Globes](https://en.globes.co.il/en/article-microbiome-personalized-health-co-daytwo-shuts-down-1001486683)). **This is the direct commercial refutation of "better prediction wins."** The most scientifically pedigreed personalisation engine in the field died because the *output* looked like everyone else's meal plan — exactly the failure mode the 2026 RCT review names (see below).

### Signos

Stelo 15-day CGM + AI app; **FDA-cleared August 2025**, marketed as "the world's first and only FDA-cleared AI-driven app and CGM for weight management." Real-time model: flags spikes and offers "real-time moves to course-correct"; dietitians via Berry Street, with 95% of members paying $0 ([Signos](https://www.signos.com/how-it-works)). Plans: 1-month **$225/mo** (reg $299), 3-month **$150/mo**, 6-month **$127/mo**, all including 2 sensors/month; Signos+ (GLP-1 + CGM) $199/mo ([plans](https://www.signos.com/plans)). Independent analysis: the mechanism rests on the finding that "large postprandial glucose dips predicted greater hunger and increased caloric intake"; a 2023 pilot (n=59) found 3.1 kg vs 1.8 kg loss at 12 weeks but was underpowered; a 2022 systematic review found evidence "insufficient to support routine use"; the Endocrine Society's 2024 obesity guideline omits CGM; digital health apps see ~50% engagement drop after 30 days; Signos has published no peer-reviewed outcome data from its own users ([HealthRX](https://healthrx.com/brands-signos/overview)). **Data export: CSV of glucose + activity logs, emailed on request** ([support](https://support.signos.com/hc/en-us/articles/26157421018772-How-do-I-export-and-download-my-data)).

### Levels

Membership **$199/year** plus separately purchased sensors ($35–75 each, $75–199/month), first-year total $349–$2,599 ([HealthRX](https://healthrx.com/brands-levels/pricing-analysis)); a second review reports $199/month or $109/month billed annually ([BetterVitals](https://www.bettervitals.com/learn/levels-health-review)). Scoring: **each meal rated 1–10** from the glucose response — "Eat a bowl of white rice and watch your score crater to a 3. Swap it for cauliflower rice… and suddenly you're at an 8." Integrates Apple Health, Oura, Whoop. Complaints: learning plateaus — "By month 3 you've internalized the key lessons" — no human coaching, sensor adhesive failures, compression lows. Levels' own evidence page cites Kitazawa 2023, Zahedani 2023 and Holzer 2022 and concedes "much of the literature is observational or short-duration" requiring "stronger long-term randomized evidence" ([Levels](https://www.levels.com/blog/cgm-behavior-change-evidence-non-diabetes)).

### Nutrisense

Stelo (Dexcom) sensors, 2/month, plus a **registered dietitian** and "Nora" AI insights. 6-month **$149/mo**, 3-month **$179/mo**, 1-month **$215/mo** (regular $225/$270/$320) ([Nutrisense](https://www.nutrisense.io/products/cgm-plans)). App Store **4.3★ from 4.3K ratings**; low-star themes: aggressive auto-renewal (surprise charges of $250–350; one user reporting early-termination fees near **$850**), sensors failing at one of two weeks, slow support, and "merely duplicates free alternatives like MyFitnessPal or the Dexcom app" ([App Store](https://apps.apple.com/us/app/nutrisense-glucose-tracker/id1479100171?see-all=reviews)).

### January AI — the best cold-start design in the segment

Predicts glucose **without any sensor**, from "millions of data points comprising wearable, demographic, and user-reported data from thousands of users," against "the largest Glycemic Index (GI) and Glycemic Load (GL) database globally with 32M foods." Users photograph a meal; generative AI identifies items and quantities and returns a **traffic-light low/moderate/high impact** projection, conditioned on stated health status (healthy / prediabetic / type 2). An optional CGM upgrades the population prior into a personal "digital twin" in January Pro. The base app is free ([Fitt Insider press release](https://insider.fitt.co/press-release/january-ai-launches-the-worlds-first-glucose-prediction-app-scan-your-food-see-the-impact-all-without-a-glucose-monitor/)). **This is the exact architecture FoodTrack needs: population prior → personal posterior, with the sensor optional rather than foundational.**

### Lingo (Abbott)

OTC CGM, FDA-cleared June 2024, US launch Sept 2024; for adults 18+ not on insulin. Plans: **Learn 2 weeks $49, Build 4 weeks $89, Transform 12 weeks $249**; sensor lasts up to 14 days, but Abbott discloses **~22.9% may not last the full duration and 14.7% may last under 11 days** ([Abbott](https://abbott.mediaroom.com/2024-09-05-Abbotts-Lingo-TM-Continuous-Glucose-Monitor-for-Health-and-Wellness-Now-Available-in-the-U-S)). The scoring gimmick is the **"Lingo Count"**: "the body's glucose spikes are translated into one, easy-to-understand metric." Export: CSV with 5-minute timestamps, **but only values 55–200 mg/dL are shown (outside that: "out of range"), food logs and workouts are excluded, one export per day, file expires after a month** ([Lingo](https://www.hellolingo.com/blog/export-your-glucose-data)).

### Stelo (Dexcom)

FDA-cleared OTC integrated CGM, 18+, not on insulin. **$89/month subscription** (from $99), one-time purchase available, FSA/HSA eligible. Sensor: **77.9% last the full 15 days**; ~10% under 12 days. App: AI coaching, morning recaps, food and activity logging, spike/mood/energy pattern detection, meal-timing and food-combining guidance ([Stelo](https://www.stelo.com/en-us)). Stelo is the sensor substrate under both Signos and Nutrisense — the hardware layer has commoditised, and the differentiation has moved entirely to interpretation.

### Veri

**Meal Score 1–10** combining "glucose fluctuation, glucose rise, time above your ideal range, and after-meal average glucose level, and Food Quality" — the only competitor that explicitly folds a *nutritional-quality* term into a *biometric* score. Also a **Metabolic Healthspan** metric from average glucose, fasting glucose, variability, oscillation and BMI. Logging: ~1M-food database with smart suggestions, saved favourites, one-tap re-logs, auto-add daily staples, and sleep/exercise auto-sync ([Veri](https://www.veri.co/learn/how-does-veri-app-work)). Veri also runs **with or without a CGM** ([help.veri.co](https://help.veri.co/en/articles/7284039-veri-now-helps-you-stay-on-track-with-or-without-a-cgm)). Pricing UNVERIFIED.

### FoodMarble AIRE 2 — the only device measuring an actual *gut* output

Measures breath **hydrogen and methane** in ppm as a fermentation proxy; **$269** on FoodMarble's store (from $299), **$249** per Medical News Today; **no subscription, free app**; a separate Food Intolerance Kit provides lactose, fructose, sorbitol and inulin challenge substrates. The app tracks "breath scores, meals, symptoms, sleep and stress." Users are told not to exceed 10 tests/day ([FoodMarble](https://foodmarble.com/store/foodmarble-aire-2)).

*Validation, honestly reported:* the lactose study (n=13: 12 lactose + 7 milk challenges) found r > 0.8, p < 0.001 vs a calibrated BreathTracker, established a cut-off of 3.0 AU ≈ 25 ppm H₂ — but **26% of AIRE readings saturated at the 10.0 AU ceiling** and the device caps at 81 ppm ([PubMed 31319625](https://pubmed.ncbi.nlm.nih.gov/31319625/)). The SIBO study (n=36) found **86% diagnostic agreement** with a mail-in lactulose breath test, r = 0.78, device error 1.2 ppm — but **three authors are FoodMarble employees, one is a former employee, and the lead author sits on FoodMarble's clinical advisory board** ([medRxiv](https://www.medrxiv.org/content/10.1101/2022.04.21.22274143v1.full)).

*Burden and criticism:* up to 10 breath readings per day at specified times, some hourly, plus logging food, sleep, symptoms and stress; the device cannot diagnose coeliac disease; and the 2019 study itself warns results "may lead users to unnecessarily avoid certain foods," with low-FODMAP diets being "not sustainable." Trustpilot 4.3/5, 72% five-star, ~8% of negatives citing shipping, customer service and inaccurate results ([Medical News Today](https://www.medicalnewstoday.com/articles/foodmarble-review)).

### DNAfit

~700,000 genotyped variants (Circle Premium adds whole-exome, $629); Diet Fit $151, Home Fit $199. Output: a recommendation of **low-carb vs low-fat vs Mediterranean**, plus lactose intolerance, coeliac predisposition, carbohydrate sensitivity, and salt/alcohol/caffeine response. Part of Prenetics since 2018. The UK **Advertising Standards Authority ruled a DNAfit nutrigenetics advertisement "unfit for publication"** ([Nebula](https://nebula.org/blog/dnafit-review/)). STAT's investigation took five such tests ($154–$400) and found companies contradicting each other on **identical genotypes** — on COL5A1, DNAFit and Kinetic Diagnostics called it elevated tendon-injury risk while Orig3n called the same genotype protective, and Orig3n's CEO conceded his company "likely got it wrong"; two tests gave opposite readings of the same aerobic-fitness variant; and advice was either common sense or absurd ("eat quinoa on Sundays based on analysis of just two genetic variants") ([STAT](https://www.statnews.com/2016/11/03/genetic-testing-fitness-nutrition/)).

### Nutrigenomix

~**70 SNPs per report**, practitioner-gated (dietitians, physicians, wellness coaches), typically **$400+** through clinics. Panels: Personalized Nutrition & Fitness, Sport Nutrition & Performance, Fertility, Skin Health. The structural criticism is the model itself: a "single SNP–single outcome model" with no polygenic risk scoring, no integration of lifestyle or lab data, and static recommendations — while "single SNPs are rarely predictive of complex health conditions" ([SelfDecode](https://resources.selfdecode.com/blog/nutrigenomix-review/)).

### InsideTracker

Blood biomarkers (uploaded from your own physician, up to 30 result-sets/year, or purchased), free DNA upload from 23andMe/Ancestry (or a kit for 38 wellness traits, US only), and wearable integration (Apple Health, Oura, Fitbit, Garmin). **Membership $149/year**, InnerAge $99/analysis ([store](https://store.insidetracker.com/products/insidetracker-membership)). The interesting mechanic is **personalised "optimized zones"** — narrower than clinical reference ranges and adjusted by age, sex, race/ethnicity, habits and athletic activity (e.g. ferritin: population normal 12–150 ng/dL for women vs 40–150 recommended for a female endurance athlete in her 20s), derived from continuously updated peer-reviewed literature. Recommendations are **ranked by "impact score"** and are user-swappable ("swap recommended actions in and out based on what's realistic for you"). Uncertainty is not communicated ([support](https://support.insidetracker.com/en-US/how-does-insidetracker-determine-optimized-zones-288940)).

---

## Scoring & personalisation model comparison

| Product | Score object | Scale | Inputs | Explanation offered | Uncertainty shown | Personal vs population |
|---|---|---|---|---|---|---|
| **ZOE** | Food + meal | 0–100 (+ gut score /1000, Processed Food Risk 0–100) | Predicted glucose + predicted TG + gut impact; questionnaire-derived since 2.0 | Component narrative only; **weights undisclosed** | **No** | Population model conditioned on questionnaire; microbiome optional |
| **Viome** | Food | 4 categories (Superfood/Enjoy/Minimize/Avoid) | Metatranscriptome-derived scores | Category prose; **mechanism unpublished** | **No** | Fully test-derived, single timepoint |
| **Tiny Health** | Microbe + area | Scores + 4 microbe labels incl. **"unknown"** | Shotgun metagenomics + survey | Per-microbe abundance vs age-matched ranges | Partial — "unknown" class | Test-derived, age-stratified reference |
| **Thorne** | Health domain | Numeric domain scores | Metagenomics + AI | Domain-level | No | Test-derived |
| **Ombre** | Bacterial level → food | Relative-to-community | 16S | Explicit bacteria→food mapping (**shown to be sometimes inverted**) | No | Community-benchmark |
| **Floré** | Formulation | n/a — output is a compounded probiotic | WGS strain-level | Minimal | No | Test-derived vs American Gut |
| **Signos** | Glucose excursion | Real-time spike flags | Live CGM | Cause→effect on the curve | No | Fully personal, measured |
| **Levels** | Meal | **1–10** | Live CGM | Curve overlay | No | Fully personal, measured |
| **Nutrisense** | Meal/day | Glucose metrics + AI ("Nora") + human RD | Live CGM | Human dietitian narrative | No | Fully personal + expert |
| **Veri** | Meal | **1–10** | CGM: fluctuation + rise + time-above-range + post-meal mean **+ Food Quality** | Named sub-components — the most transparent composite found | No | Personal, with nutritional prior |
| **January AI** | Food | **Traffic light** low/mod/high | 32M-food GI/GL DB + demographics + wearables; CGM optional | Predicted curve + macro breakdown + swaps | No | **Population prior → optional personal twin** |
| **Lingo** | Whole day | **"Lingo Count"** (single number) | Live CGM | Deliberately minimal | No | Personal |
| **Stelo** | Patterns | Narrative AI insights | Live CGM | Morning recap | No | Personal |
| **FoodMarble** | Fermentation | ppm H₂/CH₄ → breath score | Breath device + logs | Direct physiological reading | No (device saturates at 10.0 AU / 81 ppm) | Personal, measured |
| **DNAfit / Nutrigenomix** | Diet archetype / trait | Categorical | 700k SNPs / ~70 SNPs | Per-variant | No | Fixed genotype, never updates |
| **InsideTracker** | Biomarker + action | **Optimized zone** + **impact-ranked** actions | Blood + DNA + wearables | Zone rationale from literature; actions ranked and swappable | No | Demographically stratified population zones |

**Four things nobody in this segment does, which is the whole opening for FoodTrack:**

1. **No product displays uncertainty.** Not one. Every score is a point estimate delivered with equal confidence whether it rests on 40 observations or zero.
2. **No product distinguishes "we predicted this from a population model" from "we measured this in you."** ZOE's 0–100 score looks identical before and after your microbiome sample arrives; January AI is the only one that even conceptually separates the prior from the twin.
3. **No product models cumulative or threshold dose.** Every score is per-food or per-meal, memoryless. FODMAP stacking (below) is a real, Monash-endorsed phenomenon that no scoring engine here represents.
4. **No product runs a real N-of-1 trial.** They correlate; they do not randomise, replicate, wash out, or control expectancy — despite the published evidence (below) that single observations are unreliable and that placebo challenge rates run around 26%.

---

## Cold-start strategies — how each is useful on day 1

| Approach | Who does it | Day-1 output | Honest assessment |
|---|---|---|---|
| **Questionnaire → predicted physiology** | **ZOE 2.0** | Full 0–100 food scores from "carefully selected health questions" | Best-in-class *commercially*; scientifically it means the "personalised" score on day 1 is a demographic model. ZOE does not label it as such. |
| **Population GI/GL database + demographics** | **January AI** | Traffic-light impact prediction for any of 32M foods from a photo | Cleanest architecture; explicitly frames CGM as an *upgrade* to a "digital twin" rather than a prerequisite |
| **Generic-food-property scoring** | ZOE (Processed Food Risk), Veri (Food Quality term) | Instant score with zero personal data | Genuinely useful, genuinely not personalised. Processing risk from energy density / hyperpalatability / additives needs nothing about you. |
| **Test-gated** | **Viome, Tiny Health, Thorne, Ombre, Floré** | **Nothing for 2–4 weeks** (Viome complaints report months) | The dominant failure mode. Trustpilot/BBB complaints across Viome, Ombre and Tiny Health are disproportionately about the wait. |
| **Immediate biometric** | Signos, Levels, Nutrisense, Stelo, Lingo, Veri | Real feedback within hours of sensor warm-up | Fastest true personalisation — but requires hardware, recurring cost, and (see below) the day-1 data may be unreliable |
| **Fixed genotype** | DNAfit, Nutrigenomix | Instant after ~2–4 week lab turnaround, then never changes | Food4Me shows this adds nothing; STAT shows companies contradict each other on identical variants |
| **Demographic reference zones** | InsideTracker | Optimized zones by age/sex/ethnicity/activity, actions ranked by impact score | The most *intellectually honest* cold start: it says "here is your zone given people like you," and ranks actions by expected impact |

**The decisive finding for FoodTrack's cold-start question** comes from Food4Me — the largest RCT of personalised nutrition ever run. 1,607 randomised, 1,269 completers, 6 months, four arms: L0 generic population advice, L1 personalised on diet alone, L2 diet + phenotype (anthropometry + blood biomarkers), L3 diet + phenotype + genotype (5 variants). Personalised advice beat generic — but **"There was no evidence that including phenotypic and phenotypic plus genotypic information enhanced the effectiveness of the PN advice,"** with changes "similar for all three types of PN advice" ([Int J Epidemiol](https://academic.oup.com/ije/article/46/2/578/2622850)). *Personalising on self-reported diet alone captured essentially the entire benefit.* FoodTrack, which is a food-logging app, already has the input that mattered.

The 2026 *Food & Function* review of 24 RCTs (2000–2025) reaches the same place and names the trap precisely: benefits over standard dietary advice were "often small or inconsistent"; genotype-based approaches were "limited and inconsistent… single-gene approaches largely ineffective"; ML/microbiome algorithms had the strongest evidence (4 of 5 glycaemic studies significant); and — the sentence FoodTrack should pin above the whiteboard — **"a key concern previously raised is that many existing algorithms provide similar advice across individuals, often recommending lower carbohydrate or higher fibre diets, regardless of complex input variables"** ([RSC](https://pubs.rsc.org/en/content/articlehtml/2026/fo/d5fo02969d)). That is DayTwo's cause of death and Which?'s verdict on ZOE, stated as a research finding.

---

## Science notes — with citations

### Postprandial response variability: what the evidence actually supports

**The foundational claim is real and well-replicated.** Zeevi et al. (*Cell* 2015): continuous glucose monitoring in **800 people across 46,898 real-life meals plus 5,107 standardised meals**. For standardised bread, the mean response across 795 people was **44 ± 31 mg/dl·h**, with the bottom decile under 15 and the top decile above 79 — a five-fold spread on identical food. A gradient-boosting regression on **137 features** (meal content, activity, blood parameters, CGM history, microbiome) validated at **R = 0.68–0.70** in an independent cohort of 100, and a **blinded randomised crossover in 26 participants** produced significantly lower postprandial responses on algorithm-predicted "good" diets, with 10 of 12 in the predictor arm improving ([Fermat's Library annotated edition](https://fermatslibrary.com/s/personalized-nutrition-by-prediction-of-glycemic-responses)). Berry et al. (*Nature Medicine* 2020, PREDICT 1, n=1,002 + 100) replicated it with between-person CVs of **103% (TG), 68% (glucose), 59% (insulin)**, and quantified the drivers: for glycaemia, **meal macronutrients 15.4%** of variance vs **microbiome 6.0%**; for lipaemia, **microbiome 7.1%** vs macronutrients 3.6%; genetics contributed 9.5% (glucose), 0.8% (TG), 0.2% (C-peptide) ([Nature Medicine](https://www.nature.com/articles/s41591-020-0934-0)).

**The critique is equally real and is the part FoodTrack must internalise.** Between-person variability is only actionable if within-person responses are *reproducible*. They largely are not. "Imprecision nutrition?" (n=30, **1,056 meal responses**, duplicate meals presented ~1 week apart across four dietary patterns, two CGM models) found intraclass correlations of **ICC = 0.31 (Abbott) and ICC = 0.14 (Dexcom)** — poor to negligible reproducibility — and variability across duplicate meals barely differed from variability across *different* meals. The authors' conclusion is directly prescriptive for an N-of-1 app: **"Individual postprandial CGM responses to duplicate meals were unreliable in adults without diabetes. Personalized diet advice based on CGM measurements in adults without diabetes requires more reliable methods involving aggregated repeated measurements"** ([medRxiv v2](https://www.medrxiv.org/content/10.1101/2023.06.14.23291406v2); later in *AJCN* 2025, PMID 39755436). The RepEAT study was designed specifically to settle this — 9 weeks fully controlled, three identical 3-week periods, ~378 meals and ~6,000 glucose measurements *per participant*, n=63 enrolled / 53 completed — and its rationale notes that meal timing, meal order and the second-meal effect on within-person consistency remain unresolved; preliminary GLYSIMI correlations between food-specific and individual-average responses ran **0.49–0.85** ([Frontiers in Nutrition](https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2023.1281978/full)).

**Measurement error compounds it.** A University of Bath trial (published in *AJCN*) compared FreeStyle Libre 2 against finger-prick in healthy adults: the CGM put a smoothie's glycaemic index at **69 vs a true 53 (+30%)**, misclassified genuinely low-GI whole fruits as medium/high, and **overestimated time above the Diabetes UK threshold by nearly 400%**. Prof. Javier Gonzalez: "For healthy individuals, relying on CGMs could lead to unnecessary food restrictions or poor dietary choices" ([University of Bath](https://www.bath.ac.uk/announcements/researchers-warn-continuous-glucose-monitors-can-overestimate-blood-sugar-levels/)). UCL/Birmingham researchers in *Diabetic Medicine* (doi 10.1111/dme.15369) note that normal non-diabetic glucose spans 3.3–7.8 mmol/L while "the most accurate CGMs have a 20% accuracy margin most of the time" — so a displayed reading could represent anything from 2.6 to 9.4 — and flag orthorexia risk ([UCL](https://www.ucl.ac.uk/news/2024/jun/use-glucose-monitors-people-not-living-diabetes-needs-more-regulation)). A JAMA Internal Medicine review (Johansson, Gothenburg, Aug 2026) concluded there is no evidence CGMs improve health outcomes in people without diabetes, and reported that **over two-thirds of non-diabetic users reported anxiety about developing diabetes** from their readings ([TechTimes summary](https://www.techtimes.com/articles/322946/20260804/wellness-cgms-mislead-healthy-users-jama-review-finds-zero-health-evidence.htm)). A 2026 meta-analysis of CGM in non-diabetics (23 studies, 1,074 participants) found mean glucose reduced (SMD −0.54, 95% CI −1.02 to −0.07, P = 0.03) but **BMI unchanged** (SMD −0.25, 95% CI −0.63 to 0.12, P = 0.19), with benefits concentrated in prediabetes and **"no appreciable glycemic benefits"** in healthy individuals — while noting CGM produced higher monitoring adherence than fingerprick and documented dietary shifts ([Eur J Med Res](https://link.springer.com/article/10.1186/s40001-026-03920-0)).

**Net position for FoodTrack:** between-person variability justifies personalisation in principle; within-person unreliability means any honest personalisation engine must be built on **aggregated, replicated measurements with explicit confidence** — which is precisely an N-of-1 trial engine, and precisely what no competitor ships.

### Stool consistency (Bristol) and food classes

Verified: stool consistency is a **strong microbiome covariate** and a **weak transit proxy**. In PREDICT 1 (n=863), dye-measured transit time explained **17.1%** of microbiome beta-diversity variance between fast and slow classes, versus **11.5%** for stool-type classes; and for classifying fast vs slow transit, dye achieved **AUC 0.82 against Bristol's 0.65** ([Gut 2021](https://gut.bmj.com/content/70/9/1665)). The Biocodex Microbiota Institute summary adds direction: harder stools corresponded to transit over 5 days, softer to around 1 day ([Biocodex](https://www.biocodexmicrobiotainstitute.com/en/pro/blue-poop-challenge-reliable-method-evaluate-gut-transit)).

Diet-side associations exist at population level — the *Journal of Nutrition* 2022 paper "Technician-Scored Stool Consistency Spans the Full Range of the Bristol Scale in a Healthy US Population and **Differs by Diet and Chronic Stress Load**" is the direct citation — but **I could not retrieve its effect sizes** (jn.nutrition.org and ScienceDirect both blocked). The blue-poop citizen-science dataset (21,541 volunteers, 17 countries) found that **both unusually fast and unusually slow transit correlated with poorer diet quality (p < 0.001)** and that "lower intakes of plant-based foods were associated with abnormal transit times" ([gutsandgrowth summary of DDW 2023 abstracts Su1612/Su1615](https://gutsandgrowth.com/2023/08/26/what-we-are-learning-from-the-blue-poop-challenge/)) — note these are **conference abstracts, not peer-reviewed full papers**.

**Honest verdict:** I found **no verified published effect size linking a specific food class to a specific Bristol-point change.** The literature supports fibre/plant intake ↔ transit ↔ consistency as a chain of associations, and supports Bristol as a *coarse* transit proxy, but per-food Bristol effect sizes appear to be an unfilled evidence gap. That is simultaneously the risk and the opportunity in FoodTrack's core premise: it would be generating data that does not currently exist, which argues strongly for conservative claims and visible confidence intervals.

### At-home transit-time measurement (blue dye)

**Validated enough to ship; not validated against gold standard.** The Gut 2021 study is the anchor: single-arm, single-blinded, **863 healthy PREDICT 1 participants**, two blue muffins (84.5 g each, food colouring), first blue stool self-reported in a mobile app. **Median whole-gut transit time 28.7 hours.** Blue dye had "the strongest association with the gut microbiome over typical transit time proxies such as stool consistency and frequency": AUC 0.82 vs 0.65 for Bristol; 17.1% vs 11.5% beta-diversity variance; longer transit associated with *Akkermansia muciniphila*, *Bacteroides* spp. and *Alistipes* spp. (FDR p < 0.01) and with Shannon alpha diversity (p = 7.1 × 10⁻⁶); 32 species significantly distinguished transit extremes; longer transit independently associated with greater visceral fat and higher postprandial responses ([Gut](https://gut.bmj.com/content/70/9/1665)).

The citizen-science replication gave **mean WGTT 23.9 hours, country means ranging 16.2–32 hours** ([gutsandgrowth](https://gutsandgrowth.com/2023/08/26/what-we-are-learning-from-the-blue-poop-challenge/)).

**The caveat that must be stated in-app:** Prof. Gianluca Ianiro's assessment is that the method shows promise but **has not been compared head-to-head against reference transit methods** — "Future evaluations, including comparisons with other methods of gut transit assessment, are needed to confirm these results" — and he cautions against unsupervised DIY use in people with digestive disease ([Biocodex](https://www.biocodexmicrobiotainstitute.com/en/pro/blue-poop-challenge-reliable-method-evaluate-gut-transit)). A 2025 paper titled "Optimizing blue poo: A validated, cost-effective method for measuring whole gut transit time" exists (ScienceDirect S2215016125005850) but **I could not fetch it — UNVERIFIED**.

**Could FoodTrack add it? Yes, and it is arguably the single best fit in this entire report.** It requires no hardware FoodTrack must ship (blue food colouring and a muffin recipe), it produces a *number* rather than a subjective rating, it outperforms Bristol on the one thing FoodTrack cares about, it is repeatable monthly, and it directly enables lag-correct attribution (see gap #7).

### FODMAP stacking / cumulative threshold dose

**Monash's position is explicit and cumulative.** Stacking occurs "when multiple 'green serves' of food are eaten in one sitting, there is an accumulation of FODMAPs in the gut, triggering symptoms." It is **dose-dependent and cross-subgroup**: "the total amount of FODMAPs consumed (be it from fructose, fructans, lactose, GOS or sugar polyols) influences whether the meal is tolerated," and stacking "refers to the consumption of foods with any type of FODMAP, not just the consumption of only the same type." Monash also states it set green-light cut-offs **conservatively, deliberately "allowing people to include more than one 'green serve' of food per sitting,"** and recommends spacing meals/snacks **at least 2–3 hours apart** ([Monash FODMAP](https://www.monashfodmap.com/blog/fodmap-stacking-explained/)).

**What the strongest trial actually shows.** The blinded randomised reintroduction phase of the low-FODMAP diet (*Gastroenterology* 2024) tested seven blinded powders in 7-day cycles in **77 analysed IBS patients** (94 entered; 17 lost to follow-up): fructans 20 g/day, fructose 60 g, GOS 12 g, lactose 60 g, mannitol 15 g, sorbitol 15 g, and **glucose 30 g as control**. Reaction rates: **fructans 56%, mannitol 54%, GOS 35%, lactose 28%, fructose 27%, sorbitol 23% — and glucose control 26%.** Patients averaged **2.5 ± 2 distinct FODMAP triggers**, an individualised pattern ([ACG EBGI summary](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/)).

Three implications, in order of importance to FoodTrack:

1. **The placebo arm reacted at 26%** — higher than sorbitol and comparable to fructose and lactose. Any uncontrolled N-of-1 "trigger detection" will manufacture false triggers at roughly this rate. A FoodTrack N-of-1 engine that does not include sham/control challenges will systematically produce spurious eliminations.
2. **Individual trigger patterns are real and heterogeneous** (2.5 ± 2 per person) — which is the legitimate case for personal N-of-1 testing rather than blanket restriction.
3. **This study did not test dose-dependence** — it used fixed daily doses per cycle. So while Monash asserts cumulative dosing as clinical doctrine, the **quantitative dose-response threshold per person is not established in this trial**; per-person thresholds remain an open, unfilled question. (Shepherd et al. 2008, the classic dose-dependent fructose/fructan challenge study, is the likely source of quantitative dose-response evidence — **I could not fetch its abstract; UNVERIFIED**.)

### Logging burden and the biofeedback→adherence link

Adherence to dietary self-monitoring "can be low, typically decreasing over time"; ≥10% weight loss was associated with logging **at least 20 days per month**, and visiting the tracking platform **2–3 times daily** outperformed once-daily. Photo-based tracking achieved **equivalent weight loss to database apps over six months**. But the paper's central finding is a paradox FoodTrack should not ignore: **lower-burden methods undermined habit formation.** Participants using wearables and photo logging reported significantly greater difficulty remembering to use them (5.0 ± 1.81 and 4.0 ± 2.24) than standard-app users (2.35 ± 1.79, p < 0.001). The authors: "it will be important to balance burden and habit formation" ([J Technol Behav Sci](https://link.springer.com/article/10.1007/s41347-021-00203-9)). Independently, digital health apps lose ~**50% of engagement after 30 days** ([HealthRX on Signos](https://healthrx.com/brands-signos/overview)), and Levels users report the learning plateaus by month 3 ([BetterVitals](https://www.bettervitals.com/learn/levels-health-review)).

On immediate biofeedback specifically: the 2026 meta-analysis found CGM produced **higher monitoring adherence than fingerprick** and documented dietary changes (less carbohydrate, more protein/fibre), but with no BMI benefit and no glycaemic benefit in healthy people ([Eur J Med Res](https://link.springer.com/article/10.1186/s40001-026-03920-0)). Levels' own evidence page concedes the non-diabetic literature is "observational or short-duration" and needs "stronger long-term randomized evidence" ([Levels](https://www.levels.com/blog/cgm-behavior-change-evidence-non-diabetes)). **Conclusion: immediacy buys engagement, not outcomes.** FoodTrack's inherent 12–48h feedback lag is a smaller handicap than it looks — but it does mean FoodTrack must manufacture its own immediacy at log time (see gap #1).

---

## Ranked gap candidates for FoodTrack

Ranked by (differentiation × evidence support) ÷ cost, with scope-creep flagged explicitly. FoodTrack constraints assumed: self-hosted, no proprietary hardware, food in → gut outcomes out, N-of-1 as the core mechanic.

### Tier 1 — build these; they are cheap, defensible, and nobody does them

**1. Show uncertainty on every personal effect estimate. — Cost: S. In scope.**
*Exemplar: nobody. The closest is Tiny Health's "unknown" microbe class.* Every competitor ships point estimates with uniform confidence. The evidence demands otherwise: ICCs of 0.14–0.31 for repeated identical meals mean a single observation is close to noise ([medRxiv](https://www.medrxiv.org/content/10.1101/2023.06.14.23291406v2)). Ship a confidence band and an observation count on every food–outcome claim ("dairy → looser stool: 6 exposures, wide interval, not yet distinguishable from chance"). This is the cheapest credibility moat available and it directly inoculates FoodTrack against the criticism that sank everyone else's claims.

**2. Population prior on day 1, explicitly labelled as a prior, converging to a personal posterior. — Cost: S–M. In scope.**
*Exemplar: January AI's "digital twin" framing; ZOE 2.0's questionnaire model; InsideTracker's demographic optimized zones.* Solves cold start without hardware. The honesty differentiator: ZOE's day-1 score is a population model presented as personalisation and is not labelled as such; FoodTrack should render the prior→posterior transition visibly (a shrinking interval as evidence accrues). Food4Me is the licence to do this — personalising on **self-reported diet alone** captured the entire measurable benefit ([Int J Epidemiol](https://academic.oup.com/ije/article/46/2/578/2622850)).

**3. A real N-of-1 engine: randomised, replicated, washed-out, with sham controls. — Cost: M. In scope. This is the product.**
*Exemplars: Zeevi's blinded 26-person crossover; the blinded FODMAP reintroduction trial's glucose-control arm.* The reintroduction trial's **26% placebo reaction rate** is the killer statistic — it means uncontrolled trigger-hunting will generate a false trigger roughly one time in four. Build: challenge scheduling with washout, ≥3 replicate exposures per food (justified by ICC 0.14–0.31), randomised challenge order, blinded/coded challenge labels where the user can be kept naive (capsule or disguised-vehicle protocols), and a decision rule that requires the personal effect to exceed the personal noise floor. **No competitor in this segment runs a controlled experiment. This is the entire defensible position.**

**4. Blue-dye transit time as a periodic, no-hardware biomarker. — Cost: S. In scope.**
*Exemplar: ZOE's Blue Poop Challenge / Gut 2021.* Validated to the extent anything here is: n=863, median 28.7h, **AUC 0.82 vs Bristol's 0.65**, 17.1% vs 11.5% microbiome variance explained ([Gut](https://gut.bmj.com/content/70/9/1665)). Requires nothing but blue food colouring and a timestamp. Ship the Ianiro caveat verbatim (not compared against reference methods; not for unsupervised use in diagnosed digestive disease).

**5. Data export and ownership as a headline feature. — Cost: S. In scope; a natural self-hosted win.**
*Exemplars — the bar is on the floor:* Lingo exports CSV but **clips to 55–200 mg/dL, excludes food logs and workouts, allows one export per day, and expires the file after a month** ([Lingo](https://www.hellolingo.com/blog/export-your-glucose-data)); Signos emails a CSV ([Signos](https://support.signos.com/hc/en-us/articles/26157421018772-How-do-I-export-and-download-my-data)); Viome had a BBB complaint from a customer **refused their own underlying data while Viome retained the sample for research** ([BBB](https://www.bbb.org/us/wa/bellevue/profile/vitamins-and-supplements/viome-1296-1000057403/complaints)); ZOE offers GDPR portability but shares anonymised data with pharmaceutical companies ([Privacy Policy](https://zoe.com/privacy-policy/14th-jan-2025)). Only **Ombre gives users raw FASTQ**. For a self-hosted app this is free to deliver and unmatched.

**6. Lag-aware, transit-adjusted attribution. — Cost: M. In scope. Technically the hardest genuine innovation here.**
*Exemplar: none — CGM apps assume a 2-hour window because glucose is fast.* Stool outcomes lag food by roughly a transit time, and transit varies from ~16 to ~32 hours between people (and further within). Attributing today's Bristol 6 to yesterday's lunch requires an explicit lag model — ideally personalised by the user's own blue-dye measurement (gap #4). This is where FoodTrack's problem genuinely differs from every CGM product, and where a correct implementation is not copyable by them.

### Tier 2 — high value, moderate cost

**7. Cumulative FODMAP-load / stacking engine. — Cost: M. In scope, with a data-licensing caveat.**
*Exemplar: Monash's guidance, which no app operationalises.* Monash states total FODMAP load is cumulative **across subgroups**, that green-serve cut-offs were set conservatively to permit multiple green serves, and that meals should be spaced 2–3 hours ([Monash](https://www.monashfodmap.com/blog/fodmap-stacking-explained/)). A rolling per-subgroup load curve with a personal threshold learned from N-of-1 data would be genuinely novel — and it directly explains the most common user frustration in IBS apps ("I ate only safe foods and still reacted"). **Caveat:** per-food FODMAP composition data is Monash's commercial asset; a self-hosted app needs an open composition source or user-entered estimates. **Caveat 2:** per-person dose thresholds are asserted clinically but the 2024 reintroduction trial used fixed doses and did not establish them — so FoodTrack would be estimating, not looking up, thresholds. Say so in-app.

**8. Adaptive logging granularity. — Cost: M. In scope.**
*Exemplars: ZOE's AI photologging; Veri's saved-favourites, one-tap re-log and auto-add-daily-staples; January AI's photo→ingredient inference.* The burden literature warns against naive minimisation: photo and wearable logging produced **worse** recall of *when* to log (4.0 ± 2.24 and 5.0 ± 1.81 vs 2.35 ± 1.79 for standard apps, p < 0.001) despite equivalent 6-month outcomes ([Springer](https://link.springer.com/article/10.1007/s41347-021-00203-9)). The right design is *variable* precision: coarse logging by default, and full ingredient detail demanded **only for foods currently under active N-of-1 test**. This makes burden proportional to the question being answered — which no competitor does, because none of them have a question.

**9. Manufactured immediacy at log time. — Cost: S. In scope.**
*Exemplars: ZOE's instant 0–100 on photo capture; January AI's traffic light; Lingo's single "Lingo Count."* CGM's adherence advantage is real ([Eur J Med Res](https://link.springer.com/article/10.1186/s40001-026-03920-0)) but its outcome advantage in healthy people is not. FoodTrack can capture the adherence half by returning *something* at log time — predicted load, trial-progress ("2 of 3 exposures logged"), running FODMAP stack — rather than making the user wait a transit time for any signal at all.

**10. Structured import of third-party data the user already owns. — Cost: M. In scope (importing ≠ hardware dependency).**
Ombre FASTQ, Stelo/Signos/Lingo CSV exports, InsideTracker blood panels, Apple Health/Google Fit. This converts competitors' hardware into optional FoodTrack inputs without FoodTrack shipping or requiring any. Rank it below the tier-1 items because each importer is a maintenance burden with a small user base.

**11. Photo-anchored Bristol scoring. — Cost: S–M. In scope but privacy-sensitive.**
The *Journal of Nutrition* 2022 title itself is the argument — **technician-scored** consistency behaves differently from self-report. On-device-only anchoring images (never uploaded) would improve the outcome variable that every downstream inference depends on. Given the subject matter, this is local-processing-or-nothing.

### Tier 3 — explicitly flagged as scope creep for a self-hosted, no-hardware app

**12. Breath-hydrogen integration (FoodMarble AIRE 2). — Cost: L. SCOPE CREEP.**
Tempting because it is the only device measuring a *gut* output rather than a proxy, and validation is respectable (SIBO: 86% agreement, r = 0.78; lactose: r > 0.8). But: $269 hardware, up to 10 breath tests per day, a device that **saturates at 10.0 AU with 26% of readings hitting the ceiling** and caps at 81 ppm, and validation studies with **three FoodMarble employees as authors and the lead author on their advisory board** ([medRxiv](https://www.medrxiv.org/content/10.1101/2022.04.21.22274143v1.full), [PubMed](https://pubmed.ncbi.nlm.nih.gov/31319625/)). Accept a CSV import if they offer one; do not build around it.

**13. Native CGM support. — Cost: L. SCOPE CREEP — and the evidence argues against it.**
ZOE, the segment's best-funded player, **removed the CGM** and cut prices 60% ([ZOE 2.0](https://zoe.com/learn/zoe-2-0-science-made-simple), [The Grocer](https://www.thegrocer.co.uk/news/zoe-gut-health-app-losses-swell-as-it-slashes-membership-price/718306.article)). JAMA Internal Medicine found no evidence of health benefit in non-diabetics; Bath found ~400% overestimation of time-above-threshold; UCL flagged orthorexia risk; the 2026 meta-analysis found no BMI benefit and no glycaemic benefit in healthy people. Glucose is also **the wrong outcome** for FoodTrack — it correlates with metabolic response, not stool quality. Import-only, never required.

**14. Ship or resell a microbiome test. — Cost: L. SCOPE CREEP.**
Turnaround is 2–4 weeks (Viome complaints report months), cost is $169–$499, and the AGA position is that "microbiome testing for general health optimization is not supported by sufficient evidence" ([HealthRX](https://healthrx.com/brands-viome/safety-track-record)). PREDICT 1 puts the microbiome at 6.0% of glycaemic variance and 7.1% of lipaemic variance. Accept an uploaded report; do not become a lab.

**15. Nutrigenetic scoring. — Cost: L. SCOPE CREEP and evidence-negative.**
Food4Me: adding genotype produced **no** improvement over diet-based personalisation. The 2026 review: single-gene approaches "largely ineffective." STAT: companies gave opposite readings of identical variants; the ASA ruled a DNAfit ad unfit for publication. Do not build this.

**16. Supplement / probiotic recommendation engine. — Cost: M. SCOPE CREEP + regulatory and trust risk.**
It is the monetisation model for Viome, Thorne, Floré and ZOE (Daily30+, "designed to score 100 in the ZOE App"), and it is the single largest source of the complaints, BBB actions and credibility damage documented above — adverse GI reactions with refused refunds, hidden commitments, cancellation fees. A self-hosted app with no product to sell is *structurally* more trustworthy than every company in this report. Do not surrender that.

**17. Human coaching. — Cost: L. SCOPE CREEP for self-hosted.**
Nutrisense and Signos bundle dietitians and Levels is criticised for lacking one; but it is unbundleable from a hosted service model. Substitute: better explanations and exportable reports a user can hand to their own clinician (FoodMarble does this via a healthcare-sharing email; Signos via CSV).

---

### Verification notes — what I could not confirm

- **UNVERIFIED:** Wolever's *EJCN* 2016 editorial "Personalized nutrition by prediction of glycaemic responses: fact or fantasy?" exists (PMID 27050901) but has **no abstract available**; I could not retrieve its arguments.
- **UNVERIFIED:** Effect sizes from *J Nutr* 2022 "Technician-Scored Stool Consistency… Differs by Diet and Chronic Stress Load" — jn.nutrition.org and ScienceDirect both blocked.
- **UNVERIFIED:** Shepherd et al. 2008 dose-response fructose/fructan abstract — cghjournal.org and ScienceDirect blocked.
- **UNVERIFIED:** "Optimizing blue poo: A validated, cost-effective method for measuring whole gut transit time" (2025) — could not fetch.
- **UNVERIFIED:** Mendes-Soares 2019 *JAMA Netw Open* DayTwo US validation — CAPTCHA-blocked.
- **UNVERIFIED:** PMC7071525 DTC nutrigenetics review — PMC served reCAPTCHA on every attempt.
- **UNVERIFIED:** Veri pricing; Nutrigenomix list price (only "clinics typically charge $400+" secondhand); Tiny Health raw-data availability; whether any FTC action exists against Sun Genomics (search returned an unrelated 2017 case).
- **CONFLICT:** ZOE kit contents and pricing — ZOE's own pages and The Grocer say the CGM and blood-fat test were removed and UK membership is £9.99/mo + optional £149 test; HealthRX (May 2026) still describes a CGM-inclusive $359–499 kit at $24.99–59.99/mo. I treat ZOE's primary sources as authoritative.
- **CONFLICT:** Ombre price ($229.99 own site vs $119.99/$89.99 Innerbody); Viome price (HealthRX list vs Innerbody coupon prices); FoodMarble price ($269 own store vs $249 MNT).
- **DATA QUALITY FLAG:** The METHOD trial triglyceride result as extracted reads "−0.13 mmol/L; 95% CI −0.07 to −0.01" — internally inconsistent (the point estimate falls outside its own CI). The direction and P = 0.016 are reliable; **treat the CI as UNVERIFIED**.
- Search budget (200 calls) and, at the end, WebFetch rate limiting stopped further verification; ~60 pages were successfully fetched.

**Sources:** [zoe.com/how-it-works](https://zoe.com/how-it-works) · [ZOE 2.0](https://zoe.com/learn/zoe-2-0-science-made-simple) · [ZOE FAQs](https://zoe.com/en-gb/faqs) · [ZOE microbiome tests](https://zoe.com/learn/zoe-gut-microbiome-tests) · [ZOE Privacy Policy](https://zoe.com/privacy-policy/14th-jan-2025) · [Nature Medicine PREDICT 1](https://www.nature.com/articles/s41591-020-0934-0) · [Nature Medicine METHOD](https://www.nature.com/articles/s41591-024-02951-6) · [NutraIngredients on METHOD critique](https://www.nutraingredients.com/Article/2024/05/10/Zoe-hails-personalized-nutrition-trial-success-results-come-under-scrutiny/) · [Which? ZOE review](https://www.which.co.uk/reviews/nutrition-and-supplements/article/zoe-review-is-it-worth-it-aOVeL1R5BW52) · [mbiome ZOE review](https://mbiome.co.uk/articles/zoe-review) · [WellnessVerge ZOE](https://www.wellnessverge.com/zoe-personalized-nutrition-review) · [The Grocer — ZOE losses](https://www.thegrocer.co.uk/news/zoe-gut-health-app-losses-swell-as-it-slashes-membership-price/718306.article) · [The Grocer — ZOE app redesign](https://www.thegrocer.co.uk/news/nutrition-brand-zoe-launches-radically-redesigned-new-app/709452.article) · [TechCrunch ZOE](https://techcrunch.com/2024/07/30/nutrition-microbiome-zoe) · [HealthRX ZOE pricing](https://healthrx.com/brands-zoe/pricing-analysis) · [HealthRX ZOE process](https://healthrx.com/brands-zoe/prescription-process) · [Viome scores guide](https://www.viome.com/blog/you-decoded-guide-viomes-health-intelligence-test-scores) · [Viome food categories](https://www.viome.com/blog/understanding-your-viome-food-categories-and-how-to-use-them) · [HealthRX Viome pricing](https://healthrx.com/brands-viome/pricing-analysis) · [HealthRX Viome safety](https://healthrx.com/brands-viome/safety-track-record) · [Innerbody Viome](https://www.innerbody.com/viome-review) · [Bik on Viome preprint](https://microbiomedigest.com/2019/04/25/a-review-of-the-recent-viome-preprint/) · [NBC News microbiome tests](https://www.nbcnews.com/health/health-news/microbiome-tests-promise-improve-gut-health-science-isn-t-solid-n1277196) · [BBB Viome complaints](https://www.bbb.org/us/wa/bellevue/profile/vitamins-and-supplements/viome-1296-1000057403/complaints) · [Tiny Health how it works](https://www.tinyhealth.com/how-it-works) · [Tiny Health adult test](https://www.tinyhealth.com/store/adult-gut-health-test) · [Tiny Health technology](https://www.tinyhealth.com/technology) · [Tiny Health membership cost](https://support.tinyhealth.com/hc/en-us/articles/20070978221595-Membership-cost-and-discounts) · [Thorne press release](https://www.thorne.com/press-releases/thorne-relaunches-its-gut-health-test-with-the-first-to-market-user-friendly-microbiome-wipe-that-revolutionizes-the-testing-experience) · [GutHealth.org Thorne](https://guthealth.org/thorne-review/) · [GutHealth.org Floré](https://guthealth.org/flore-review/) · [Ombre product page](https://www.ombrelab.com/products/ombre-gut-health-test) · [Innerbody Ombre](https://www.innerbody.com/thryve-review) · [Ombre Trustpilot](https://ca.trustpilot.com/review/ombrelab.com) · [Globes — DayTwo shutdown](https://en.globes.co.il/en/article-microbiome-personalized-health-co-daytwo-shuts-down-1001486683) · [Signos how it works](https://www.signos.com/how-it-works) · [Signos plans](https://www.signos.com/plans) · [HealthRX Signos overview](https://healthrx.com/brands-signos/overview) · [Signos data export](https://support.signos.com/hc/en-us/articles/26157421018772-How-do-I-export-and-download-my-data) · [HealthRX Levels pricing](https://healthrx.com/brands-levels/pricing-analysis) · [BetterVitals Levels review](https://www.bettervitals.com/learn/levels-health-review) · [Levels CGM evidence](https://www.levels.com/blog/cgm-behavior-change-evidence-non-diabetes) · [Nutrisense plans](https://www.nutrisense.io/products/cgm-plans) · [Nutrisense App Store reviews](https://apps.apple.com/us/app/nutrisense-glucose-tracker/id1479100171?see-all=reviews) · [January AI launch](https://insider.fitt.co/press-release/january-ai-launches-the-worlds-first-glucose-prediction-app-scan-your-food-see-the-impact-all-without-a-glucose-monitor/) · [Abbott Lingo launch](https://abbott.mediaroom.com/2024-09-05-Abbotts-Lingo-TM-Continuous-Glucose-Monitor-for-Health-and-Wellness-Now-Available-in-the-U-S) · [Lingo data export](https://www.hellolingo.com/blog/export-your-glucose-data) · [Stelo](https://www.stelo.com/en-us) · [Veri how it works](https://www.veri.co/learn/how-does-veri-app-work) · [Veri without CGM](https://help.veri.co/en/articles/7284039-veri-now-helps-you-stay-on-track-with-or-without-a-cgm) · [FoodMarble AIRE 2](https://foodmarble.com/store/foodmarble-aire-2) · [MNT FoodMarble review](https://www.medicalnewstoday.com/articles/foodmarble-review) · [AIRE SIBO study](https://www.medrxiv.org/content/10.1101/2022.04.21.22274143v1.full) · [AIRE lactose validation](https://pubmed.ncbi.nlm.nih.gov/31319625/) · [Nebula DNAfit review](https://nebula.org/blog/dnafit-review/) · [STAT genetic fitness tests](https://www.statnews.com/2016/11/03/genetic-testing-fitness-nutrition/) · [SelfDecode Nutrigenomix](https://resources.selfdecode.com/blog/nutrigenomix-review/) · [InsideTracker membership](https://store.insidetracker.com/products/insidetracker-membership) · [InsideTracker optimized zones](https://support.insidetracker.com/en-US/how-does-insidetracker-determine-optimized-zones-288940) · [Zeevi 2015 (Fermat's Library)](https://fermatslibrary.com/s/personalized-nutrition-by-prediction-of-glycemic-responses) · [Food4Me RCT](https://academic.oup.com/ije/article/46/2/578/2622850) · [Food & Function 2026 RCT review](https://pubs.rsc.org/en/content/articlehtml/2026/fo/d5fo02969d) · [Imprecision nutrition (medRxiv)](https://www.medrxiv.org/content/10.1101/2023.06.14.23291406v2) · [RepEAT study design](https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2023.1281978/full) · [University of Bath CGM accuracy](https://www.bath.ac.uk/announcements/researchers-warn-continuous-glucose-monitors-can-overestimate-blood-sugar-levels/) · [UCL CGM regulation](https://www.ucl.ac.uk/news/2024/jun/use-glucose-monitors-people-not-living-diabetes-needs-more-regulation) · [JAMA Intern Med wellness CGM review (summary)](https://www.techtimes.com/articles/322946/20260804/wellness-cgms-mislead-healthy-users-jama-review-finds-zero-health-evidence.htm) · [Eur J Med Res CGM meta-analysis](https://link.springer.com/article/10.1186/s40001-026-03920-0) · [Gut — Blue poo](https://gut.bmj.com/content/70/9/1665) · [Biocodex — blue poop reliability](https://www.biocodexmicrobiotainstitute.com/en/pro/blue-poop-challenge-reliable-method-evaluate-gut-transit) · [gutsandgrowth — blue poop challenge](https://gutsandgrowth.com/2023/08/26/what-we-are-learning-from-the-blue-poop-challenge/) · [Monash — FODMAP stacking](https://www.monashfodmap.com/blog/fodmap-stacking-explained/) · [ACG EBGI — FODMAP reintroduction](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/) · [J Technol Behav Sci — self-monitoring burden](https://link.springer.com/article/10.1007/s41347-021-00203-9) · [Wolever 2016 (metadata only)](https://pubmed.ncbi.nlm.nih.gov/27050901/)
agentId: abaf4fb8a03531a8a (use SendMessage with to: 'abaf4fb8a03531a8a', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 186716
tool_uses: 173
duration_ms: 1348560</usage>

---

# § 5 — N-of-1 platforms and methodology

### Product profiles

**N-of-1 / single-case platforms**

| Product | What it actually is | Verified detail | Source |
|---|---|---|---|
| **StudyU** (Hasso Plattner Institute) | Two-part platform: **StudyU Designer** (web app for researchers to specify, publish, manage N-of-1 trials) + **StudyU App** (participant app to enrol in published trials). Positioned around "multi-crossover randomized controlled trials in a single participant." | Fully open source, MIT licence; Flutter/Dart (93.3% Dart), PostgreSQL/PL-pgSQL, Supabase + Firebase; monorepo packages `app`, `core`, `database`, `designer_v2`, `flutter_common`, `supabase`. Live at designer.studyu.health / app.studyu.health, plus iOS/Android. | [hpi.de](https://hpi.de/lippert/projects/studyu.html), [github.com/hpi-studyu/studyu](https://github.com/hpi-studyu/studyu) |
| **StudyMe** (same group, consumer-facing) | The consumer sibling: lets **non-experts design their own N-of-1 trial**. This is the closest existing thing to what FoodTrack is trying to be. | Replaces clinical jargon ("experiment" for trial, "goal" for outcome). Supports **withdrawal (A/no-A)** and **alternating-treatment (A/B)** designs. Default **ABAB, 7-day phases**, user-editable length and pair count; supports **ABBA counterbalancing**. **Explicitly no randomisation and no blinding** — the authors say these "are challenging to execute in self-defined and self-administered trials." **Results are descriptive only** (graphs/tables); t-tests and Bayesian linear mixed models were *planned, not implemented*. Data stored **locally on device only**. Usability n=13, SUS **82** (A grade). Open source. | [Trials 2022, s13063-022-06893-7](https://link.springer.com/article/10.1186/s13063-022-06893-7) |
| **Trialist / PREEMPT** (Kravitz, UC Davis) | Smartphone-assisted N-of-1 trials for chronic pain — the largest RCT *of* N-of-1 trials. | 215 randomised (108 intervention / 107 control). App let patients pick 2 of 8 regimen categories; **period length 1–2 weeks** (2 weeks for opioids); **2, 3 or 4 paired comparisons**; total **4/6/8/12 weeks**; system "randomly chose a **counterbalanced treatment sequence**." Outcome: NSAID prescribing fell (ROR 0.53, p=0.04) with no pain increase; opioid prescribing unchanged (ROR 1.05, p=0.87). | [JGIM 2019](https://link.springer.com/article/10.1007/s11606-019-05303-0) |
| **iMTracker** | iPhone app doing **exactly FoodTrack's first half**: log symptoms + candidate triggers, auto-correlate on device, cycle hypothesis generation → testing. | Correlation via **phi statistic, computed daily and at 1-day lag**, **edge-computed on device** (no server transfer). 180 recruited; **103 (57.2%) completed follow-up**; of those, 70.9% used it for the planned 3 months; only 2.9% of completers missed >50% of days. Notably: after the study, users' **concerns about effectiveness rose significantly** — they completed it but didn't feel it helped. | [JMIR Form Res / PMC9044158](https://pmc.ncbi.nlm.nih.gov/articles/PMC9044158/) |
| **ICN (nof1sced.org)** | International Network for N-of-1 Trials and Single-Case Designs — community/standards hub, not a tool. **790+ members, 39+ countries.** Hosts guidelines, systematic reviews, analysis techniques. Its own commentary states "there is a gap in the availability of tools to support **consumers** in conducting N-of-1 trials." | Useful as a distribution/credibility channel. | [nof1sced.org](https://www.nof1sced.org/), [post on StudyMe](https://www.nof1sced.org/post/jan23_p) |
| **Caffeine/L-theanine self-directed N-of-1 protocol** | Published protocol for consumer-run mobile N-of-1 studies — the best public template for a self-administered design. | Three durations: **5 days** (1-day baseline + 1-day blocks), **15 days** (3+3), **27 days** (7-day baseline + 5-day blocks). **Randomised counterbalanced ABBA/BAAB**. Also randomises **notification frequency** (light vs moderate). **No blinding** — open self-selection of beverage/supplement. Analysis: linear model with **treatment + block factors**, each treatment vs baseline, **80% confidence threshold**. Failure rule: must complete **≥1/3 of treatments per period**. Authors call 15 days "a good balance" between power and dropout. | [Front. Comput. Sci. 2020](https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2020.00004/full) |

**Self-experimentation / QS infrastructure**

- **Open Humans** — participant-controlled personal-data platform ("From genomes to GPS"). Hosts self-research projects: *Keating Memorial Self Research* (301 members), *Quantified Flu* (269), *Overland* geolocation (212), plus file/AncestryDNA uploaders. Homepage shows recent signups but most recent blog content is 2021 — **activity level is low; no sunset notice found**. [openhumans.org](https://www.openhumans.org/)
- **Quantified Flu** — wearable (Fitbit, Apple Watch, Oura, Garmin, Google Fit) + **daily symptom check-in** to see whether physiology predicts illness onset. Open source, explicitly "a prototype that's under on-going development." **No published results.** Uses a citizen-science model rather than automated anomaly detection. [quantifiedflu.org/about](https://quantifiedflu.org/about/)
- **QS "A Framework for Personal Science"** — defines personal science as "using empirical methods to pursue personal health questions," structured as five activities: **questioning, designing, observing, reasoning, discovering**. Explicitly written to disentangle "a thicket of 'somehow related' terms" (self-tracking, self-experiment, N-of-1, single-subject, citizen science). [quantifiedself.com](https://quantifiedself.com/blog/personal-science/)
- **Personal science community study** (22 interviews, 269 coded excerpts, intercoder reliability 0.82) — motivations are health improvement, enjoyment of the research act ("hacker attitude"), and **learning through community**; career/publication incentives were minor. Barriers: time, **"sharing of self-research practices happens largely in unstructured ways, with a lack of clear protocols,"** weak analysis skills, and dismissal by clinicians. [Humanit Soc Sci Commun 2022](https://www.nature.com/articles/s41599-022-01199-0)
- **PersonalScience (Richard Sprague)** — a **weekly Substack newsletter**, not a platform. Motto: "science is a verb: something you *do*." Has sections for BRT/microbiome/chat. Not a self-experiment tool. [personalscience.com/about](https://www.personalscience.com/about)
- **Trialfacts** — **correction to the brief: this is not an N-of-1 or self-experimentation company.** It is a clinical-trial **participant recruitment** vendor ("Recruiting participants for research, guaranteed"), 250+ active studies, serving academic researchers, pharma/CRO/biotech. No N-of-1 offering. [trialfacts.com](https://trialfacts.com/)
- **Evidation** — real-world-data platform. Connects trackers (Fitbit, Apple Watch, Garmin) and apps (MyFitnessPal, Strava, Apple Health); **points model 10,000 points = $10**, daily caps deliberately used to build habit. **Observational only** — no individualized experiments or randomised interventions described. [evidation.com](https://evidation.com/blog/what-is-evidation)

**Self-hosted health-data communities (governance exemplars)**

- **Nightscout** — volunteer-run, self-hosted CGM cloud. Governance model FoodTrack should study for its **disclaimer posture**: "There is no support or any warranty of any kind," "do not rely on this for therapy," "each element of the system can fail at any time," and the blunt privacy warning that "all data you upload can be available for anyone on the Internet to read if they have your specific URL." Ethos: `#wearenotwaiting`. [nightscout.info](http://www.nightscout.info/)
- **OpenAPS** — publishes a **safety-focused reference design** + reference implementation + documentation, explicitly offered to patients, researchers *and* manufacturers on non-discriminatory terms. The reference-design-first pattern is the right analogue for FoodTrack publishing its trial protocol spec. [openaps.org](https://openaps.org/what-is-openaps/)

**Gut-specific programs**

| Product | Model | Verified evidence |
|---|---|---|
| **Ayble Health** | Started DTC (ML-personalised elimination + reintroduction, user-selectable program length, 4-month subscription "less than one hour with a dietitian"); has since moved to an **insurance-billed virtual clinic** (MD/RD/pharmacist/coach, $0–30 per visit, free app for meal+symptom tracking, brain–gut therapy). | Marketing claims: **81%** of IBS/IBD report improvement, **70%** "completely eliminate symptoms." Validation Institute "FoodMed Certification" claims **2× more effective than in-person/virtual dietetics, 30–40% better adherence, 50% better outcomes** — **no n, no methodology disclosed in the release**. A peer-reviewed paper exists (*Efficacy of a Digital Personalized Elimination Diet…*, Clin Transl Gastroenterol 2022, PMID 36322404) but **full text was paywalled — details UNVERIFIED**. [how-it-works](https://www.ayblehealth.com/how-it-works), [Fierce Healthcare](https://www.fiercehealthcare.com/digital-health/gi-focused-ayble-health-launches-dtc-app-nutrition-program), [Validation Institute](https://validationinstitute.com/press-releases/ayble-health-is-the-first-company-to-achieve-foodmed-certification-from-the-validation-institute/) |
| **Oshi Health** | Virtual multidisciplinary GI clinic: GI physicians/APPs, **GI dietitians (93% of patients)**, **GI psychologists (76%)**, health coaches, 24/7 chat. | n=332, propensity-matched payer-claims controls, 9-month program / 6-month cost window. **80% retention**, avg **10+ visits**. 92% reported symptom improvement, 89% QoL improvement, **64% reduction in GI-related ED visits**, 1.3 fewer missed workdays/month. **$6,724** GI-cost reduction (p<0.0001); **$10,292** all-cause reduction per patient. | [oshihealth.com](https://oshihealth.com/newsroom/press-releases/clinical-trial-demonstrates-oshi-improves-patient-outcomes/) |
| **Nerva** (Mindset Health) | Consumer gut-directed hypnotherapy. **6 weeks, 42 daily sessions**, ~25 min/day (psychoeducation + 15-min hypnotherapy + breathing); target ≥5 of 7 sessions/week. **$179/year**, no prescription. | Retrospective study of **3,141** users: those completing all 42 sessions had **>30% reduction in abdominal pain**; better outcomes if age 40+ and symptoms ≥5 years. **Acquired Mahana Therapeutics' assets 8 May 2025** (Mahana had raised >$80M); plans to fold Mahana's CBT content in. | [CDHF review](https://cdhf.ca/en/gut-directed-hypnotherapy-for-ibs-a-dietitians-comparative-review-of-nerva-and-regulora-experiences/), [nervahealth.com](https://www.nervahealth.com/article/nerva-mahana-acquisition) |
| **Mahana IBS** | Prescription digital therapeutic, gut-directed CBT. FDA-cleared. | **Real-world study: only 38% (343/843) completed half the sessions.** Those completing ≥5 sessions showed significant IBS-SSS improvement; older age predicted completion. **No longer prescribed in the US** — exited over reimbursement. | [Gastro & Hep, May 2025](https://www.gastroenterologyandhepatology.net/archives/may-2025/the-promise-of-digital-therapeutics-for-disorders-of-gut-brain-interaction/) |
| **Regulora** (metaMe) | Prescription gut-directed hypnotherapy: **7 × 30-min sessions over 12 weeks**, biweekly, optional practice between. ~$200 / 3 months. FDA + Health Canada cleared. | 2023 RCT: **30.4% of completers achieved ≥30% abdominal-pain reduction — but no significant difference vs muscle-relaxation control.** Currently **unavailable in the US market**. | [CDHF](https://cdhf.ca/en/gut-directed-hypnotherapy-for-ibs-a-dietitians-comparative-review-of-nerva-and-regulora-experiences/), [Gastro & Hep](https://www.gastroenterologyandhepatology.net/archives/may-2025/the-promise-of-digital-therapeutics-for-disorders-of-gut-brain-interaction/) |
| **Zemedy** (Bold Health) | CBT self-help app for IBS: **6 modules** (psychoeducation, relaxation, exercise, nutrition), exposure therapy and behavioural experiments, **8 weeks**. | **Crossover RCT, n=121** (62 immediate / 59 waitlist); assessments at baseline, 8 weeks, 3 months. Significant improvements in IBS symptoms (GSRS), IBS-QoL, and mental health. **Effect sizes and dropout not disclosed in the release — UNVERIFIED.** | [PR Newswire](https://www.prnewswire.com/news-releases/bold-healths-cbt-based-ibs-self-management-app-demonstrates-efficacy-in-clinical-trial-301296311.html), [JMIR mHealth 2021;9(5):e26152](https://mhealth.jmir.org/2021/5/e26152) |

**Sector-level warning for FoodTrack:** the DGBI digital-therapeutics review's blunt conclusion is that evidence for digital delivery is "less robust" than in-person, that it is "difficult for providers to evaluate the evidence for DTx apps objectively," and that **two FDA-cleared IBS DTx both exited the US market**. It also flags the specific failure mode FoodTrack risks: apps generate "so much data for patients that it can be difficult for both the patient and the provider to sort out what is important." ([Gastro & Hep](https://www.gastroenterologyandhepatology.net/archives/may-2025/the-promise-of-digital-therapeutics-for-disorders-of-gut-brain-interaction/))

---

### Guided elimination protocols compared — phases, durations, doses, decision rules

| Protocol | Elimination | Challenge unit | Dose schedule | Background diet | Washout / gap | Decision rule | Blinded? |
|---|---|---|---|---|---|---|---|
| **Monash low-FODMAP (official)** | **Step 1: 2–6 weeks** swap high→low FODMAP. If no improvement, stop — symptoms likely not FODMAP-driven. | **Step 2:** one FODMAP subgroup at a time, food rich in **only 1 FODMAP group**, **3 days** per challenge | **Escalating over 3 days:** Day 1 moderate (amber) serve → Day 2 high serve → Day 3 "higher red serve or your usual serving" | **Remain on Step 1 low-FODMAP diet throughout each challenge** | **2–3 day break between challenges, or until symptoms settle**, returning to low FODMAP. Start each challenge only when "symptoms are well controlled." | Three outcome bands: **no symptoms → eat freely**; **mild–moderate → restrict to green + amber serves**; **severe → limit both amber and red serves** (implemented as app traffic-light filter settings). Pass = 3 days with no symptoms or only minor manageable symptoms. | No |
| | Whole Step 2 ≈ **6–8 weeks**. Step 3 = personalisation, ongoing, with **periodic retesting** of poorly tolerated foods. Dietitian supervision explicitly required (30-hour Monash certification). | | | | | | |
| **Blinded randomised FODMAP reintroduction** (Gastroenterology 2024) — the methodological gold standard | **6-week elimination** first; only responders proceed | **7 cycles**, one powder each: fructans, fructose, GOS, lactose, mannitol, sorbitol, **glucose control** | **Fixed daily doses:** fructan **20 g**, fructose **60 g**, GOS **12 g**, lactose **60 g**, mannitol **15 g**, sorbitol **15 g**, glucose **30 g**. Powder dissolved in water, **3×/day with meals, 7 days** | Low-FODMAP background | **2-day washout** with no study powder between cycles | **Positive = rise of >50 points in IBS-SSS above the elimination-phase mean** | **Yes** — all agents delivered as indistinguishable powders |
| | Flow: 117 recruited → 105 baseline → **94 entered reintroduction → 77 completed**. 85% had ≥1 recurrence; mean **2.5 ± 2** FODMAPs triggered symptoms per person. Fructans **56%**, mannitol **54%**, others 23–35%, **glucose control 26%**. | | | | | | |
| **Skodje DBPC fructan vs gluten** (Gastroenterology 2018) | Participants already on self-instituted gluten-free diets | 3 arms, randomised crossover | **Gluten 5.7 g/day, fructan 2.1 g/day, placebo**, concealed in **muesli bars**, **7 days per arm** | Gluten-free background | **≥7 days washout, extended until symptoms from the previous challenge resolved** | GSRS-IBS. Result: fructan 38.6 ± 12.3 > gluten 33.1 ± 13.3 (p=0.049); placebo 34.3 ± 13.9 | **Yes**, double-blind |
| **DBPC gluten challenge, NCGS (pooled)** | Gluten-free run-in | Varies by study | Reported doses: **4.375 g** (Di Sabatino), **5.6 g/day** (Elli), **10 g/day** (paediatric) | GF background | Varies | Study-specific symptom relapse | **Yes** |
| **Whole30 reintroduction** | 30-day full elimination | One food *group* at a time, **≥10 days total, up to 30+** | One day of eating the group, then evaluate | Return to Whole30 elimination between groups | **2–3 days back on Whole30 between each group** | No quantitative rule. Evaluate across 15 named domains (digestion, energy, sleep, cravings, mood, anxiety, focus, skin, allergies, breathing, headaches, athletic performance/recovery, pain, inflammation, medical symptoms). Explicitly: "A negative response doesn't automatically mean you should completely avoid these foods." | No |
| | Fixed order: **Day 31 added sugar (optional) → Day 34 legumes → Day 37 non-gluten grains → Day 40 dairy → Day 43 gluten grains → Day 46 alcohol (optional)**. Rationale for the gap is stated plainly: "If you bring back pizza, beer, and ice cream all in the same meal, how will you know which food to blame…" | | | | | | |
| **AIP reintroduction** | Full AIP elimination | Single food, **4 core stages** (Stage 1 egg yolks/legumes/spices → … → grains, full legumes); a Modified 2-stage path also exists | **Explicit within-day dose ladder:** "Start with ½ teaspoon. Wait 15 minutes. → 1 teaspoon. Wait 15 minutes. → 1–1½ tablespoons. **Observe for 2–3 hours.** → normal portion." | AIP background | **Wait 3–7 days before testing another food** (reactions may take 1–3 days to surface) | Pass = no symptoms in the observation window or the following days. Fail = any symptom (digestive, pain, skin, mood, brain fog, sleep). **Ambiguous → remove the food, return to baseline, retest after ≥2 weeks.** | No |
| **Ayble Health** | ML-selected elimination diet, user-chosen program length (e.g. 4 months) | Not publicly specified | Not publicly specified | — | Not specified | Not specified; symptom improvement tracked in app | No |

Sources: [Monash Step 1–3](https://www.monashfodmap.com/ibs-central/i-have-ibs/starting-the-low-fodmap-diet/), [Monash practical tips](https://www.monashfodmap.com/blog/practical-tips-fodmap-reintroduction/), [Monash interpreting challenges](https://www.monashfodmap.com/blog/interpreting-reintroduction-challenges/), [Monash diary function](https://www.monashfodmap.com/blog/reintroduction-using-diary-function/), [ACG EBGI summary of Gastroenterology 2024](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/), [Skodje, Gastroenterology 2018](https://www.gastrojournal.org/article/S0016-5085(17)36302-3/fulltext), [F1000Research NCGS review](https://f1000research.com/articles/7-1631/v1), [Whole30 reintroduction](https://whole30.com/reintroduction/), [AIP reintroduction guide](https://theautoimmuneprotocol.com/aip-reintroduction-phase-guide/)

**The comparison that matters for FoodTrack:** the *only* protocol in this table with a quantitative, pre-specified decision rule (IBS-SSS Δ>50) and a placebo arm is the research protocol. Every consumer protocol (Monash, Whole30, AIP, Ayble) uses **open, unblinded, single-exposure, qualitative judgement** — and the blinded data show that judgement is wrong a large fraction of the time (see next section). Note also that consumer washouts (Monash 2–3 d, AIP 3–7 d, Whole30 2–3 d) are *shorter* than the research washout that was extended until symptoms resolved (Skodje ≥7 d).

---

### Methodology checklist — what a rigorous N-of-1 diet trial requires

Derived from **CENT 2015** (Vohra et al., *BMJ* 2015;350:h1738, PMID 25976398), **SPENT 2019** (the SPIRIT protocol extension, *BMJ* 2020;368:m122), **SCRIBE 2016** (26 items), and the empirical literature. Structure and scope are verified; the verbatim wording of all 44 CENT sub-items in Table 1 could not be extracted (BMJ tables render as popups; PubMed/PMC served reCAPTCHA) — **CENT item-level wording is UNVERIFIED**, but SPENT is its protocol-side twin and *was* extracted in full.

**A. Terminology FoodTrack must adopt (CENT canonical definitions)**
1. **N-of-1 trial** = "an experimental clinical study design to determine the effect of an intervention in a single study participant," using repeated challenge–withdrawal (ABAB) sequences with multiple crossovers.
2. **Period** = "the time during which a single treatment (A or B) is administered. Period length is typically determined a priori and may vary within a trial."
3. **Block / pair** = the repeated unit of periods (pair = 2 periods; block = more). **Cycle** = each iteration of a block. **Sequence** = the entire set of consecutive blocks.
4. **Washout period** = "a period in which no intervention is administered. A washout may be administered between different treatment periods **or may act as a period itself**."
5. **Run-in period** = pre-trial duration to establish stable baseline/dosing or assess compliance.
→ *Audit: does FoodTrack's data model have first-class objects for period, block, cycle, sequence, washout and run-in — or does it only have "phases"?* (CENT: [bmj.com/content/350/bmj.h1738](https://www.bmj.com/content/350/bmj.h1738); SPENT: [bmj.com/content/368/bmj.m122](https://www.bmj.com/content/368/bmj.m122))

**B. Pre-registration (SPENT 2019 — directly applicable to "immutable pre-registration")**
6. **Title must contain "n-of-1 trial" and "protocol"** (SPENT 1a); for a series, "a series of n-of-1 trials."
7. **Structured abstract** required (SPENT 1b) — new for N-of-1 protocols.
8. **Rationale for using an N-of-1 design specifically** (SPENT 6a), not just for the intervention.
9. **Trial design declared** as n-of-1 or series, with allocation ratio and framework (superiority / equivalence / non-inferiority / exploratory) (SPENT 8). For a series, state whether design will be tailored per participant.
10. **Interventions specified per period** with enough detail to replicate — "how and when they will be administered, **planned number of periods and crossovers, and duration of each period (including run-in and washout details)**" (SPENT 11a).
11. **Randomisation method pre-specified** (SPENT 16a): "computer-generated random numbers, counterbalancing," with restrictions (pairs, blocking) documented in **a separate document unavailable to whoever assigns interventions** — i.e. allocation concealment applies even in self-experiments.
12. **Sample size = number of periods AND number of measurements within each period**, with the clinical and statistical assumptions stated (SPENT 14). **Minimum three cycles; four or more preferred.**
13. **Individual stopping criteria** (SPENT 11b) and, for a series, **pre-planned conditions for terminating the whole series** (SPENT 21b), stated separately.
14. **Safety monitoring plan documented** even where a formal DSMB is disproportionate (SPENT 21a).

**C. Design integrity**
15. **Randomise or counterbalance the order of challenges — always.** Fixed-order challenge (Monash, Whole30, AIP all use fixed order) confounds food effect with time, season, regression to the mean, and healing trajectory. The health-psychology systematic review's first recommendation is mandatory randomisation or counterbalancing. ([Ann Behav Med 2018;52(9):731](https://academic.oup.com/abm/article/52/9/731/4837296))
16. **Use optimal sequences, not arbitrary ones.** For 2 treatments: **ABBA** is universally optimal at 4 periods, **ABBAAB** at 6, **ABBAABBA** at 8; the general rule is "alternate between AB and BA pairs in sequence," maximising alternation (h = −1). For >2 treatments the optimal sequence length is **p = t² + 1** (10 periods for 3 treatments, 17 for 4, 26 for 5). ([IntechOpen ch. 83034](https://www.intechopen.com/chapters/83034))
17. **Washout must be justified, not guessed**, and either physical (no treatment) or **analytic** (discard outcomes at the start of each crossover period). The Bayesian methods literature names both as legitimate. ([HDSR](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1))
18. **Carryover is not estimable from a single N-of-1 trial with few crossovers** — it is "difficult to estimate" and the methods literature defers it to the aggregation stage. So a single-user verdict must either use a generous washout or explicitly declare carryover unestimated. ([HDSR](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1))
19. **Measurement frequency must match the intervention's onset/offset kinetics and the period length** (SPENT 12/13); outcome instruments must be able to detect **within-individual** change across repeated occasions.
20. **Use a validated repeated measure with a pre-specified threshold.** Precedent: **IBS-SSS with Δ>50 points** vs the elimination-phase mean as the trigger definition ([Gastroenterology 2024 via ACG](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/)); **GSRS-IBS** ([Skodje](https://www.gastrojournal.org/article/S0016-5085(17)36302-3/fulltext)).
21. **Procedural fidelity must be measured and reported per phase** (SCRIBE item 17) — in a diet trial this means adherence verification, not just self-attestation.

**D. Analysis**
22. **Model within-person dependence explicitly.** Options: **AR(1) autocorrelated errors** or **autocorrelated outcomes** (current outcome depends on prior measurement). SPENT item **20a2** makes this mandatory: "statistical methods to account for correlation, and carryover, period, or sequence effects introduced by the repeated measures and crossover design."
23. **Model trend and period effects**: linear trend term; or period-specific step functions; or sinusoidal/spline for cyclical patterns; or "start from a new baseline in each period." ([HDSR](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1))
24. **Bayesian verdicts should be posterior probabilities of a *clinically meaningful* difference**, not just P(effect>0): "the probability … that one treatment is better than another **by a certain amount**," with a pre-specified required posterior probability. Report point estimate (posterior mean/median/mode) plus **central credible interval** (2.5/97.5 percentiles).
25. **Priors must be declared and their sensitivity acknowledged.** Non-informative priors should be **bounded to exclude implausible values** (PRODUCE used Uniform(34,78) for treatment means on a 0–100 pain scale). Critically: "posterior inferences tend to be most sensitive to choice of the **prior for the variance**."
26. **Handle missing data as parameters.** Bayesian multiple imputation is natural (missing values are model parameters, MCMC samples from their posterior). But if dropout is symptom-driven the data are **MNAR** and MAR imputation is biased — PRODUCE built an imputation model dependent on **time of dropout**. This matters enormously for FoodTrack: people stop logging *because* they feel bad.
27. **Report MCMC convergence diagnostics and Monte Carlo sample sufficiency** — extreme quantiles need more draws than means.
28. **For aggregation across users**, use a hierarchical/multilevel model (individual level + group level) with exchangeable individual effects. Understand shrinkage behaviour: "the resulting posterior is shrunk toward … the common distribution if the individual-level data are imprecise or if the individual effects are homogeneous," and *not* shrunk when an individual's data are precise or the population is heterogeneous. Decide and document the **fixed vs random intercepts** question (a "long-standing controversy"). Existing implementation: **`nof1ins` R package** ([github.com/jiabei-yang/nof1ins](https://github.com/jiabei-yang/nof1ins)).
29. **SPENT 20a1**: pre-specify statistical methods **for each individual**, and for a series, the method of quantitative synthesis **and how between-participant heterogeneity will be assessed**.

**E. Reporting (what a FoodTrack "verdict report" must contain)**
30. **State the design type, the phases, the phase sequence (predetermined or data-driven), and phase-change criteria** (SCRIBE 5).
31. **Report any procedural changes made after the study started** (SCRIBE 6) and **any planned replication** (SCRIBE 7).
32. **State whether randomisation was used, the method, and exactly which elements were randomised** (SCRIBE 8).
33. **State whether blinding/masking was used and who was blinded** (SCRIBE 9).
34. **Report the sequence actually completed**, including counts per session; if incomplete, **when and why the participant stopped** (SCRIBE 19).
35. **Report raw data for each target outcome, per participant** (SCRIBE 20) — CENT likewise requires individual data presentation with visual diagrams.
36. **Report adverse events and the phase in which they occurred** (SCRIBE 21). CENT flags **primary outcome identification** and **adverse event reporting** as items frequently missing from published N-of-1 reports.
37. **State where the protocol can be accessed** (SCRIBE 25) — the pre-registration link.
38. **Justify all analysis methods** (SCRIBE 18); a verdict from an unjustified method fails the checklist.

SCRIBE items: [Phys Ther 2016;96(7):e1](https://academic.oup.com/ptj/article/96/7/e1/2864911) (scope: withdrawal/reversal, multiple-baseline, alternating-treatments, changing-criterion designs).

**F. The empirical baseline FoodTrack would be beating.** In 54 published N-of-1 randomised intervention trials (1,193 participants) in health psychology: **<50% reported washout or run-in**; **only 15% reported any power/sample-size determination**; **<20% reported methods accounting for carryover**; **<40% gave enough information to compute heterogeneity of treatment effects**; analysis was **t-tests 43%, non-parametric 19%, ANOVA 13%, Bayesian 9%, mixed-effects 7%, graphical only 22%**; **79% used an a priori statistical cutoff**. Typical periods were 1–2 weeks; typical washouts 1–2 days to 1 week. Of the 9 trials (105 participants) that reported downstream decisions, 67% took the identified superior treatment, 22% took something else, **11% were ambiguous**. ([Ann Behav Med 2018](https://academic.oup.com/abm/article/52/9/731/4837296))

---

### Blinding & placebo — what's feasible for a self-administered food trial

**Is blinding feasible? Yes — three working precedents, in ascending order of difficulty.**

1. **Powder-in-water (highest fidelity, works for isolated FODMAPs and sugars).** The 2024 blinded reintroduction trial delivered all seven agents — fructans, fructose, GOS, lactose, mannitol, sorbitol, **and a glucose control** — as indistinguishable powders dissolved in water, taken 3×/day with meals for 7 days, with a 2-day washout. This is directly reproducible as a mail-order kit. ([ACG EBGI](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/))
2. **Concealment in a food matrix (works for gluten, fructans).** Skodje concealed gluten 5.7 g and fructan 2.1 g in **muesli bars**, 7 days per arm. ([Gastroenterology 2018](https://www.gastrojournal.org/article/S0016-5085(17)36302-3/fulltext))
3. **Participant-executed self-blinding (works with no supply chain at all).** The eLife self-blinding citizen-science protocol is the single most transferable design for FoodTrack. Participants: (a) filled **opaque gel capsules**, half with the substance, half empty; (b) assembled them into **weekly packages with day labels**; (c) sealed each week into an **envelope carrying a unique QR code**; (d) **drew 4 of 8 envelopes** using QR codes + random number generation, under a constraint that yields three possible allocations (4 placebo weeks / 2+2 / 4 active weeks, each with 1/3 probability); (e) the **QR decryption key stayed with the researchers**, so the participant could not know the assignment but the analyst could reconstruct it exactly. Documented procedural error rate: **1.3%** (three participants followed an invalid sequence). Cost: **~0.5–1% of an equivalent clinical study**. The authors explicitly recommend the method as "a cost-efficient screening tool prior to conducting expensive clinical studies," naming **CBD oils, nootropics, and nutritional supplements** as target domains "where social-pressure, expectancy, positive-test strategies, and confirmation bias can lead to false-positive findings." ([eLife 2021;10:e62878](https://elifesciences.org/articles/62878))

**What is NOT feasible:** blinding whole foods. Nobody blinds an apple. Blinding works for isolated fermentable carbohydrates, proteins (gluten), sugars (lactose, fructose), polyols and supplements — i.e. exactly the FODMAP subgroup structure. Whole-food challenges (Monash's "food rich in only 1 FODMAP group," Whole30 groups, AIP stages) are irreducibly open-label.

**Why this is not optional — the size of the expectation effect in diet trials:**

- **Skodje:** among 59 self-diagnosed gluten-sensitive people, when blinded, **22% (13/59) peaked on gluten, 41% (24/59) peaked on fructan, and 37% (22/59) peaked on placebo.** Roughly two in five people's worst week was the sham week.
- **NCGS pooled DBPC challenges:** across **10 trials, 1,312 adults**, only **16% showed gluten-specific symptom responses** and **40% of responders exhibited nocebo effects.** ([F1000Research 2018;7:1631](https://f1000research.com/articles/7-1631/v1))
- **Blinded FODMAP reintroduction:** the **glucose control powder triggered a >50-point IBS-SSS rise in 26% of participants** — a quarter of "confirmed triggers" would be false positives under an open protocol with the same threshold. ([ACG EBGI](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/))
- **Unblinding is dose-dependent and must be measured.** In the self-blinding study, overall break-blind was **0.72 ± 0.18** against a random-guesser baseline of 0.62; specificity for placebo 0.82, sensitivity for active 0.45. Critically, when **guess** was entered into the models, between-group differences vanished — but when **actual condition** was held fixed, **21 of 22 comparisons differed by guess**. Belief, not substance, drove the effect. The lesson for FoodTrack: **always ask the user to guess which arm they were in, and always analyse by guess as well as by allocation.** ([eLife](https://elifesciences.org/articles/62878))

**Practical design implication.** A defensible FoodTrack blinded challenge = isolated-compound sachets (or self-filled capsules) + a matched inert control (glucose or empty capsule) + envelope/QR allocation with the key held server-side + a mandatory post-period blinding-guess question + analysis stratified by guess. Everything else — whole-food challenges — should be labelled in-product as **open-label / hypothesis-generating, not confirmatory.**

---

### Adherence findings — what makes people quit, what counters it

**Baseline attrition rates you should plan against (all verified):**

| Setting | Funnel | Source |
|---|---|---|
| Remote digital health studies (8 studies, ~100,000 participants) | **Median retention 5.5 days** overall (range 2–26 days by study). **>50% discontinued within the first week.** Median **54.6%** were "abandoners" with **1 day** of app usage. **Only ~1 in 10** were dedicated/frequent users. | [npj Digital Medicine 2020](https://www.nature.com/articles/s41746-020-0224-8) |
| Self-blinding citizen science (microdosing) | **1,630 signed up → 240 started → 191 completed week 5 → 159 completed week 9.** That's an **~85% signup→start drop**, then good retention among starters. Completion was statistically identical across allocation groups (p=0.99). | [eLife 2021](https://elifesciences.org/articles/62878) |
| iMTracker N-of-1 symptom-trigger app | 180 recruited → **103 (57.2%) completed follow-up**; **70.9% of those** used it for the full planned 3 months; among completers only **2.9%** missed >50% of days and **21.4%** missed <5% of days. | [PMC9044158](https://pmc.ncbi.nlm.nih.gov/articles/PMC9044158/) |
| Mahana IBS (prescription DTx, real-world) | **38% (343/843) completed half the sessions.** Older age predicted completion. | [Gastro & Hep 2025](https://www.gastroenterologyandhepatology.net/archives/may-2025/the-promise-of-digital-therapeutics-for-disorders-of-gut-brain-interaction/) |
| PRODUCE (N-of-1-style diet crossover, paediatric IBD) | Of 54 randomised: **21 completed all four periods, 9 completed early after one crossover, 24 withdrew during period 1 or 2** — i.e. **44% withdrew before the second crossover**, in a supervised research study with 8-week diet periods. | [HDSR](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1) |
| Oshi Health (human clinic, comparison point) | **80% retention** over a 9-month program, average **10+ clinician visits**. | [oshihealth.com](https://oshihealth.com/newsroom/press-releases/clinical-trial-demonstrates-oshi-improves-patient-outcomes/) |

**What counters it — effect sizes, ranked (npj Digital Medicine, n≈100k):**
1. **Clinician referral: +40 days median retention** (4 days → 44 days). The authors call it "the largest impact on participant retention (>10 times)" in their sample. **This is by far the strongest lever known, and it is a distribution decision, not a product decision.**
2. **Monetary compensation: +22 days.**
3. **Actually having the target clinical condition: +7 days** vs healthy controls. (Good news for FoodTrack — its users are symptomatic.)
4. **Age 60+: +4 days** (7 days vs 2–3 for younger).
5. Recommended structural fixes: **flexible run-in periods**, compensation models, clinician partnerships.

**Design-side levers with direct evidence:**
- **Shorter trials.** The caffeine/L-theanine protocol randomised **5 vs 15 vs 27 days** and concluded 15 days is "a good balance" between statistical power and dropout risk. The optimal-design literature makes the same trade-off explicit: the "longer the period … more expensive and higher risk of drop-outs." So: buy your cycles with *more, shorter* periods, not longer ones. ([Frontiers](https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2020.00004/full), [IntechOpen](https://www.intechopen.com/chapters/83034))
- **Pre-declare a completion floor rather than treating every dropout as failure.** The caffeine protocol required **≥1/3 of treatments per period** for a period to count.
- **Randomise notification intensity and measure it.** Both the caffeine protocol and the Brain Boost study randomise **notification level** alongside study duration as a retention factor. (Brain Boost is a *protocol*; results **UNVERIFIED** — page returned no content. [researchprotocols.org/2020/1/e16362](https://www.researchprotocols.org/2020/1/e16362))
- **Community and peer visibility.** The personal-science interview study found "learning through community" and the "double-sided factor of sharing and learning" to be a primary sustaining motivation, alongside intrinsic enjoyment of the research act; **career/publication incentives barely mattered**. ([Nature HSSC 2022](https://www.nature.com/articles/s41599-022-01199-0))
- **Protocols, not vibes.** The same study named the absence of shared, formalised protocols as a core barrier: "sharing of self-research practices happens largely in unstructured ways, with a lack of clear protocols." A product that *supplies* the protocol removes a documented failure cause.

**The specific FoodTrack failure mode to watch:** iMTracker users completed the trial and then reported **increased concerns about the app's effectiveness** — completion without perceived benefit. Finishing an N-of-1 trial that returns "no detectable effect" is a demotivating experience unless the product frames a null result as a win (a food ruled back *in*). Also note the eLife funnel: the attrition wasn't during the trial, it was **between signup and starting** (1,630 → 240) — the setup burden (filling capsules, assembling envelopes) is where people are lost. Every step of kit assembly is a churn point.

---

### Ranked gap candidates for FoodTrack

Ranked by (validity impact × differentiation), cost = engineering/ops effort.

**1 · Blinded or self-blinded challenge delivery — the whole thesis rests on it. Cost: M (self-blinding kit) / L (fulfilled sachets)**
Exemplar: [eLife 2021;10:e62878](https://elifesciences.org/articles/62878) (envelope + QR + capsule self-blinding, 1.3% error rate, 0.5–1% of clinical-study cost); [Gastroenterology 2024 via ACG](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/) (7 blinded powders + glucose control); [Skodje 2018](https://www.gastrojournal.org/article/S0016-5085(17)36302-3/fulltext) (muesli-bar concealment).
Rationale: **26% of people react to a glucose placebo at FoodTrack's likely threshold**; **37% of self-diagnosed gluten-sensitives peak on placebo**; **40% of NCGS "responders" are nocebo**. No competitor — not Monash, not Whole30, not AIP, not Ayble — blinds anything. Blinding is simultaneously the largest validity gap in the category and the clearest product differentiator. The self-blinding protocol proves it can be done by ordinary people at home with a key held server-side.

**2 · Immutable pre-registration with a machine-executable decision rule. Cost: S–M**
Exemplar: [SPENT 2019](https://www.bmj.com/content/368/bmj.m122) items 1a (title must say "n-of-1 trial" + "protocol"), 8, 11a, 11b, 14, 16a, 20a1, 20a2, 21b; SCRIBE items 6 (post-hoc procedural changes must be reported) and 25 (protocol accessible).
Rationale: FoodTrack's differentiator is that the verdict is computed by a rule fixed *before* the data existed. Make the pre-registration a signed, hash-chained object containing: hypothesis, challenge agent + dose ladder, period/block structure, randomisation seed and restrictions, outcome instrument, **the threshold**, the posterior-probability bar, individual stopping criteria, and the analysis model. Then compute the verdict **only** from that object. Any deviation must surface in the report as a deviation (SCRIBE 6). SPENT 16a even requires allocation restrictions to live in "a separate document unavailable to those who … assign interventions" — i.e. don't show the user the block structure.

**3 · Period/block architecture with randomised, optimal sequences instead of fixed-order challenges. Cost: S**
Exemplar: [IntechOpen ch. 83034](https://www.intechopen.com/chapters/83034) — ABBA (4 periods), ABBAAB (6), ABBAABBA (8), "alternate between AB and BA pairs," p = t²+1 for >2 treatments; [SPENT 14](https://www.bmj.com/content/368/bmj.m122) — **minimum 3 cycles, 4+ preferred**; [StudyMe](https://link.springer.com/article/10.1186/s13063-022-06893-7) — ABAB default, ABBA option, 7-day phases.
Rationale: every consumer elimination protocol uses fixed order (Monash: sequential subgroups; Whole30: sugar→legumes→grains→dairy→gluten; AIP: Stage 1→4). Fixed order confounds the food with time and with the natural healing trajectory after elimination. Randomising order and using a counterbalanced optimal sequence is cheap and immediately makes FoodTrack's output categorically stronger than the incumbents'.

**4 · Explicit washout model — physical and analytic — with per-agent justification. Cost: M**
Exemplar: [HDSR Bayesian models](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1) (physical vs **analytic washout** = "outcomes at the beginning of crossover periods are disregarded"); [SPENT 11a](https://www.bmj.com/content/368/bmj.m122); washout precedents: Monash **2–3 days or until symptoms settle**, Gastro 2024 **2 days**, Skodje **≥7 days extended until resolution**, AIP **3–7 days**, Whole30 **2–3 days**.
Rationale: consumer washouts (2–3 days) are shorter than research washouts (7+, symptom-gated). FoodTrack should implement **symptom-gated washout** (don't start the next period until the outcome returns within X of the elimination baseline) *plus* **analytic washout** (discard the first k days of each period from the likelihood) — and report both. This is a concrete, defensible feature no competitor has.

**5 · Bayesian per-person verdict with AR(1), trend and period terms, reported as posterior probability of a clinically meaningful effect. Cost: M–L**
Exemplar: [HDSR](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1) — AR(1) on errors or outcomes, linear/step/spline trend, bounded non-informative priors, posterior probability "better … by a certain amount," 2.5/97.5 credible intervals, MCMC convergence diagnostics; reference implementation **`nof1ins`** ([github](https://github.com/jiabei-yang/nof1ins)).
Rationale: the empirical baseline is dismal — **43% of published N-of-1 trials used t-tests, 22% used graphs only, 9% used Bayesian methods**, and **<20% handled carryover** ([Ann Behav Med 2018](https://academic.oup.com/abm/article/52/9/731/4837296)). A daily symptom series is autocorrelated by construction; ignoring it inflates certainty. Ship: posterior P(effect > MCID), a credible interval, and a **"no meaningful effect" verdict** (a ROPE-style region) so a null is a first-class, celebratable outcome — which also addresses the iMTracker demotivation finding.

**6 · Treat the association-mining step as *screening only*, with explicit multiplicity handling and a stated false-positive expectation. Cost: S–M**
Exemplar: [iMTracker](https://pmc.ncbi.nlm.nih.gov/articles/PMC9044158/) (phi statistic, daily and 1-day lag, on device); [Gastro & Hep 2025](https://www.gastroenterologyandhepatology.net/archives/may-2025/the-promise-of-digital-therapeutics-for-disorders-of-gut-brain-interaction/) warning that apps produce "so much data … it can be difficult for both the patient and the provider to sort out what is important."
Rationale: FoodTrack's stage 1 tests hundreds of food×symptom pairs against an autocorrelated series; without multiplicity control it manufactures hypotheses. Explicitly label stage-1 output "candidate — not a finding," cap the number promoted to trial, and show the expected false-discovery count. This *is* the product's honesty story, and it's also the funnel into stage 2.

**7 · Engineered adherence: short first trial, clinician referral path, completion floor, tuned notifications. Cost: M**
Exemplar: [npj Digital Medicine 2020](https://www.nature.com/articles/s41746-020-0224-8) — **clinician referral +40 days** (4→44), **compensation +22 days**, having the condition +7, age 60+ +4, median retention 5.5 days, >50% gone in week 1; [Frontiers caffeine protocol](https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2020.00004/full) — 15 days as the power/dropout sweet spot, ≥1/3 completion floor per period; [Mahana 38% completion](https://www.gastroenterologyandhepatology.net/archives/may-2025/the-promise-of-digital-therapeutics-for-disorders-of-gut-brain-interaction/).
Rationale: the single largest retention lever discovered at scale is *not in the app* — it's who refers the user. Build a dietitian/GI referral surface early. Product-side: make trial #1 short enough to finish (~2 weeks, 4 periods of 3–4 days for a fast-onset agent), define a per-period completion floor so a missed day isn't experienced as failure, and A/B notification intensity as a measured variable.

**8 · Auto-generated CENT/SCRIBE-conformant trial report. Cost: S–M**
Exemplar: [SCRIBE 2016](https://academic.oup.com/ptj/article/96/7/e1/2864911) items 5, 6, 8, 9, 17, 19, 20, 21, 25; [CENT](https://www.bmj.com/content/350/bmj.h1738), which specifically flags primary-outcome identification, adverse events, and **individual data presentation with visual diagrams** as commonly missing.
Rationale: a one-click, per-trial PDF containing design + sequence actually completed + **raw per-period data** + protocol deviations + adverse events + link to the frozen pre-registration is (a) the artefact a user hands their GI/dietitian, (b) the thing that makes clinician referral (gap 7) possible, and (c) a checklist FoodTrack can literally be audited against. No competitor produces anything like it.

**9 · Escalating dose ladder with pre-specified stopping and safety gates. Cost: S–M**
Exemplar: [AIP ladder](https://theautoimmuneprotocol.com/aip-reintroduction-phase-guide/) — "½ tsp → wait 15 min → 1 tsp → wait 15 min → 1–1½ tbsp → observe 2–3 hours → normal portion"; [Monash](https://www.monashfodmap.com/blog/practical-tips-fodmap-reintroduction/) — amber → high → red across days 1–3; [Gastro 2024 doses](https://gi.org/journals-publications/ebgi/schoenfeld_nov2024/) — fructan 20 g, fructose 60 g, GOS 12 g, lactose 60 g, mannitol 15 g, sorbitol 15 g/day; [SPENT 11b/21b](https://www.bmj.com/content/368/bmj.m122) — individual stopping criteria separate from series-termination criteria.
Rationale: escalation is FoodTrack's stated design and it's well-precedented, but it creates a statistical problem nobody in the consumer space has solved: **dose is confounded with time within a period**. Either model dose as a covariate or randomise dose order across cycles. Add hard safety gates: IgE-allergy exclusion, eating-disorder screening, nutritional-adequacy monitoring during prolonged elimination (Monash requires dietitian supervision precisely for this).

**10 · Blinding-guess capture and guess-stratified analysis. Cost: S**
Exemplar: [eLife 2021](https://elifesciences.org/articles/62878) — break-blind rate 0.72 vs 0.62 chance; adding "guess" to models erased condition effects, while holding condition fixed showed **21 of 22 comparisons differed by guess**; 86% said they were thinking about which arm they were in before being asked.
Rationale: trivially cheap, and it converts an unmeasurable weakness into a reported quantity. Ask "which do you think you got?" at the end of every period; report the break-blind rate on the trial report; run the primary analysis by allocation and a sensitivity analysis by guess. If they diverge, say so.

**11 · Follow-up and re-test scheduling (tolerance is not permanent). Cost: S**
Exemplar: [Monash Step 3](https://www.monashfodmap.com/ibs-central/i-have-ibs/starting-the-low-fodmap-diet/) — "retesting poorly tolerated foods periodically to assess whether tolerance changes"; [AIP](https://theautoimmuneprotocol.com/aip-reintroduction-phase-guide/) — ambiguous result → return to baseline, retest after **≥2 weeks**; [SCRIBE 7](https://academic.oup.com/ptj/article/96/7/e1/2864911) — report any planned replication.
Rationale: FoodTrack's follow-up phase maps cleanly onto SCRIBE's replication item and onto Monash Step 3. Schedule automatic re-challenge of "fail" verdicts after N months, and treat replication as evidence accumulation in the Bayesian model (the previous posterior becomes the prior). This is a retention mechanic *and* a validity mechanic — rare combination.

**12 · Opt-in aggregation into a hierarchical model across users. Cost: L**
Exemplar: [HDSR](https://hdsr.mitpress.mit.edu/pub/b6efwlql/release/1) — multilevel individual/group model, exchangeability, shrinkage behaviour, fixed-vs-random intercept decision, **carryover only becomes estimable when trials are aggregated**; [SPENT 20a1](https://www.bmj.com/content/368/bmj.m122) — for a series, pre-specify synthesis method and heterogeneity assessment; [ICN](https://www.nof1sced.org/) as a publication/credibility channel.
Rationale: this is the long-term moat and the thing that turns a self-hosted app into a research contribution — and it's the *only* way to estimate carryover, which cannot be identified from one person's trial. It also lets a new user's first trial start from an informative prior. Ranked lower only because it requires scale, a governance model, and consent architecture before it pays off.

**13 · Data-ownership and safety governance, stated Nightscout-style. Cost: S**
Exemplar: [Nightscout](http://www.nightscout.info/) — "There is no support or any warranty of any kind," "do not rely on this for therapy," and the explicit warning that anyone with the URL can read the data; [OpenAPS](https://openaps.org/what-is-openaps/) — safety-focused **reference design** published alongside the implementation, offered to researchers and manufacturers.
Rationale: FoodTrack is self-hosted health software making health inferences. The two most successful self-hosted health communities both succeeded partly *because* they were unusually explicit about failure modes. Publish a reference design for the trial protocol separately from the code — it invites scrutiny, enables clinician trust, and is the cheapest credibility purchase available.

**14 · Human-in-the-loop interpretation. Cost: L**
Exemplar: [Monash](https://www.monashfodmap.com/ibs-central/i-have-ibs/starting-the-low-fodmap-diet/) — "A FODMAP diet should be followed under the guidance of a dietitian who has specialty skills in managing IBS" (30-hour certification, maintained directory); [Oshi](https://oshihealth.com/newsroom/press-releases/clinical-trial-demonstrates-oshi-improves-patient-outcomes/) — 93% dietitian, 76% GI psychologist, **80% retention**; [personal-science interviews](https://www.nature.com/articles/s41599-022-01199-0) — self-researchers report being dismissed by clinicians.
Rationale: the single best-retaining product in this landscape (Oshi, 80% over 9 months) is the one with humans in it, and the only elimination protocol with an official evidence base (Monash) mandates a dietitian. FoodTrack doesn't need to hire clinicians — but gap 8 (the conformant report) plus gap 7 (referral path) is the cheap version of this, and should be built first.

---

**Access limitations encountered (for transparency, not a block):** PubMed and PubMed Central consistently served Google reCAPTCHA rather than content; Elsevier properties (ScienceDirect, gastrojournal, cghjournal, jclinepi) and Wiley returned 403; LWW returned 402; jmir.org and researchprotocols.org returned empty bodies. europepmc.org is robots-disallowed and its REST API returned HTTP 429. Everything above was verified from pages that did fetch. **Explicitly UNVERIFIED:** the verbatim wording of CENT 2015's 44 sub-items (Table 1 renders as a popup; structure and definitions were verified from the BMJ text); Ayble's peer-reviewed trial details (PMID 36322404); StudyU's JMIR architecture paper specifics beyond the HPI/GitHub pages; the Brain Boost study's results; Punja's aggregated-N-of-1 meta-analysis figures; and the pooled placebo-response rate in IBS pharmacological trials (diet-specific nocebo figures were verified instead and are the more relevant numbers).
agentId: a302f70c14c3951e3 (use SendMessage with to: 'a302f70c14c3951e3', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 154928
tool_uses: 112
duration_ms: 1073192</usage>
