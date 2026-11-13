# FoodTrack — Data Model & Tracker Engine

Version 1.3 · Postgres 18 · 2026-08-21

---

## 1. The central idea

There are exactly **two** kinds of thing in this system:

1. **Definitions** — what *can* be recorded. Loaded from config, versioned, not user data.
2. **Observations** — what *was* recorded. Immutable-ish, append-friendly, always tied to a definition version.

Everything else (meals, stools, symptoms, weight, moods, meds) is a special case of an observation. Meals get one extra table because they decompose into items; nothing else does.

```
tracker_definition (config)  ──┐
                               ├──►  observation  ──►  observation_value (EAV, typed)
user ──────────────────────────┘         │
                                         └──► meal_item ──► food (canonical) ──► food_nutrient
```

**Why EAV and not a column per tracker:** the whole point of D7 is that a new tracker needs no migration. A typed EAV table with a JSONB fallback gives that, and at personal-tracking volumes (a few thousand rows a year per user) the performance cost is irrelevant. We recover query ergonomics with materialised daily-rollup views.

---

## 2. Tracker definition format

A tracker is a JSON file in `config/trackers/*.json`, validated against a meta-schema at startup.

```jsonc
{
  "key": "stool",                       // stable, unique, snake_case. Never change.
  "version": 3,                          // bump on any breaking field change
  "category": "gut",
  "icon": "poop",
  "cardinality": "many_per_day",         // one_per_day | many_per_day | occasional
  "quick_log": {                         // defines the fastest possible path
    "enabled": true,
    "primary_field": "bristol",          // tapping a value here saves immediately
    "home_shortcut": true
  },
  "labels": {
    "en": { "name": "Bowel movement", "short": "Stool" },
    "he": { "name": "יציאה", "short": "יציאה" }
  },
  "fields": [
    {
      "key": "bristol",
      "type": "enum",
      "required": true,
      "options": [
        { "value": 1, "labels": { "en": "Separate hard lumps", "he": "גושים קשים נפרדים" }, "illustration": "bristol-1" },
        { "value": 2, "labels": { "en": "Lumpy sausage",       "he": "נקניק גושי" },        "illustration": "bristol-2" },
        { "value": 3, "labels": { "en": "Cracked sausage",     "he": "נקניק סדוק" },        "illustration": "bristol-3" },
        { "value": 4, "labels": { "en": "Smooth sausage",      "he": "נקניק חלק" },         "illustration": "bristol-4" },
        { "value": 5, "labels": { "en": "Soft blobs",          "he": "גושים רכים" },        "illustration": "bristol-5" },
        { "value": 6, "labels": { "en": "Mushy, ragged edges", "he": "דייסתי" },            "illustration": "bristol-6" },
        { "value": 7, "labels": { "en": "Entirely liquid",     "he": "נוזלי לגמרי" },       "illustration": "bristol-7" }
      ],
      "analysis": {
        "role": "outcome",
        "normal_range": [3, 5],
        "abnormal_high": [6, 7],
        "abnormal_low": [1, 2]
      }
    },
    { "key": "urgency",      "type": "scale",   "min": 0, "max": 4, "required": false },
    { "key": "complete",     "type": "boolean", "required": false },
    { "key": "pain",         "type": "scale",   "min": 0, "max": 10, "required": false },
    { "key": "blood",        "type": "boolean", "required": false, "safety_flag": "red_flag_blood" },
    { "key": "mucus",        "type": "boolean", "required": false },
    { "key": "colour",       "type": "enum",    "options": ["brown","dark","black","pale","green","red"],
                             "safety_flag_map": { "black": "red_flag_melena", "red": "red_flag_blood" } },
    { "key": "note",         "type": "text",    "max_length": 500 }
  ],
  "aggregation": {
    "daily": [
      { "key": "count",          "op": "count" },
      { "key": "bristol_mean",   "op": "mean",   "field": "bristol" },
      { "key": "bristol_worst",  "op": "max_abs_deviation_from", "field": "bristol", "center": 4 },
      { "key": "any_abnormal",   "op": "any",    "field": "bristol", "in": [1,2,6,7] }
    ]
  },
  "charts": [
    { "type": "distribution", "field": "bristol", "bins": 7 },
    { "type": "timeline_band", "field": "bristol", "good_range": [3,5] }
  ]
}
```

### 2.1 Field type catalogue

| Type | Storage | Renderer | Aggregations |
|---|---|---|---|
| `scale` | `value_num` | Segmented tap row (never a drag slider — drag is slow and imprecise on mobile) | mean, max, sum, auc |
| `enum` | `value_num` or `value_text` | Illustrated tile grid or chip row | mode, count-in-set, any |
| `multi_enum` | `value_json` (array) | Multi-select chips | count, any, jaccard |
| `number` | `value_num` + `unit` | Stepper + keypad | mean, sum, min, max, ewma |
| `duration` | `value_num` (seconds) | Duration wheel | sum, mean |
| `text` | `value_text` | Auto-growing textarea | none (LLM-summarised only) |
| `boolean` | `value_bool` | Toggle chip | any, count, rate |
| `photo` | `value_media_id` | Camera/gallery sheet | count |
| `time` | `value_ts` | Time picker | — |
| `body_map` | `value_json` | Tappable abdomen SVG, 9 regions | region frequency |

### 2.2 The `analysis` block

Every field may declare its role in the analysis engine. This is what lets a *new* tracker automatically participate in correlation without code.

```jsonc
"analysis": {
  "role": "outcome" | "exposure" | "exposure_source" | "confounder" | "covariate"
        | "context" | "calibration" | "meta" | "outcome_selector" | "ignore",
  "direction": "higher_is_worse" | "higher_is_better" | "distance_from_center",
  "center": 4,                     // for distance_from_center
  "lag_windows_hours": [[0,6],[6,24],[24,48],[24,72]],
  "min_observations": 10
}
```

Three of those roles were added in v1.7 and are worth stating precisely, because each changes what the engine does with the field:

- **`calibration`** — the value does not enter any association. It **tunes the engine itself**. `transit_marker.hours` is the only current example: its median shifts the user's lag windows once `min_observations` is met, capped by `shift_cap_pct`. A calibration field with too few observations is silently inert, and the UI must say so rather than implying personalisation it does not have.
- **`covariate`** — enters the model as a control and, unlike `confounder`, is **also surfaced to the user** when it overlaps an insight's exposure window. `event_marker.kind` is the example. The distinction matters: a confounder is adjusted for quietly; a covariate is adjusted for *and named*, because "6 of your 14 dairy days were during antibiotics" is something the user must be told, not something to bury in a model.
- **`meta`** — timestamps, notes, free text. Never analysed. Declaring it explicitly is what keeps "no analysis block" from being ambiguous between "not yet decided" and "deliberately excluded".

### 2.3 Shipped tracker definitions (Gut Health pack)

`meal`, `stool`, `symptom`, `checkin` (energy/mood/sleep/stress), `weight`, `body` (waist, body fat, BP), `hydration`, `medication`, `supplement`, `exercise`, `note`, and — from v1.7 — `transit_marker` (D36) and `event_marker` (D41). **Thirteen definitions, 63 fields.**

Definition versions are content-hashed; observations store the hash so a v2 "bloating 0–10" is never silently pooled with a v1 "bloating 0–5".

---

## 3. Postgres schema

Conventions: `uuid` v7 primary keys (time-sortable), `timestamptz` everywhere, `citext` for emails, every user-owned table carries `user_id` with an RLS policy.

**Two notes before you copy this into a migration:**

- `uuidv7()` is built into PostgreSQL 18. On 16 or 17 you need the `pg_uuidv7` extension or app-side generation — hence the version pin in `06-architecture.md`.
- The DDL below is grouped by domain for readability, **not** in dependency order. `media` must be created before `observation_value`, and `app_user` before everything. Drizzle's migration generator handles the ordering; if you hand-write SQL, sort it yourself.

Outcome keys used by the analysis engine map to rollup columns as follows: `stool.any_abnormal` → `daily_rollup.stool_abnormal`, `stool.deviation` → derived from `bristol_mean`, `symptom.load` → `daily_rollup.symptom_load`. The dotted form (`tracker.aggregation_key`) is the canonical identifier everywhere in the API and the engine.

### 3.1 Identity & config

```sql
CREATE TABLE app_user (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  email           citext UNIQUE,                       -- null in single-user mode
  password_hash   text,                                -- argon2id
  display_name    text,
  locale          text NOT NULL DEFAULT 'he-IL',
  timezone        text NOT NULL DEFAULT 'Asia/Jerusalem',
  day_rollover    time NOT NULL DEFAULT '04:00',       -- D10
  units           jsonb NOT NULL DEFAULT '{"mass":"kg","volume":"ml","length":"cm"}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE user_profile (                            -- slowly-changing baseline
  user_id     uuid PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
  sex_at_birth    text,                                -- nullable, optional
  birth_year      int,                                 -- year only, never a full DOB
  height_cm       numeric(5,1),
  goals           text[],                              -- ['gut_health','weight']
  conditions_note text,                                -- free text, user's own words
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracker_definition (
  key          text PRIMARY KEY,
  version      int  NOT NULL,
  content_hash text NOT NULL,
  definition   jsonb NOT NULL,
  loaded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_tracker (                            -- which trackers a user has on
  user_id      uuid REFERENCES app_user ON DELETE CASCADE,
  tracker_key  text REFERENCES tracker_definition(key),
  enabled      bool NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 100,
  settings     jsonb NOT NULL DEFAULT '{}',            -- per-user overrides
  PRIMARY KEY (user_id, tracker_key)
);
```

### 3.2 Observations — the heart of it

```sql
CREATE TABLE observation (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  tracker_key   text NOT NULL REFERENCES tracker_definition(key),
  def_version   int  NOT NULL,
  occurred_at   timestamptz NOT NULL,                  -- when it actually happened
  local_day     date NOT NULL,                         -- computed with day_rollover
  recorded_at   timestamptz NOT NULL DEFAULT now(),    -- when it was entered
  source        text NOT NULL DEFAULT 'manual',        -- manual|photo|voice|import|derived
  confidence    numeric(3,2),                          -- 0..1, for AI-derived entries
  note          text,
  client_id     text,                                  -- idempotency key from the device
  revision      int  NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  UNIQUE (user_id, client_id)
);
CREATE INDEX ON observation (user_id, local_day);
CREATE INDEX ON observation (user_id, tracker_key, occurred_at DESC);

CREATE TABLE observation_value (
  observation_id uuid NOT NULL REFERENCES observation ON DELETE CASCADE,
  field_key      text NOT NULL,
  value_num      numeric,
  value_text     text,
  value_bool     bool,
  value_ts       timestamptz,
  value_json     jsonb,
  value_media_id uuid REFERENCES media(id),
  unit           text,
  confidence     numeric(3,2),
  PRIMARY KEY (observation_id, field_key)
);
CREATE INDEX ON observation_value (field_key, value_num);

CREATE TABLE observation_revision (                    -- audit trail, enables sync conflict recovery
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  observation_id uuid NOT NULL REFERENCES observation ON DELETE CASCADE,
  revision       int  NOT NULL,
  snapshot       jsonb NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     text NOT NULL                         -- device id or 'server'
);
```

### 3.3 Food domain

```sql
CREATE TABLE food (                                    -- canonical food, shared across users
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  canonical_name text NOT NULL,                        -- English canonical
  names_i18n    jsonb NOT NULL DEFAULT '{}',           -- {"he": ["חומוס","חומוס גרגירים"]}
  category      text,                                  -- legume, dairy, grain, ...
  source        text NOT NULL,                         -- off | fdc | tzameret | user | llm
  external_ref  text,                                  -- OFF barcode or FDC id
  barcode       text,                                  -- reserved for D3a
  default_unit  text NOT NULL DEFAULT 'g',
  default_qty   numeric,
  is_verified   bool NOT NULL DEFAULT false,
  created_by    uuid REFERENCES app_user,
  UNIQUE (source, external_ref)
);
CREATE INDEX ON food USING gin (names_i18n jsonb_path_ops);
CREATE INDEX ON food USING gin (to_tsvector('simple', canonical_name));

CREATE TABLE food_nutrient (
  food_id   uuid REFERENCES food ON DELETE CASCADE,
  nutrient  text NOT NULL,        -- energy_kcal, protein_g, fat_g, carb_g, fiber_g,
                                  -- sugar_g, lactose_g, sodium_mg, caffeine_mg, alcohol_g
  per_100g  numeric NOT NULL,
  source    text,
  PRIMARY KEY (food_id, nutrient)
);

CREATE TABLE food_tag (                                -- the analysis workhorse
  food_id uuid REFERENCES food ON DELETE CASCADE,
  tag     text NOT NULL,          -- fodmap_fructan_high, contains_gluten, contains_lactose,
                                  -- spicy, fried, ultraprocessed, caffeine, alcohol,
                                  -- histamine_high, sugar_alcohol, insoluble_fiber_high
  confidence numeric(3,2) DEFAULT 1.0,
  source  text,                   -- literature citation key, see D12
  PRIMARY KEY (food_id, tag)
);

CREATE TABLE user_food (                               -- personal library + learned portions
  user_id       uuid REFERENCES app_user ON DELETE CASCADE,
  food_id       uuid REFERENCES food ON DELETE CASCADE,
  alias         text,                                  -- what the user actually types
  median_qty    numeric,
  median_unit   text,
  times_logged  int NOT NULL DEFAULT 0,
  last_logged   timestamptz,
  PRIMARY KEY (user_id, food_id)
);

CREATE TABLE meal_item (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  observation_id uuid NOT NULL REFERENCES observation ON DELETE CASCADE,
  food_id        uuid REFERENCES food,                 -- null while unresolved
  raw_text       text NOT NULL,                        -- exactly what the user said
  quantity       numeric,
  unit           text,
  grams_est      numeric,                              -- normalised for nutrient maths
  confidence     numeric(3,2),
  resolved_by    text,                                 -- llm|user|library|vision
  position       int NOT NULL DEFAULT 0
);
CREATE INDEX ON meal_item (food_id);

CREATE TABLE media (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  storage_key text NOT NULL,          -- path in MinIO/volume
  mime        text NOT NULL,
  bytes       bigint,
  width       int, height int,
  sha256      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

### 3.4 Analysis & trials

```sql
CREATE TABLE analysis_run (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  engine_version text NOT NULL,
  window_start date, window_end date,
  n_days       int,
  status       text NOT NULL DEFAULT 'running',
  params       jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE association (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  run_id         uuid NOT NULL REFERENCES analysis_run ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  exposure_kind  text NOT NULL,        -- food | tag | nutrient | tracker_field | meta
  exposure_ref   text NOT NULL,        -- food uuid, tag name, nutrient key, 'stool.bristol'
  exposure_label jsonb NOT NULL,       -- {"en":"Dairy","he":"מוצרי חלב"}
  outcome_ref    text NOT NULL,        -- 'stool.any_abnormal', 'symptom.bloating'
  lag_window     int4range NOT NULL,   -- hours, e.g. [6,24)
  n_exposed      int NOT NULL,
  n_unexposed    int NOT NULL,
  n_outcome_exposed   int NOT NULL,
  n_outcome_unexposed int NOT NULL,
  effect_type    text NOT NULL,        -- risk_difference | odds_ratio | mean_difference
  effect         numeric NOT NULL,
  ci_low         numeric, ci_high numeric,
  p_value        numeric,
  q_value        numeric,              -- Benjamini–Hochberg adjusted
  adjusted_for   text[] NOT NULL DEFAULT '{}',
  confounder_warnings jsonb NOT NULL DEFAULT '[]',
  confidence     text NOT NULL,        -- none | low | medium | high
  narrative      jsonb,                -- {"he": "...", "en": "..."} LLM-generated
  narrative_model text,
  dismissed_at   timestamptz
);
CREATE INDEX ON association (user_id, confidence, effect DESC);

CREATE TABLE trial (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  origin_association_id uuid REFERENCES association,
  target_kind     text NOT NULL,       -- food | tag | nutrient
  target_ref      text NOT NULL,
  target_label    jsonb NOT NULL,
  design          text NOT NULL DEFAULT 'eliminate_reintroduce',  -- see 04-analysis-engine
  primary_outcome text NOT NULL,       -- 'stool.any_abnormal'
  hypothesis      jsonb NOT NULL,      -- pre-registered: threshold, direction, min_effect
  baseline_start  date, baseline_end date,
  phases          jsonb NOT NULL,      -- ordered array, see below
  status          text NOT NULL DEFAULT 'proposed',  -- proposed|active|paused|completed|abandoned
  started_at      timestamptz, completed_at timestamptz,
  verdict         jsonb,               -- effect, posterior, adherence, limitations
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE trial_day (
  trial_id     uuid NOT NULL REFERENCES trial ON DELETE CASCADE,
  local_day    date NOT NULL,
  phase        text NOT NULL,          -- baseline|elimination|washout|challenge_1..3|followup
  assigned_dose text,
  adherent     bool,
  exposure_detected bool NOT NULL DEFAULT false,
  outcome_value numeric,
  note         text,
  PRIMARY KEY (trial_id, local_day)
);

CREATE TABLE safety_flag (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  rule_key    text NOT NULL,
  observation_id uuid REFERENCES observation ON DELETE SET NULL,
  raised_at   timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  detail      jsonb
);
```

### 3.5 Sync & jobs

```sql
CREATE TABLE sync_cursor (
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  device_id  text NOT NULL,
  last_seen_seq bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE change_log (                    -- monotonic per-user sequence for pull sync
  seq        bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,                  -- observation | meal_item | trial | ...
  entity_id  uuid NOT NULL,
  op         text NOT NULL,                  -- upsert | delete
  payload    jsonb NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON change_log (user_id, seq);

CREATE TABLE job (                           -- pg-boss or river; shown for clarity
  id        uuid PRIMARY KEY DEFAULT uuidv7(),
  kind      text NOT NULL,                   -- parse_meal | vision_parse | run_analysis |
                                             -- generate_narrative | evaluate_trial | export
  user_id   uuid,
  payload   jsonb NOT NULL,
  status    text NOT NULL DEFAULT 'queued',
  attempts  int  NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  error     text
);
```

### 3.6 Row-level security

```sql
ALTER TABLE observation ENABLE ROW LEVEL SECURITY;
CREATE POLICY obs_isolation ON observation
  USING (user_id = current_setting('app.user_id')::uuid);
-- identical policies on every user-owned table.
-- The application sets app.user_id per transaction from the verified session.
-- No code path may query these tables with a superuser role.
```

---

## 4. Derived views

```sql
-- The day is the unit of analysis. This view is the join point for everything.
CREATE MATERIALIZED VIEW daily_rollup AS
SELECT
  o.user_id,
  o.local_day,
  -- gut outcomes
  count(*) FILTER (WHERE o.tracker_key = 'stool')                       AS stool_count,
  avg(v.value_num) FILTER (WHERE o.tracker_key='stool' AND v.field_key='bristol') AS bristol_mean,
  bool_or(v.value_num IN (1,2,6,7))
        FILTER (WHERE o.tracker_key='stool' AND v.field_key='bristol')  AS stool_abnormal,
  -- symptom load 0..100
  coalesce(sum(v.value_num) FILTER (WHERE o.tracker_key='symptom'),0)   AS symptom_load,
  -- confounders
  max(v.value_num) FILTER (WHERE o.tracker_key='checkin' AND v.field_key='sleep_hours') AS sleep_hours,
  max(v.value_num) FILTER (WHERE o.tracker_key='checkin' AND v.field_key='stress')      AS stress,
  bool_or(true)    FILTER (WHERE o.tracker_key='medication')            AS took_medication,
  -- completeness, used to weight the analysis
  count(DISTINCT o.tracker_key)                                          AS trackers_logged,
  bool_or(o.tracker_key='checkin')                                       AS has_checkin
FROM observation o
LEFT JOIN observation_value v ON v.observation_id = o.id
WHERE o.deleted_at IS NULL
GROUP BY o.user_id, o.local_day;

CREATE UNIQUE INDEX ON daily_rollup (user_id, local_day);

-- Exposure matrix: one row per (day, exposure) with dose
CREATE MATERIALIZED VIEW daily_exposure AS
SELECT o.user_id, o.local_day, 'food'::text AS kind, mi.food_id::text AS ref,
       sum(mi.grams_est) AS dose, count(*) AS n_items,
       min(o.occurred_at) AS first_at, max(o.occurred_at) AS last_at
FROM observation o JOIN meal_item mi ON mi.observation_id = o.id
WHERE o.tracker_key='meal' AND o.deleted_at IS NULL AND mi.food_id IS NOT NULL
GROUP BY 1,2,3,4
UNION ALL
SELECT o.user_id, o.local_day, 'tag', ft.tag,
       sum(mi.grams_est), count(*), min(o.occurred_at), max(o.occurred_at)
FROM observation o
JOIN meal_item mi ON mi.observation_id = o.id
JOIN food_tag ft  ON ft.food_id = mi.food_id
WHERE o.tracker_key='meal' AND o.deleted_at IS NULL
GROUP BY 1,2,3,4
UNION ALL
SELECT o.user_id, o.local_day, 'nutrient', fn.nutrient,
       sum(fn.per_100g * mi.grams_est / 100.0), count(*), min(o.occurred_at), max(o.occurred_at)
FROM observation o
JOIN meal_item mi   ON mi.observation_id = o.id
JOIN food_nutrient fn ON fn.food_id = mi.food_id
WHERE o.tracker_key='meal' AND o.deleted_at IS NULL
GROUP BY 1,2,3,4;

CREATE INDEX ON daily_exposure (user_id, kind, ref, local_day);
```

Refresh strategy: `REFRESH MATERIALIZED VIEW CONCURRENTLY` on a 15-minute schedule, plus an immediate targeted refresh when an analysis run is requested.

---

## 5. Local (device) store

IndexedDB via Dexie, mirroring the server shape closely enough that the same TypeScript types serve both.

| Store | Purpose |
|---|---|
| `observations` | Full local copy of the last 400 days |
| `meal_items` | Ditto |
| `foods` | The user's food library + last 2000 canonical foods touched |
| `outbox` | Pending mutations: `{client_id, op, entity, payload, created_at, attempts}` |
| `media_queue` | Photo blobs awaiting upload |
| `meta` | `last_seq`, `device_id`, cached tracker definitions |

**Write path is always: IndexedDB first, UI updates from IndexedDB, outbox drains in the background.** The network is never on the critical path of a save. This is what makes AC4 of US-01 achievable.

---

## 6. Sync protocol (summary; full detail in `03-api-spec.md`)

- **Push:** `POST /sync/push` with an array of outbox mutations. Each carries `client_id` (idempotency), `entity`, `op`, `payload`, `base_revision`.
- **Pull:** `GET /sync/pull?since=<seq>` returns `change_log` rows after the cursor plus a new cursor.
- **Conflicts:** last-write-wins **per field**, decided by `recorded_at` then `device_id` as tiebreak. The losing value is written to `observation_revision` and never silently lost. A conflict on a *deleted* record resolves to deleted.
- **Idempotency:** `(user_id, client_id)` unique constraint makes replay safe.
- **Clock skew:** the server records its own `recorded_at`; the client's timestamp is kept as `occurred_at` only. Skew therefore cannot corrupt ordering.

---

## 7. Data-quality rules

These run as constraints or as validation in the write path, because bad data silently poisons every downstream statistic.

1. `occurred_at` may not be more than 24 h in the future (clock-skew guard) or more than 5 years in the past.
2. `local_day` is always computed server-side from `occurred_at`, the user's timezone and `day_rollover` — never trusted from the client.
3. A meal with zero resolved items is valid (an unparsed placeholder) but is excluded from exposure calculations and flagged in the UI as "needs a moment".
4. A food may not carry contradictory tags (`contains_lactose` + `dairy_free`); enforced by a check trigger on `food_tag`.
5. `grams_est` must be present for a meal item to enter nutrient analysis; missing values fall back to the food's `default_qty`, and the item is marked `estimated: true`.
6. Duplicate detection: two `stool` observations within 5 minutes prompt "did you mean to log two?" rather than being silently merged.
7. Definition-version isolation: aggregations never pool values across incompatible `def_version`s of the same field.

---

## 8. Addendum v1.1 — schema required by the flow spec

`08-user-flows.md` resolved twelve open questions (D15–D26). Each one has a schema consequence. This section is normative; it is not optional colour.

### 8.1 New field types

| Type | Storage | Why it exists |
|---|---|---|
| `multi_photo` | `value_json` — an ordered array of `media_id` | A meal can carry up to 4 photos (`08` §4.4). The original single `value_media_id` could not express this. |
| `datetime` | `value_ts` | Backdating (D18) needs date **and** time on every capture screen; the old `time` type was time-only. `time` is retained for schedules. |

### 8.2 Grouped observations

```sql
ALTER TABLE observation ADD COLUMN group_id uuid;
CREATE INDEX ON observation (user_id, group_id) WHERE group_id IS NOT NULL;
```

One save can produce several observations that belong together — three symptoms recorded in one pass, or weight plus waist plus blood pressure. They share a `group_id` so edit and delete can offer "just this one, or all three?" (`08` §5.2). `group_id` has no meaning to the analysis engine; each observation is still analysed independently.

### 8.3 User-authored trackers (D15)

```sql
CREATE TABLE user_tracker_definition (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  key          text NOT NULL,                    -- prefixed 'u_' to avoid collision with shipped keys
  version      int  NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  definition   jsonb NOT NULL,                   -- same meta-schema as config/trackers/*.json
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);
```

The tracker registry at startup is the union of `tracker_definition` (operator config, shared) and `user_tracker_definition` (per user). Everything downstream — rendering, validation, aggregation, analysis, export — reads from the merged registry and cannot tell the difference. This is the strongest possible test of D7: if a user-built tracker doesn't work everywhere, the engine is under-built.

### 8.4 Push subscriptions (D16)

```sql
CREATE TABLE push_subscription (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  endpoint     text NOT NULL,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  device_label text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_ok_at   timestamptz,
  UNIQUE (user_id, endpoint)
);
```

A push returning 404/410 deletes the row silently. VAPID keys live in `.env` and are generated once at install.

### 8.5 Reminder preferences

```sql
CREATE TABLE reminder_pref (
  user_id     uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind        text NOT NULL,          -- checkin | meal_nudge | trial_daily | weekly_insight
  enabled     bool NOT NULL DEFAULT true,
  at_time     time,
  days_of_week int[] DEFAULT '{0,1,2,3,4,5,6}',
  PRIMARY KEY (user_id, kind)
);

ALTER TABLE app_user
  ADD COLUMN quiet_from   time NOT NULL DEFAULT '22:30',
  ADD COLUMN quiet_to     time NOT NULL DEFAULT '07:30',
  ADD COLUMN reminders_paused_until timestamptz,
  ADD COLUMN theme        text NOT NULL DEFAULT 'system',   -- D24
  ADD COLUMN idle_lock_minutes int NOT NULL DEFAULT 15;
```

The original schema had nowhere to store any of this, so the Reminders screen had nothing to read or write.

### 8.6 Avoid list (D17)

```sql
CREATE TABLE avoid_entry (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind       text NOT NULL,             -- food | tag
  ref        text NOT NULL,
  label      jsonb NOT NULL,
  reason     text NOT NULL,             -- trial_confirmed | user_choice
  trial_id   uuid REFERENCES trial,
  added_at   timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  UNIQUE (user_id, kind, ref) WHERE removed_at IS NULL
);
```

Consumed by three things: a marker when a meal containing it is logged, a 90-day suppression on re-proposing a trial for it, and the elimination-load cap in `04` §11.2.

### 8.7 Insight lifecycle (D20)

```sql
ALTER TABLE association
  ADD COLUMN seen_at       timestamptz,
  ADD COLUMN superseded_by uuid REFERENCES association,
  ADD COLUMN outcome_state text;        -- null | testing | confirmed | ruled_out

CREATE TABLE insight_dismissal (        -- keyed to the PAIR, not the row
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  exposure_ref text NOT NULL,
  outcome_ref  text NOT NULL,
  effect_at_dismissal numeric NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exposure_ref, outcome_ref)
);
```

A dismissal is honoured until a later run's effect for the same pair moves by more than 10 percentage points, at which point the insight resurfaces as `new`. Without this, dismissing an insight once would bury a genuinely worsening signal forever.

### 8.8 Trial early stop (D19)

`trial.status` gains `stopped_early`. `abandoned` now means only "discard this, no verdict". `trial.verdict` gains `"partial": true` and `"stopped_on_day": n` so the verdict card can label itself honestly.

```sql
ALTER TABLE trial ADD COLUMN abandon_reason text;
ALTER TABLE trial_day ADD COLUMN logged bool NOT NULL DEFAULT false;
```

`trial_day.logged` is what makes a missing day visually distinct from a slip on the phase strip (`08` §9.3) — previously the two were indistinguishable in the schema.

### 8.9 Immutable pre-registration

```sql
CREATE FUNCTION trial_hypothesis_immutable() RETURNS trigger AS $$
BEGIN
  IF OLD.started_at IS NOT NULL AND NEW.hypothesis IS DISTINCT FROM OLD.hypothesis THEN
    RAISE EXCEPTION 'hypothesis is locked once the trial has started';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trial_lock BEFORE UPDATE ON trial
  FOR EACH ROW EXECUTE FUNCTION trial_hypothesis_immutable();
```

`07-build-plan.md` M5 required this be enforced "at the database level, not just application code". Here it is.

### 8.10 Symptom fields the safety rules depend on

The shipped `symptom` tracker gains two options that the red-flag rules in `01` US-09 already referenced but which had no field to read: `fever` (boolean plus an optional temperature) and `cannot_keep_fluids` (boolean). Without them, two of the seven red-flag criteria were undetectable.

### 8.11 Local-only stores (no server counterpart)

| Dexie store | Contents | Notes |
|---|---|---|
| `drafts` | unfinished composer state | max 5, purged at 7 days, never synced |
| `media_queue` | photo blobs pending upload | LRU-capped; shed only with consent (`08` §7.4) |
| `dismissals_local` | UI dismissals with short lifetimes (pattern alerts) | |

Drafts are deliberately local. A half-typed meal is not data; syncing it across devices would be surprising rather than useful.


---

## 9. Addendum v1.3 — field encryption (D28)

`06-architecture.md` §5.3 chose L2: the narrative layer is encrypted at the application layer, the numeric layer is not, because the analysis engine has to read it.

### 9.1 Key storage

```sql
CREATE TABLE crypto_key (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- exactly one row
  dek_wrapped bytea NOT NULL,        -- DEK sealed with the KEK from .env
  alg         text  NOT NULL,        -- 'xchacha20poly1305/hkdf-sha256/v1'
  created_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz,
  checksum    text NOT NULL          -- printed on the recovery card
);
```

The KEK never touches the database. The DEK never leaves the API process unwrapped.

### 9.2 Encrypted columns

Each encrypted column becomes `bytea` holding `nonce || ciphertext || tag`, with the AAD bound to `table || column || row_id`:

```sql
ALTER TABLE observation      ALTER COLUMN note TYPE bytea USING NULL;
ALTER TABLE meal_item        ALTER COLUMN raw_text TYPE bytea USING NULL;
ALTER TABLE user_profile     ALTER COLUMN conditions_note TYPE bytea USING NULL;
ALTER TABLE trial            ALTER COLUMN abandon_reason TYPE bytea USING NULL;
ALTER TABLE trial_day        ALTER COLUMN note TYPE bytea USING NULL;
ALTER TABLE association      ALTER COLUMN narrative TYPE bytea USING NULL;

ALTER TABLE user_food
  ALTER COLUMN alias TYPE bytea USING NULL,
  ADD COLUMN alias_bidx bytea;                    -- HMAC-SHA256(index_key, normalize(alias))
CREATE INDEX ON user_food (user_id, alias_bidx);

ALTER TABLE media
  ADD COLUMN object_key_wrapped bytea NOT NULL,   -- per-object key, wrapped by the DEK
  ADD COLUMN nonce bytea NOT NULL;
```

**Migrating an existing instance** is a one-shot resumable job: read plaintext, encrypt, write ciphertext, null the old column, in batches, with a progress table. It runs once and refuses to run twice.

### 9.3 What the engine still sees

`daily_rollup`, `daily_exposure` and every analysis query touch only numeric `observation_value` rows, timestamps, `food_id`, tags and nutrients — none of which are encrypted. **No analysis code changes.** That is the whole point of choosing L2 over L3: the seam falls between the words and the numbers.

### 9.4 Local (device) store

IndexedDB holds **plaintext**, deliberately. The device is protected by the OS, the app passcode and the idle lock; encrypting locally with a key that also lives locally would be theatre. Logout and account deletion clear the store; the service worker never caches decrypted media beyond its LRU.

### 9.5 Export

- **JSON / CSV export is plaintext by design** — an export you cannot read is not an export. The download is one-time, signed and short-lived, and the export screen says plainly that the file is unencrypted and worth deleting once used.
- **Backups are the opposite**: `pg_dump` contains ciphertext, and is additionally encrypted with age before it leaves the host.


---

## 10. Addendum v1.5 — meal specificity (D29)

```sql
ALTER TABLE observation
  ADD COLUMN specificity text NOT NULL DEFAULT 'resolved'
    CHECK (specificity IN ('resolved','partial','unspecified'));

CREATE INDEX ON observation (user_id, local_day)
  WHERE tracker_key = 'meal' AND specificity = 'unspecified';
```

| Value | Meaning | Enters exposure analysis? |
|---|---|---|
| `resolved` | ≥1 item at confidence ≥ 0.6 | Yes |
| `partial` | Some items resolved, some text unplaced | Yes, for the items that resolved |
| `unspecified` | No food content, and the user declined to clarify | **No** |

An `unspecified` meal still counts toward `meal_coverage` in the day-weight formula (`04` §2) — the user did eat, and did log, and pretending otherwise would understate their adherence. It contributes nothing to `daily_exposure`. Both facts are true at once and the schema has to represent both, which is why this is a field on the observation rather than a filter applied at query time.

### 10.1 The suggestion source

Clarify options are computed, not stored:

```sql
-- three most-logged foods in a ±90 minute window around this timestamp
SELECT f.id, f.canonical_name, uf.times_logged
FROM user_food uf
JOIN food f ON f.id = uf.food_id
JOIN meal_item mi ON mi.food_id = f.id
JOIN observation o ON o.id = mi.observation_id
WHERE o.user_id = $1
  AND o.tracker_key = 'meal'
  AND abs(extract(epoch FROM (o.occurred_at::time - $2::time))) < 5400
  AND o.deleted_at IS NULL
GROUP BY f.id, f.canonical_name, uf.times_logged
ORDER BY count(*) DESC
LIMIT 3;
```

**No model is involved in producing these.** That is the whole design: the suggestions are a mirror of the user's own behaviour, so a wrong suggestion is merely unhelpful rather than an invention that ends up in the analysis.


---

## 11. Addendum v1.6 — batch entry and estimated times (D30, D31)

### 11.1 Time precision

```sql
ALTER TABLE observation
  ADD COLUMN time_precision text NOT NULL DEFAULT 'exact'
    CHECK (time_precision IN ('exact','slot_estimate','day_only'));
```

**Derived on write, never set by the user:**

```
exact          |occurred_at − recorded_at| ≤ 2h,  OR the user set the time by hand
slot_estimate  time came from the user's slot median (the day builder's default)
day_only       no usable time at all (import, or a slot with no median yet)
```

Promoting is one-way and happens when the user sets a time by hand. Nothing ever demotes.

### 11.2 Slot medians

The day builder's prefilled times come from the user's own history, not from constants:

```sql
CREATE MATERIALIZED VIEW user_slot_time AS
SELECT o.user_id,
       v.value_text                                  AS slot,
       (percentile_cont(0.5) WITHIN GROUP (
          ORDER BY extract(epoch FROM o.occurred_at::time)) || ' seconds')::interval AS median_time,
       count(*)                                      AS n
FROM observation o
JOIN observation_value v ON v.observation_id = o.id AND v.field_key = 'slot'
WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL
  AND o.time_precision = 'exact'          -- estimates must not feed the estimator
GROUP BY o.user_id, v.value_text
HAVING count(*) >= 3;

CREATE UNIQUE INDEX ON user_slot_time (user_id, slot);
```

Two details that matter. **Only `exact` rows feed the median**, or the estimator would drift toward its own output. And **fewer than 3 observations means no median** — the slot then falls back to a sensible constant and the entry is marked `day_only` rather than pretending to a precision it doesn't have.

### 11.3 Batch writes

A day builder save is one transaction producing several observations. They share a `batch_id` so the whole save is a single undo:

```sql
ALTER TABLE observation ADD COLUMN batch_id uuid;
CREATE INDEX ON observation (user_id, batch_id) WHERE batch_id IS NOT NULL;
```

`batch_id` is distinct from `group_id` (§8.2): a group is several observations that describe *one event* (three symptoms at 19:20); a batch is several observations *written in one action* (a whole day's meals). Undoing a batch removes all of it; undoing a group asks first.

### 11.4 What this does to `daily_rollup`

Nothing structural — but the refresh must be triggered for **both** the old and the new day when an observation moves date (`08` §5.3), and for the covering `trial_day` if one exists. That was already stated in the flows; it is repeated here because it is the single most likely thing to be missed in implementation, and a stale rollup produces a wrong score with no error anywhere.

---

## 12. Addendum v1.7 — competitive-sweep schema (D32–D41)

Everything here is decided in `10-competitive-gaps.md`. The four P0 items are schema and therefore land in **M1** or become migrations later; the rest are noted so the columns exist before they are needed.

### 12.1 `food_component` — ingredient decomposition (D34)

The largest structural gap in v1.0. `meal_item → food` is flat, so "שקשוקה" is a single `food` row and its onion and garlic — the exact fructan predictors the engine exists to isolate — are invisible unless someone hand-tags the dish. Correlation power is proportional to the number of independently-varying predictors per meal: one composite food is one predictor; its decomposition is seven.

```sql
CREATE TABLE food_component (
  parent_food_id    uuid NOT NULL REFERENCES food ON DELETE CASCADE,
  component_food_id uuid NOT NULL REFERENCES food ON DELETE RESTRICT,
  fraction          numeric(5,4),         -- share of parent mass; null = unknown
  is_optional       bool NOT NULL DEFAULT false,  -- "with/without garlic"
  source            text NOT NULL,        -- fndds | user | llm | pack
  confidence        numeric(3,2),
  position          int NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_food_id, component_food_id)
);
CREATE INDEX ON food_component (component_food_id);
```

Rules:

1. **Tags and nutrients resolve transitively.** A meal containing shakshuka is an exposure to `fodmap_fructan_high` because onion is a component, not because someone remembered to tag the dish. The resolver walks the graph; depth is capped at 3 and cycles are rejected at write time.
2. **`fraction` is optional and its absence is not fatal.** A component with no fraction contributes to *presence/absence* exposure but not to dose. This matters — most user-authored recipes will never have masses.
3. **A template is one tap and N rows.** "My usual shakshuka" saves as a parent food with components; logging it writes one `meal_item` whose `food_id` is the parent, and the analysis layer expands it. The reuse-speed-versus-ingredient-fidelity trade-off that every mainstream logger accepts is refused here.
4. USDA FNDDS already ships this decomposition (`FNDDS Ingredients` + `Ingredient Nutrient Values`) and is the seed source for `source = 'fndds'`.

### 12.2 `meal_item.portion_precision` (D35)

`meal_item.confidence` conflates *parse* confidence with *portion* confidence. They are different quantities and only one belongs in the day weight.

```sql
ALTER TABLE meal_item
  ADD COLUMN portion_precision text NOT NULL DEFAULT 'unspecified'
    CHECK (portion_precision IN ('weighed','measured','estimated','unspecified'));
```

Exactly parallel to `time_precision` (§11, D31), and it feeds `w(d)` in `04` §5 with the same shape. `unspecified` is usable for presence/absence exposure and **excluded from dose-response**. Surfaced to the user as FoodNoms does it — Accurate / Approximate / Estimate — because grading your own portion removes the obligation to be exact, which is the top cause of logging abandonment, while handing the engine a free weight it would otherwise discard.

### 12.3 Trial blinding (D32, D33)

```sql
ALTER TABLE trial
  ADD COLUMN design            text NOT NULL DEFAULT 'A'
    CHECK (design IN ('A','B','C','D')),          -- D = blinded challenge
  ADD COLUMN allocation_sealed bool NOT NULL DEFAULT false,
  ADD COLUMN allocation_key    bytea,             -- server-side only; never in a sync payload
  ADD COLUMN revealed_at       timestamptz;

CREATE TABLE trial_period_guess (
  trial_id     uuid NOT NULL REFERENCES trial ON DELETE CASCADE,
  period_index int  NOT NULL,
  guess        text NOT NULL CHECK (guess IN ('active','control','no_idea')),
  confidence   int  CHECK (confidence BETWEEN 1 AND 5),
  answered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trial_id, period_index)
);
```

`allocation_key` is the one column in the schema that must never leave the server, including to the user's own client, until `revealed_at` is set. It is excluded from `/sync/pull` by an explicit column allowlist, not by omission — add a test that fails if it ever appears in a sync payload.

`trial_period_guess` is populated for **every** design, not just D. In an open-label trial it is the expectation-effect measurement.

### 12.4 Washout (D37)

```sql
ALTER TABLE trial_day
  ADD COLUMN analytic_excluded bool NOT NULL DEFAULT false;   -- dropped from the likelihood

ALTER TABLE trial
  ADD COLUMN washout_gate_delta   numeric,   -- δ for symptom-gated washout
  ADD COLUMN washout_days_actual  int,       -- what was actually taken
  ADD COLUMN analytic_washout_k   int NOT NULL DEFAULT 0;     -- pre-registered
```

`analytic_washout_k` is written at pre-registration time and is therefore covered by the immutability trigger (§8.9). `washout_days_actual` is written afterwards and is not.

### 12.5 `transit_measurement` (D36)

```sql
CREATE TABLE transit_measurement (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  ingested_at   timestamptz NOT NULL,
  first_seen_at timestamptz,                  -- null while in progress
  marker        text NOT NULL DEFAULT 'blue_dye',
  hours         numeric GENERATED ALWAYS AS
                  (EXTRACT(EPOCH FROM (first_seen_at - ingested_at)) / 3600.0) STORED,
  abandoned     bool NOT NULL DEFAULT false,
  note          text
);
CREATE INDEX ON transit_measurement (user_id, ingested_at DESC);
```

The user's transit estimate is the median of their non-abandoned measurements. `04` §4.1 requires three before the lag windows shift.

### 12.6 `event_marker` (D41)

```sql
CREATE TABLE event_marker (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind       text NOT NULL,          -- antibiotics|travel|illness|cycle|procedure|other
  label      text,                   -- encrypted (narrative layer, `06` §5.3)
  started_at timestamptz NOT NULL,
  ended_at   timestamptz,            -- null = point event
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON event_marker (user_id, started_at DESC);
```

Discrete shocks a daily correlation engine cannot see, and which dominate gut outcomes: a course of antibiotics, a trip abroad, a stomach bug, a colonoscopy prep. Overlapping markers enter the analysis as covariates and, where an insight's exposure window overlaps one, the evidence card says so rather than reporting the association unqualified.
