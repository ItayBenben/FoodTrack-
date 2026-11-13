DROP FUNCTION IF EXISTS refresh_derived();
DROP VIEW IF EXISTS my_daily_exposure, my_slot_time, my_food_tag_resolved;
DROP MATERIALIZED VIEW IF EXISTS user_slot_time, daily_exposure, food_tag_resolved;
DROP FUNCTION IF EXISTS job_enqueue_system(text, jsonb, text, timestamptz), job_finish(uuid, text, jsonb, text, timestamptz), job_users_with_activity(interval), job_claim(text[], int), auth_find_reset(bytea),
  auth_find_session(bytea), auth_create_user(citext, text, text, text, text), auth_record_attempt(uuid, bool),
  auth_count_users(), auth_single_user(), auth_find_user_by_email(citext);
DROP TABLE IF EXISTS crypto_key, event_marker, transit_measurement, inbox_item, avoid_entry, reminder_pref,
  push_subscription, job, change_log, sync_cursor, safety_flag, trial_period_guess, trial_day, trial,
  insight_dismissal, association, analysis_run, meal_item, user_food_alias, user_food, food_component,
  food_tag, food_nutrient, food, observation_revision, observation_value, observation, media,
  security_audit, passphrase_reset, auth_session, user_tracker, user_tracker_definition,
  tracker_definition_history, tracker_definition, user_profile, app_user CASCADE;
DROP FUNCTION IF EXISTS trial_hypothesis_immutable(), food_component_guard(), food_tag_no_contradiction(), app_current_user();
