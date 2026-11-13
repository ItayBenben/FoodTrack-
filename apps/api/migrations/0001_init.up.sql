-- FoodTrack 0001 — the complete schema of docs/02-data-model.md §3–§12,
-- with every addendum applied in place. Hand-written SQL (RLS, triggers and
-- matviews are not expressible in an ORM generator); see docs/impl-notes.md I-01.
--
-- Roles (created by infra/postgres/init.sql or scripts/dev-db.sh):
--   foodtrack      owner of every object, runs migrations. NOT superuser.
--   foodtrack_app  what the API, worker and analysis service connect as.
--                  Not the owner, no BYPASSRLS → every policy applies.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- uuidv7() is built into PostgreSQL 18. On 16/17, install an equivalent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE p.proname = 'uuidv7' AND n.nspname = 'pg_catalog') THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid LANGUAGE plpgsql VOLATILE AS $b$
      DECLARE
        ts bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
        b bytea := gen_random_bytes(16);
      BEGIN
        b := set_byte(b, 0, ((ts >> 40) & 255)::int);
        b := set_byte(b, 1, ((ts >> 32) & 255)::int);
        b := set_byte(b, 2, ((ts >> 24) & 255)::int);
        b := set_byte(b, 3, ((ts >> 16) & 255)::int);
        b := set_byte(b, 4, ((ts >> 8) & 255)::int);
        b := set_byte(b, 5, (ts & 255)::int);
        b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);
        b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);
        RETURN encode(b, 'hex')::uuid;
      END $b$;
    $f$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

-- ───────────────────────── 3.1 identity & config ─────────────────────────
CREATE TABLE app_user (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  email           citext UNIQUE,
  password_hash   text,
  display_name    text,
  locale          text NOT NULL DEFAULT 'he-IL',
  timezone        text NOT NULL DEFAULT 'Asia/Jerusalem',
  day_rollover    time NOT NULL DEFAULT '04:00',
  units           jsonb NOT NULL DEFAULT '{"mass":"kg","volume":"ml","length":"cm"}',
  quiet_from      time NOT NULL DEFAULT '22:30',
  quiet_to        time NOT NULL DEFAULT '07:30',
  reminders_paused_until timestamptz,
  theme           text NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  idle_lock_minutes int NOT NULL DEFAULT 15,
  totp_secret_enc bytea,
  totp_recovery   jsonb,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until    timestamptz,
  onboarded_at    timestamptz,
  disclaimer_accepted_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE TABLE user_profile (
  user_id         uuid PRIMARY KEY REFERENCES app_user ON DELETE CASCADE,
  sex_at_birth    text,
  birth_year      int CHECK (birth_year BETWEEN 1900 AND 2100),
  height_cm       numeric(5,1),
  goals           text[],
  conditions_note bytea,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tracker_definition (
  key          text PRIMARY KEY,
  version      int  NOT NULL,
  content_hash text NOT NULL,
  definition   jsonb NOT NULL,
  loaded_at    timestamptz NOT NULL DEFAULT now()
);

-- every definition version ever loaded, so historical observations stay interpretable
CREATE TABLE tracker_definition_history (
  key          text NOT NULL,
  content_hash text NOT NULL,
  version      int  NOT NULL,
  definition   jsonb NOT NULL,
  first_loaded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, content_hash)
);

CREATE TABLE user_tracker_definition (
  id           uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  key          text NOT NULL CHECK (key LIKE 'u\_%'),
  version      int  NOT NULL DEFAULT 1,
  content_hash text NOT NULL,
  definition   jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz,
  UNIQUE (user_id, key)
);

CREATE TABLE user_tracker (
  user_id      uuid REFERENCES app_user ON DELETE CASCADE,
  tracker_key  text NOT NULL,
  enabled      bool NOT NULL DEFAULT true,
  sort_order   int  NOT NULL DEFAULT 100,
  settings     jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, tracker_key)
);

-- ───────────────────────── auth sessions & audit ─────────────────────────
CREATE TABLE auth_session (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  family_id     uuid NOT NULL,
  token_hash    bytea NOT NULL UNIQUE,
  device_label  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  rotated_at    timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX ON auth_session (user_id);
CREATE INDEX ON auth_session (family_id);

CREATE TABLE passphrase_reset (
  token_hash  bytea PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);

CREATE TABLE security_audit (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid REFERENCES app_user ON DELETE CASCADE,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}',
  ip         text,
  at         timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── media (before observation_value) ─────────────────────────
CREATE TABLE media (
  id          uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  storage_key text NOT NULL,
  mime        text NOT NULL,
  bytes       bigint,
  width       int, height int,
  sha256      text,
  object_key_wrapped bytea NOT NULL,
  nonce       bytea NOT NULL,
  uploaded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON media (user_id);

-- ───────────────────────── 3.2 observations ─────────────────────────
CREATE TABLE observation (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  tracker_key   text NOT NULL,
  def_version   int  NOT NULL,
  def_hash      text NOT NULL,
  occurred_at   timestamptz NOT NULL,
  local_day     date NOT NULL,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','photo','voice','import','derived')),
  confidence    numeric(3,2),
  note          bytea,
  client_id     text,
  device_id     text,
  revision      int  NOT NULL DEFAULT 1,
  deleted_at    timestamptz,
  group_id      uuid,
  batch_id      uuid,
  specificity   text NOT NULL DEFAULT 'resolved' CHECK (specificity IN ('resolved','partial','unspecified')),
  time_precision text NOT NULL DEFAULT 'exact' CHECK (time_precision IN ('exact','slot_estimate','day_only')),
  parse_status  text NOT NULL DEFAULT 'none' CHECK (parse_status IN ('none','pending','done','degraded','failed')),
  UNIQUE (user_id, client_id),
  -- 02 §7 rule 1: clock-skew and history guard
  CONSTRAINT occurred_at_sane CHECK (occurred_at <= recorded_at + interval '24 hours'
                                     AND occurred_at >= recorded_at - interval '5 years')
);
CREATE INDEX ON observation (user_id, local_day);
CREATE INDEX ON observation (user_id, tracker_key, occurred_at DESC);
CREATE INDEX ON observation (user_id, group_id) WHERE group_id IS NOT NULL;
CREATE INDEX ON observation (user_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX ON observation (user_id, local_day) WHERE tracker_key = 'meal' AND specificity = 'unspecified';

CREATE TABLE observation_value (
  observation_id uuid NOT NULL REFERENCES observation ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  field_key      text NOT NULL,
  value_num      numeric,
  value_text     text,
  value_enc      bytea,          -- sensitive text fields (narrative layer, 06 §5.3)
  value_bool     bool,
  value_ts       timestamptz,
  value_json     jsonb,
  value_media_id uuid REFERENCES media(id),
  unit           text,
  confidence     numeric(3,2),
  PRIMARY KEY (observation_id, field_key)
);
CREATE INDEX ON observation_value (field_key, value_num);
CREATE INDEX ON observation_value (user_id);

CREATE TABLE observation_revision (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  observation_id uuid NOT NULL REFERENCES observation ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  revision       int  NOT NULL,
  snapshot       jsonb NOT NULL,     -- narrative fields sealed inside
  changed_at     timestamptz NOT NULL DEFAULT now(),
  changed_by     text NOT NULL,
  reason         text                -- edit | conflict_loser | move | restore
);
CREATE INDEX ON observation_revision (observation_id);

-- ───────────────────────── 3.3 food domain ─────────────────────────
CREATE TABLE food (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  canonical_name text NOT NULL,
  names_i18n     jsonb NOT NULL DEFAULT '{}',
  search_text    text NOT NULL DEFAULT '',     -- lower-cased names, all locales, for trigram
  category       text,
  source         text NOT NULL CHECK (source IN ('off','fdc','fndds','tzameret','user','llm','seed','pack')),
  external_ref   text,
  barcode        text,
  default_unit   text NOT NULL DEFAULT 'g',
  default_qty    numeric,
  grams_per_unit numeric,
  is_verified    bool NOT NULL DEFAULT false,
  created_by     uuid REFERENCES app_user ON DELETE CASCADE,
  merged_into    uuid REFERENCES food,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_ref)
);
CREATE INDEX ON food USING gin (names_i18n jsonb_path_ops);
CREATE INDEX ON food USING gin (search_text gin_trgm_ops);
CREATE INDEX ON food USING gin (to_tsvector('simple', canonical_name));

CREATE TABLE food_nutrient (
  food_id   uuid REFERENCES food ON DELETE CASCADE,
  nutrient  text NOT NULL,
  per_100g  numeric NOT NULL,
  source    text,
  PRIMARY KEY (food_id, nutrient)
);

CREATE TABLE food_tag (
  food_id    uuid REFERENCES food ON DELETE CASCADE,
  tag        text NOT NULL,
  confidence numeric(3,2) DEFAULT 1.0,
  source     text,
  PRIMARY KEY (food_id, tag)
);

-- 02 §7 rule 4: no contradictory tags
CREATE FUNCTION food_tag_no_contradiction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE pairs text[][] := ARRAY[
  ARRAY['contains_lactose','lactose_free'], ARRAY['contains_lactose','dairy_free'],
  ARRAY['dairy','dairy_free'], ARRAY['contains_gluten','gluten_free']];
  p text[];
BEGIN
  FOREACH p SLICE 1 IN ARRAY pairs LOOP
    IF (NEW.tag = p[1] AND EXISTS (SELECT 1 FROM food_tag WHERE food_id = NEW.food_id AND tag = p[2]))
    OR (NEW.tag = p[2] AND EXISTS (SELECT 1 FROM food_tag WHERE food_id = NEW.food_id AND tag = p[1])) THEN
      RAISE EXCEPTION 'contradictory food tags % and % on food %', p[1], p[2], NEW.food_id;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
CREATE TRIGGER food_tag_contradiction BEFORE INSERT OR UPDATE ON food_tag
  FOR EACH ROW EXECUTE FUNCTION food_tag_no_contradiction();

CREATE TABLE food_component (
  parent_food_id    uuid NOT NULL REFERENCES food ON DELETE CASCADE,
  component_food_id uuid NOT NULL REFERENCES food ON DELETE RESTRICT,
  fraction          numeric(5,4) CHECK (fraction IS NULL OR (fraction > 0 AND fraction <= 1)),
  is_optional       bool NOT NULL DEFAULT false,
  source            text NOT NULL,
  confidence        numeric(3,2),
  position          int NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_food_id, component_food_id),
  CHECK (parent_food_id <> component_food_id)
);
CREATE INDEX ON food_component (component_food_id);

-- 12.1 rule 1: cycles rejected at write time; depth measured across the whole chain, capped at 3.
CREATE FUNCTION food_component_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cyc bool; depth_up int; depth_down int;
BEGIN
  WITH RECURSIVE down(id, d) AS (
    SELECT NEW.component_food_id, 1
    UNION ALL
    SELECT fc.component_food_id, down.d + 1 FROM food_component fc JOIN down ON fc.parent_food_id = down.id WHERE down.d < 10
  ) SELECT bool_or(id = NEW.parent_food_id), max(d) INTO cyc, depth_down FROM down;
  IF cyc THEN RAISE EXCEPTION 'food component cycle via %', NEW.component_food_id; END IF;
  WITH RECURSIVE up(id, d) AS (
    SELECT NEW.parent_food_id, 0
    UNION ALL
    SELECT fc.parent_food_id, up.d + 1 FROM food_component fc JOIN up ON fc.component_food_id = up.id WHERE up.d < 10
  ) SELECT max(d) INTO depth_up FROM up;
  IF depth_up + depth_down > 3 THEN
    RAISE EXCEPTION 'food component depth % exceeds 3', depth_up + depth_down;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER food_component_guard BEFORE INSERT OR UPDATE ON food_component
  FOR EACH ROW EXECUTE FUNCTION food_component_guard();

CREATE TABLE user_food (
  user_id       uuid REFERENCES app_user ON DELETE CASCADE,
  food_id       uuid REFERENCES food ON DELETE CASCADE,
  alias         bytea,
  alias_bidx    bytea,
  median_qty    numeric,
  median_unit   text,
  median_grams  numeric,
  qty_history   numeric[] NOT NULL DEFAULT '{}',
  times_logged  int NOT NULL DEFAULT 0,
  last_logged   timestamptz,
  PRIMARY KEY (user_id, food_id)
);
CREATE INDEX ON user_food (user_id, alias_bidx);

-- extra aliases: one user food may be typed several ways (Hebrew and English → one food_id)
CREATE TABLE user_food_alias (
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  alias_bidx bytea NOT NULL,
  alias      bytea NOT NULL,
  food_id    uuid NOT NULL REFERENCES food ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, alias_bidx)
);

CREATE TABLE meal_item (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  observation_id uuid NOT NULL REFERENCES observation ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  food_id        uuid REFERENCES food,
  raw_text       bytea NOT NULL,
  quantity       numeric,
  unit           text,
  grams_est      numeric,
  estimated      bool NOT NULL DEFAULT false,
  confidence     numeric(3,2),
  resolved_by    text,
  portion_precision text NOT NULL DEFAULT 'unspecified'
    CHECK (portion_precision IN ('weighed','measured','estimated','unspecified')),
  position       int NOT NULL DEFAULT 0
);
CREATE INDEX ON meal_item (food_id);
CREATE INDEX ON meal_item (observation_id);

-- ───────────────────────── 3.4 analysis & trials ─────────────────────────
CREATE TABLE analysis_run (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  engine_version text NOT NULL,
  window_start   date, window_end date,
  n_days         int,
  status         text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  params         jsonb NOT NULL DEFAULT '{}',
  summary        jsonb NOT NULL DEFAULT '{}',
  error          text
);
CREATE INDEX ON analysis_run (user_id, started_at DESC);
CREATE UNIQUE INDEX analysis_run_one_inflight ON analysis_run (user_id) WHERE status = 'running';

CREATE TABLE association (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  run_id         uuid NOT NULL REFERENCES analysis_run ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  exposure_kind  text NOT NULL,
  exposure_ref   text NOT NULL,
  exposure_label jsonb NOT NULL,
  outcome_ref    text NOT NULL,
  outcome_label  jsonb NOT NULL DEFAULT '{}',
  lag_window     int4range NOT NULL,
  n_exposed      int NOT NULL,
  n_unexposed    int NOT NULL,
  n_outcome_exposed   int NOT NULL,
  n_outcome_unexposed int NOT NULL,
  effect_type    text NOT NULL,
  effect         numeric NOT NULL,
  ci_low         numeric, ci_high numeric,
  p_value        numeric,
  q_value        numeric,
  rho_1          numeric,
  attenuation    numeric,
  adjusted_for   text[] NOT NULL DEFAULT '{}',
  confounder_warnings jsonb NOT NULL DEFAULT '[]',
  evidence       jsonb NOT NULL DEFAULT '{}',
  confidence     text NOT NULL CHECK (confidence IN ('none','low','medium','high')),
  narrative      bytea,
  narrative_model text,
  narrative_prompt_version text,
  dismissed_at   timestamptz,
  seen_at        timestamptz,
  superseded_by  uuid REFERENCES association ON DELETE SET NULL,
  outcome_state  text CHECK (outcome_state IN ('testing','confirmed','ruled_out'))
);
CREATE INDEX ON association (user_id, confidence, effect DESC);
CREATE INDEX ON association (run_id);

CREATE TABLE insight_dismissal (
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  exposure_ref text NOT NULL,
  outcome_ref  text NOT NULL,
  effect_at_dismissal numeric NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, exposure_ref, outcome_ref)
);

CREATE TABLE trial (
  id              uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  origin_association_id uuid REFERENCES association ON DELETE SET NULL,
  target_kind     text NOT NULL CHECK (target_kind IN ('food','tag','nutrient')),
  target_ref      text NOT NULL,
  target_label    jsonb NOT NULL,
  design          text NOT NULL DEFAULT 'A' CHECK (design IN ('A','B','C','D')),
  primary_outcome text NOT NULL,
  hypothesis      jsonb NOT NULL,
  baseline_start  date, baseline_end date,
  phases          jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed','active','paused','completed','stopped_early','abandoned')),
  started_at      timestamptz, completed_at timestamptz,
  verdict         jsonb,
  abandon_reason  bytea,
  allocation_sealed bool NOT NULL DEFAULT false,
  allocation_key  bytea,
  sealed_at       timestamptz,
  revealed_at     timestamptz,
  washout_gate_delta  numeric,
  washout_days_actual int,
  analytic_washout_k  int NOT NULL DEFAULT 0,
  deviations      jsonb NOT NULL DEFAULT '[]',
  retest_of       uuid REFERENCES trial ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON trial (user_id, status);
CREATE UNIQUE INDEX trial_one_active ON trial (user_id) WHERE status IN ('active','paused');

-- 02 §8.9 + §12.4: the pre-registration is immutable once started (analytic_washout_k included).
CREATE FUNCTION trial_hypothesis_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.started_at IS NOT NULL AND (
       NEW.hypothesis IS DISTINCT FROM OLD.hypothesis
    OR NEW.analytic_washout_k IS DISTINCT FROM OLD.analytic_washout_k
    OR NEW.primary_outcome IS DISTINCT FROM OLD.primary_outcome
    OR NEW.design IS DISTINCT FROM OLD.design
    OR (OLD.allocation_key IS NOT NULL AND NEW.allocation_key IS DISTINCT FROM OLD.allocation_key)) THEN
    RAISE EXCEPTION 'hypothesis is locked once the trial has started';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trial_lock BEFORE UPDATE ON trial FOR EACH ROW EXECUTE FUNCTION trial_hypothesis_immutable();

CREATE TABLE trial_day (
  trial_id      uuid NOT NULL REFERENCES trial ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  local_day     date NOT NULL,
  phase         text NOT NULL,
  period_index  int,
  assigned_dose text,
  adherent      bool,
  exposure_detected bool NOT NULL DEFAULT false,
  outcome_value numeric,
  note          bytea,
  logged        bool NOT NULL DEFAULT false,
  analytic_excluded bool NOT NULL DEFAULT false,
  PRIMARY KEY (trial_id, local_day)
);

CREATE TABLE trial_period_guess (
  trial_id     uuid NOT NULL REFERENCES trial ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  period_index int  NOT NULL,
  guess        text NOT NULL CHECK (guess IN ('active','control','no_idea')),
  confidence   int  CHECK (confidence BETWEEN 1 AND 5),
  answered_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trial_id, period_index)
);

CREATE TABLE safety_flag (
  id             uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id        uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  rule_key       text NOT NULL,
  observation_id uuid REFERENCES observation ON DELETE SET NULL,
  raised_at      timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  detail         jsonb
);
CREATE INDEX ON safety_flag (user_id, raised_at DESC);

-- ───────────────────────── 3.5 sync & jobs ─────────────────────────
CREATE TABLE sync_cursor (
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  device_id     text NOT NULL,
  last_seen_seq bigint NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);

CREATE TABLE change_log (
  seq        bigserial PRIMARY KEY,
  user_id    uuid NOT NULL,
  entity     text NOT NULL,
  entity_id  uuid NOT NULL,
  op         text NOT NULL CHECK (op IN ('upsert','delete')),
  payload    jsonb NOT NULL,     -- allowlisted columns only; narrative fields sealed
  device_id  text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON change_log (user_id, seq);

CREATE TABLE job (
  id        uuid PRIMARY KEY DEFAULT uuidv7(),
  kind      text NOT NULL,
  user_id   uuid REFERENCES app_user ON DELETE CASCADE,
  payload   jsonb NOT NULL,
  status    text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts  int  NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,
  run_after timestamptz NOT NULL DEFAULT now(),
  result    jsonb,
  error     text,
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX job_ready ON job (run_after) WHERE status = 'queued';
CREATE UNIQUE INDEX job_dedupe ON job (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('queued','running');

-- ───────────────────────── 8.x flow-spec tables ─────────────────────────
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

CREATE TABLE reminder_pref (
  user_id      uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('checkin','meal_nudge','trial_daily','weekly_insight')),
  enabled      bool NOT NULL DEFAULT true,
  at_time      time,
  days_of_week int[] DEFAULT '{0,1,2,3,4,5,6}',
  last_sent_at timestamptz,
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE avoid_entry (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('food','tag')),
  ref        text NOT NULL,
  label      jsonb NOT NULL,
  reason     text NOT NULL CHECK (reason IN ('trial_confirmed','user_choice')),
  trial_id   uuid REFERENCES trial ON DELETE SET NULL,
  added_at   timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE UNIQUE INDEX avoid_entry_active ON avoid_entry (user_id, kind, ref) WHERE removed_at IS NULL;

CREATE TABLE inbox_item (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind       text NOT NULL,
  ref_id     uuid,
  payload    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX ON inbox_item (user_id, created_at DESC);

-- ───────────────────────── 12.x competitive-sweep tables ─────────────────────────
CREATE TABLE transit_measurement (
  id            uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  ingested_at   timestamptz NOT NULL,
  first_seen_at timestamptz,
  marker        text NOT NULL DEFAULT 'blue_dye',
  hours         numeric GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (first_seen_at - ingested_at)) / 3600.0) STORED,
  abandoned     bool NOT NULL DEFAULT false,
  note          bytea,
  CHECK (first_seen_at IS NULL OR first_seen_at > ingested_at)
);
CREATE INDEX ON transit_measurement (user_id, ingested_at DESC);
CREATE UNIQUE INDEX transit_one_open ON transit_measurement (user_id) WHERE first_seen_at IS NULL AND NOT abandoned;

CREATE TABLE event_marker (
  id         uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id    uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('antibiotics','travel','illness','cycle','procedure','other')),
  label      bytea,
  started_at timestamptz NOT NULL,
  ended_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX ON event_marker (user_id, started_at DESC);

-- ───────────────────────── 9.1 key storage ─────────────────────────
CREATE TABLE crypto_key (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  dek_wrapped bytea NOT NULL,
  alg         text  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  rotated_at  timestamptz,
  checksum    text NOT NULL
);

-- ───────────────────────── row-level security ─────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'user_profile','user_tracker','user_tracker_definition','auth_session','security_audit','media',
    'observation','observation_value','observation_revision','user_food','user_food_alias','meal_item',
    'analysis_run','association','insight_dismissal','trial','trial_day','trial_period_guess','safety_flag',
    'sync_cursor','change_log','push_subscription','reminder_pref','avoid_entry','inbox_item',
    'transit_measurement','event_marker','job','passphrase_reset'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id = app_current_user()) WITH CHECK (user_id = app_current_user())', t || '_isolation', t);
  END LOOP;
END $$;

ALTER TABLE app_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_user FORCE ROW LEVEL SECURITY;
CREATE POLICY app_user_isolation ON app_user USING (id = app_current_user()) WITH CHECK (id = app_current_user());

-- user-created foods are private to their author; shared canonical foods are readable by all
ALTER TABLE food ENABLE ROW LEVEL SECURITY;
ALTER TABLE food FORCE ROW LEVEL SECURITY;
CREATE POLICY food_read ON food FOR SELECT USING (created_by IS NULL OR created_by = app_current_user());
CREATE POLICY food_write ON food FOR INSERT WITH CHECK (created_by = app_current_user());
CREATE POLICY food_update ON food FOR UPDATE USING (created_by = app_current_user());
CREATE POLICY food_delete ON food FOR DELETE USING (created_by = app_current_user());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['food_nutrient','food_tag'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (EXISTS (SELECT 1 FROM food f WHERE f.id = food_id))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (EXISTS (SELECT 1 FROM food f WHERE f.id = food_id AND f.created_by = app_current_user())) WITH CHECK (EXISTS (SELECT 1 FROM food f WHERE f.id = food_id AND f.created_by = app_current_user()))', t || '_write', t);
  END LOOP;
END $$;
ALTER TABLE food_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_component FORCE ROW LEVEL SECURITY;
CREATE POLICY food_component_read ON food_component FOR SELECT USING (EXISTS (SELECT 1 FROM food f WHERE f.id = parent_food_id));
CREATE POLICY food_component_write ON food_component FOR ALL
  USING (EXISTS (SELECT 1 FROM food f WHERE f.id = parent_food_id AND f.created_by = app_current_user()))
  WITH CHECK (EXISTS (SELECT 1 FROM food f WHERE f.id = parent_food_id AND f.created_by = app_current_user()));

-- ───────────────────────── auth lookups that must cross the RLS boundary ─────────────────────────
-- SECURITY DEFINER, narrow, returning only what authentication needs.
CREATE FUNCTION auth_find_user_by_email(p_email citext)
RETURNS TABLE (id uuid, password_hash text, failed_attempts int, locked_until timestamptz, totp_enabled bool)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, password_hash, failed_attempts, locked_until, totp_secret_enc IS NOT NULL
  FROM app_user WHERE email = p_email AND deleted_at IS NULL $$;

CREATE FUNCTION auth_single_user()
RETURNS TABLE (id uuid, password_hash text, failed_attempts int, locked_until timestamptz, totp_enabled bool, n_users bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.password_hash, u.failed_attempts, u.locked_until, u.totp_secret_enc IS NOT NULL,
         (SELECT count(*) FROM app_user WHERE deleted_at IS NULL)
  FROM app_user u WHERE u.deleted_at IS NULL ORDER BY u.created_at LIMIT 1 $$;

CREATE FUNCTION auth_count_users() RETURNS bigint
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT count(*) FROM app_user WHERE deleted_at IS NULL $$;

CREATE FUNCTION auth_record_attempt(p_user uuid, p_ok bool) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_ok THEN
    UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE id = p_user;
  ELSE
    UPDATE app_user SET failed_attempts = failed_attempts + 1,
      locked_until = CASE WHEN failed_attempts + 1 >= 5
        THEN now() + least(interval '15 minutes', interval '30 seconds' * power(2, failed_attempts + 1 - 5))
        ELSE locked_until END
    WHERE id = p_user;
  END IF;
END $$;

CREATE FUNCTION auth_create_user(p_email citext, p_hash text, p_display text, p_locale text, p_tz text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid;
BEGIN
  INSERT INTO app_user (email, password_hash, display_name, locale, timezone)
  VALUES (p_email, p_hash, p_display, coalesce(p_locale, 'he-IL'), coalesce(p_tz, 'Asia/Jerusalem'))
  RETURNING id INTO uid;
  RETURN uid;
END $$;

CREATE FUNCTION auth_find_session(p_hash bytea)
RETURNS TABLE (id uuid, user_id uuid, family_id uuid, expires_at timestamptz, rotated_at timestamptz, revoked_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at FROM auth_session WHERE token_hash = p_hash $$;

CREATE FUNCTION auth_find_reset(p_hash bytea)
RETURNS TABLE (user_id uuid, expires_at timestamptz, used_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id, expires_at, used_at FROM passphrase_reset WHERE token_hash = p_hash $$;

-- The background worker claims jobs across users; it then sets app.user_id per job.
CREATE FUNCTION job_claim(p_kinds text[], p_limit int)
RETURNS SETOF job LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE job SET status = 'running', attempts = attempts + 1
  WHERE id IN (SELECT id FROM job WHERE status = 'queued' AND run_after <= now()
               AND (p_kinds IS NULL OR kind = ANY(p_kinds))
               ORDER BY run_after FOR UPDATE SKIP LOCKED LIMIT p_limit)
  RETURNING * $$;

CREATE FUNCTION job_finish(p_id uuid, p_status text, p_result jsonb, p_error text, p_retry_at timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE job SET status = p_status, result = p_result, error = p_error,
    run_after = coalesce(p_retry_at, run_after),
    finished_at = CASE WHEN p_status IN ('done','failed') THEN now() ELSE NULL END
  WHERE id = p_id $$;

CREATE FUNCTION job_enqueue_system(p_kind text, p_payload jsonb, p_dedupe text, p_run_after timestamptz)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO job (kind, payload, dedupe_key, run_after) VALUES (p_kind, p_payload, p_dedupe, coalesce(p_run_after, now()))
  ON CONFLICT DO NOTHING $$;

CREATE FUNCTION job_users_with_activity(p_since interval)
RETURNS TABLE (user_id uuid, timezone text) LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, timezone FROM app_user WHERE deleted_at IS NULL $$;

-- ───────────────────────── 4. derived views ─────────────────────────
-- Tags resolve transitively through food_component (02 §12.1 rule 1), depth ≤ 3, each with `via`.
CREATE MATERIALIZED VIEW food_tag_resolved AS
WITH RECURSIVE walk(root_id, food_id, depth, path, frac) AS (
  SELECT f.id, f.id, 0, ARRAY[f.id], 1.0::numeric FROM food f
  UNION ALL
  SELECT w.root_id, fc.component_food_id, w.depth + 1, w.path || fc.component_food_id,
         w.frac * coalesce(fc.fraction, 0)
  FROM walk w JOIN food_component fc ON fc.parent_food_id = w.food_id
  WHERE w.depth < 3 AND NOT fc.component_food_id = ANY(w.path)
)
SELECT w.root_id AS food_id, ft.tag, min(w.depth) AS depth,
       (array_agg(w.food_id ORDER BY w.depth))[1] AS via_food_id,
       max(w.frac) AS max_fraction
FROM walk w JOIN food_tag ft ON ft.food_id = w.food_id
GROUP BY w.root_id, ft.tag;
CREATE UNIQUE INDEX ON food_tag_resolved (food_id, tag);

-- Exposure matrix: one row per (day, exposure) with dose. Reads only numeric/ID columns —
-- never the encrypted narrative layer (02 §9.3).
CREATE MATERIALIZED VIEW daily_exposure AS
SELECT o.user_id, o.local_day, 'food'::text AS kind, mi.food_id::text AS ref,
       sum(mi.grams_est) AS dose, count(*) AS n_items,
       min(o.occurred_at) AS first_at, max(o.occurred_at) AS last_at,
       min(o.time_precision) AS best_precision
FROM observation o JOIN meal_item mi ON mi.observation_id = o.id
WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL AND mi.food_id IS NOT NULL AND o.specificity <> 'unspecified'
GROUP BY 1,2,3,4
UNION ALL
SELECT o.user_id, o.local_day, 'tag', ftr.tag,
       sum(mi.grams_est * CASE WHEN ftr.depth = 0 THEN 1 ELSE ftr.max_fraction END), count(*),
       min(o.occurred_at), max(o.occurred_at), min(o.time_precision)
FROM observation o
JOIN meal_item mi ON mi.observation_id = o.id
JOIN food_tag_resolved ftr ON ftr.food_id = mi.food_id
WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL AND o.specificity <> 'unspecified'
GROUP BY 1,2,3,4
UNION ALL
SELECT o.user_id, o.local_day, 'nutrient', fn.nutrient,
       sum(fn.per_100g * mi.grams_est / 100.0), count(*), min(o.occurred_at), max(o.occurred_at), min(o.time_precision)
FROM observation o
JOIN meal_item mi   ON mi.observation_id = o.id
JOIN food_nutrient fn ON fn.food_id = mi.food_id
WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL AND o.specificity <> 'unspecified'
GROUP BY 1,2,3,4;
CREATE UNIQUE INDEX ON daily_exposure (user_id, kind, ref, local_day);

CREATE MATERIALIZED VIEW user_slot_time AS
SELECT o.user_id, v.value_text AS slot,
       (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (o.occurred_at AT TIME ZONE u.timezone)::time))
         || ' seconds')::interval AS median_time,
       count(*) AS n
FROM observation o
JOIN app_user u ON u.id = o.user_id
JOIN observation_value v ON v.observation_id = o.id AND v.field_key = 'slot'
WHERE o.tracker_key = 'meal' AND o.deleted_at IS NULL AND o.time_precision = 'exact'
GROUP BY o.user_id, v.value_text
HAVING count(*) >= 3;
CREATE UNIQUE INDEX ON user_slot_time (user_id, slot);

-- Matviews cannot carry RLS. They are owned by `foodtrack` and NOT granted to the app role;
-- the app reads them only through these security-barrier views scoped to app.user_id.
CREATE VIEW my_daily_exposure WITH (security_barrier) AS
  SELECT * FROM daily_exposure WHERE user_id = app_current_user();
CREATE VIEW my_slot_time WITH (security_barrier) AS
  SELECT * FROM user_slot_time WHERE user_id = app_current_user();
CREATE VIEW my_food_tag_resolved WITH (security_barrier) AS
  SELECT r.* FROM food_tag_resolved r WHERE EXISTS (SELECT 1 FROM food f WHERE f.id = r.food_id);

CREATE FUNCTION refresh_derived() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW food_tag_resolved;
  REFRESH MATERIALIZED VIEW daily_exposure;
  REFRESH MATERIALIZED VIEW user_slot_time;
END $$;

-- ───────────────────────── grants ─────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'foodtrack_app') THEN
    GRANT USAGE ON SCHEMA public TO foodtrack_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO foodtrack_app;
    REVOKE ALL ON daily_exposure, user_slot_time, food_tag_resolved FROM foodtrack_app;
    REVOKE INSERT, UPDATE, DELETE ON tracker_definition, tracker_definition_history, crypto_key FROM foodtrack_app;
    GRANT SELECT ON my_daily_exposure, my_slot_time, my_food_tag_resolved TO foodtrack_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO foodtrack_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO foodtrack_app;
  END IF;
END $$;
