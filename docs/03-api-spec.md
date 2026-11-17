# FoodTrack — API Specification

Version 1.3 · REST over HTTPS, JSON · 2026-08-21

Base path: `/api/v1`. All endpoints require authentication except `/auth/*` and `/health`.
Transport-agnostic by design (D2a): a future native client uses these endpoints unchanged.

---

## 1. Conventions

- **Auth:** `Authorization: Bearer <access_token>` (JWT, 15 min) + rotating refresh token in an `HttpOnly; Secure; SameSite=Strict` cookie. Single-user mode still issues real tokens — no bypass path exists.
- **Idempotency:** every write accepts `Idempotency-Key` (or `client_id` inside the body for sync).
- **Errors:** RFC 9457 problem+json.
  ```json
  { "type": "https://foodtrack/errors/validation",
    "title": "Invalid observation",
    "status": 422,
    "detail": "field 'bristol' is required for tracker 'stool'",
    "errors": [{ "path": "values.bristol", "code": "required" }] }
  ```
- **Pagination:** cursor-based. `?limit=50&cursor=<opaque>` → `{ "data": [...], "next_cursor": "..." }`.
- **Time:** all timestamps RFC 3339 with offset. `local_day` is `YYYY-MM-DD` and is always server-computed.
- **Rate limits:** 600 req/min/user general; 30/min for LLM-backed endpoints; 10/min for analysis runs.
- **Versioning:** breaking changes ship at `/api/v2`. `X-API-Version` in every response.

---

## 2. Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Multi-user mode only. `{email, password}` → user + tokens. |
| POST | `/auth/login` | `{email, password}` → tokens. Argon2id verify, constant-time. |
| POST | `/auth/unlock` | Single-user mode. `{passphrase}` → tokens. |
| POST | `/auth/refresh` | Rotates the refresh token; old token is invalidated (reuse detection revokes the whole token family). |
| POST | `/auth/logout` | Revokes the refresh token family. |
| GET | `/auth/me` | Current user + profile + enabled trackers. |

Lockout: 5 failed attempts → exponential backoff starting at 30 s, capped at 15 min, per account and per IP.

---

## 3. Trackers & config

| Method | Path | Purpose |
|---|---|---|
| GET | `/trackers` | All registered definitions, with `content_hash`. Cacheable; ETag. |
| GET | `/trackers/{key}` | One definition. |
| GET | `/me/trackers` | The user's enabled trackers + per-user settings + sort order. |
| PUT | `/me/trackers` | Bulk enable/disable/reorder. `[{tracker_key, enabled, sort_order, settings}]` |
| GET | `/packs` | Available goal packs (Gut Health, Body, Energy). |
| POST | `/me/packs/{key}/apply` | Enables that pack's trackers, non-destructively. |

**Client behaviour:** definitions are fetched once, cached in IndexedDB keyed by `content_hash`, and revalidated on app start. The UI renders entirely from these definitions — there is no hard-coded form anywhere.

---

## 4. Observations

### `POST /observations`
```jsonc
{
  "client_id": "01J8Z...-device-abc",       // idempotency
  "tracker_key": "stool",
  "occurred_at": "2026-08-21T09:14:00+03:00",
  "source": "manual",
  "note": null,
  "values": {                                // keys validated against the definition
    "bristol": 6,
    "urgency": 3,
    "blood": false
  }
}
```
→ `201` with the full stored observation, including `local_day`, `id`, `revision`, and any `safety_flags` raised.

### Other endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/observations` | Filter by `tracker_key`, `from`, `to`, `limit`, `cursor`. |
| GET | `/observations/{id}` | Single, with values, meal items and media URLs. |
| PATCH | `/observations/{id}` | Partial update; bumps `revision`, writes `observation_revision`. |
| DELETE | `/observations/{id}` | Soft delete (`deleted_at`). Recoverable for 30 days. |
| POST | `/observations/bulk` | Array form of create, for import and offline drain. |
| GET | `/timeline` | Merged chronological feed across all trackers. `?from&to`. The Home/Timeline screen's only data call. |
| GET | `/days/{date}` | Everything for one local day: observations, rollup, trial context, insights. |
| GET | `/days` | Rollups for a range: `?from&to` → daily scores, symptom load, completeness. |

---

## 5. Meals & food

### `POST /meals/parse` — the core AI endpoint

```jsonc
// request
{
  "text": "פיתה עם חומוס, סלט ירקות וקפה הפוך",
  "locale": "he-IL",
  "occurred_at": "2026-08-21T13:05:00+03:00",
  "context": { "recent_foods": ["uuid1","uuid2"], "meal_slot": "lunch" }
}
```
```jsonc
// response — streamed as SSE, also available non-streamed
{
  "items": [
    { "raw_text": "פיתה",       "food_id": "…", "canonical_name": "Pita bread",
      "quantity": 1, "unit": "unit", "grams_est": 60, "confidence": 0.95, "resolved_by": "library" },
    { "raw_text": "חומוס",      "food_id": "…", "canonical_name": "Hummus",
      "quantity": 3, "unit": "tbsp", "grams_est": 45, "confidence": 0.91, "resolved_by": "llm" },
    { "raw_text": "סלט ירקות",  "food_id": "…", "canonical_name": "Mixed vegetable salad",
      "quantity": 1, "unit": "bowl", "grams_est": 150, "confidence": 0.78, "resolved_by": "llm" },
    { "raw_text": "קפה הפוך",   "food_id": "…", "canonical_name": "Coffee with milk",
      "quantity": 1, "unit": "cup", "grams_est": 200, "confidence": 0.88, "resolved_by": "library" }
  ],
  "unresolved": [],
  "model": "provider:model@version",
  "prompt_version": "meal-parse-v3"
}
```

**Parsing pipeline (server-side), in order — the LLM is the *last* resort, not the first:**

1. **Normalise** — trim, lowercase where script allows, strip filler ("קצת", "a bit of", "ate", "אכלתי").
2. **Personal library lookup** — exact and fuzzy (trigram) match against `user_food.alias`. Hits here are free, instant and the most accurate. After a few weeks this handles the majority of entries.
3. **Canonical food lookup** — trigram + `names_i18n` GIN search over `food`.
4. **LLM structuring** — only the residual text goes to the model, with the candidate matches supplied as context so it picks an existing food ID rather than inventing one.
5. **Portion resolution** — user median → food default → LLM estimate, in that order of preference.
6. **Persist** — new foods created with `source='llm'`, `is_verified=false`, so they can be reviewed and merged later.

**Never-block rule:** if step 4 fails or times out (default 8 s), the endpoint returns whatever steps 1–3 produced with `"degraded": true`, and a background job retries. The client saves regardless.

| Method | Path | Purpose |
|---|---|---|
| POST | `/meals` | Create a meal observation with items (already parsed or raw). |
| POST | `/meals/parse` | Text → structured items (above). |
| POST | `/meals/parse-photo` | `multipart` image → items. Returns `media_id` immediately, items when ready. |
| PATCH | `/meals/{id}/items/{itemId}` | Correct a parsed item. **Corrections train the personal library.** |
| GET | `/meals/favorites` | Top-N by frequency, time-of-day weighted, for the quick-repeat tiles. |
| POST | `/meals/{id}/repeat` | Clone a past meal to now. One request, one tap. |
| GET | `/foods/search` | `?q=&locale=` — library first, then canonical, then external. |
| POST | `/foods` | Create a personal food. |
| PATCH | `/foods/{id}` | Edit name/aliases/nutrients/tags for a user-created food. |
| POST | `/foods/{id}/merge` | Merge a duplicate into a canonical food; rewrites `meal_item.food_id`. |
| GET | `/foods/{id}` | Food with nutrients and tags. |

---

## 6. Analysis

| Method | Path | Purpose |
|---|---|---|
| POST | `/analysis/run` | Kicks off a run. `{from, to, outcomes: ["stool.any_abnormal"], min_n: 10}` → `202 {run_id}` |
| GET | `/analysis/runs/{id}` | Status + summary. |
| GET | `/insights` | Ranked associations for the user. `?confidence=medium,high&outcome=` |
| GET | `/insights/{id}` | Full evidence card, including the day-level data behind it. |
| GET | `/insights/{id}/days` | The exact exposed/unexposed days, so any claim can be audited. |
| POST | `/insights/{id}/dismiss` | "Not interested" — excluded from future ranking, kept in data. |
| POST | `/insights/{id}/narrative` | (Re)generate the plain-language explanation. |
| GET | `/scores/daily` | `?from&to` → the 0–100 gut-day score with its components. |

### Insight response shape

```jsonc
{
  "id": "…",
  "exposure": { "kind": "tag", "ref": "contains_lactose",
                "label": { "en": "Dairy (lactose)", "he": "מוצרי חלב (לקטוז)" } },
  "outcome":  { "ref": "stool.any_abnormal",
                "label": { "en": "Abnormal stool (Bristol 1–2 or 6–7)", "he": "יציאה חריגה" } },
  "lag_window_hours": [6, 24],
  "evidence": {
    "n_exposed_days": 41, "n_unexposed_days": 57,
    "rate_exposed": 0.44, "rate_unexposed": 0.19,
    "effect_type": "risk_difference", "effect": 0.25,
    "ci": [0.09, 0.41], "p_value": 0.004, "q_value": 0.031,
    "adjusted_for": ["sleep_lt_6h", "alcohol", "stress_high", "nsaid"],
    "warnings": [
      { "code": "weekday_imbalance",
        "detail": { "en": "8 of 12 exposure days were weekends", "he": "..." } }
    ]
  },
  "confidence": "medium",
  "narrative": { "en": "…", "he": "…" },
  "actions": [ { "type": "start_trial", "trial_template_id": "…" } ]
}
```

---

## 7. Trials

| Method | Path | Purpose |
|---|---|---|
| POST | `/trials/propose` | From an insight or a manual target → a proposed design, not yet started. |
| POST | `/trials` | Create/start a trial from a proposal (optionally edited). |
| GET | `/trials` | List with status. |
| GET | `/trials/{id}` | Full state: phases, day grid, adherence, live estimate. |
| POST | `/trials/{id}/pause` · `/resume` · `/abandon` | Lifecycle. Abandon records a reason. |
| POST | `/trials/{id}/days/{date}` | Manual adherence override / slip logging. |
| GET | `/trials/{id}/verdict` | Final analysis. `409` if not complete. |
| GET | `/trials/{id}/exposures` | Auto-detected exposures during elimination, with the meals that caused them. |

**Automatic exposure detection:** on every meal write during an active trial, the server checks whether any item resolves to the trial target (directly, by tag, or by a nutrient threshold). If so it writes `trial_day.exposure_detected = true` and pushes a non-blocking prompt to the client.

---

## 8. Sync

### `POST /sync/push`
```jsonc
{ "device_id": "dev_abc",
  "mutations": [
    { "client_id": "…", "entity": "observation", "op": "upsert",
      "base_revision": 2, "payload": { … } },
    { "client_id": "…", "entity": "observation", "op": "delete", "entity_id": "…" }
  ] }
```
→
```jsonc
{ "applied": [ { "client_id": "…", "entity_id": "…", "revision": 3 } ],
  "conflicts": [ { "client_id": "…", "resolution": "server_wins_field",
                   "fields": ["note"], "server_state": { … } } ],
  "rejected": [ { "client_id": "…", "reason": "validation", "detail": "…" } ],
  "new_seq": 84213 }
```

### `GET /sync/pull?since=<seq>&limit=500`
→ `{ "changes": [ { "seq":…, "entity":…, "op":…, "payload":… } ], "next_seq": …, "has_more": false }`

**Rules**
- Push is transactional per mutation, not per batch — one bad row never blocks the rest. This includes schema validation: the envelope is checked as a whole, each mutation on its own, and a malformed one comes back in `rejected` (`reason: "validation"`, the failing path in `detail`) instead of a `422` for the batch.
- `occurred_at` must carry a zone (`Z` or an offset). Clients send a full ISO instant; a time picked without a zone is device-local.
- Conflict resolution is per field, last-write-wins by `recorded_at`, with `device_id` as a deterministic tiebreak. The losing value is preserved in `observation_revision`.
- A client that has been offline longer than the `change_log` retention (90 days) receives `410 Gone` and performs a full resync.
- Media upload is separate: `POST /media` returns a presigned PUT URL; the observation references `media_id` and tolerates the blob arriving later.

---

## 9. Export, import, account

| Method | Path | Purpose |
|---|---|---|
| POST | `/export` | `{format: "json"\|"csv"\|"pdf_clinical", from, to}` → `202 {job_id}` |
| GET | `/export/{job_id}` | Status, then a signed download URL (expires 1 h). |
| POST | `/import` | Upload an export archive. Dry-run mode reports what would change. |
| DELETE | `/me` | Hard delete. Requires re-auth + typed confirmation string. |
| GET | `/me/settings` · PUT | Locale, timezone, day rollover, units, reminders, LLM provider, quiet hours. |

**Clinical PDF export** contains: date range, Bristol type distribution, stool frequency/week, symptom severity trend, IBS-SSS-style computed score with its five components, weight trend, medication timeline, red-flag events, and a food-diary appendix. Two pages plus appendix. No AI narrative — clinicians want the numbers.

---

## 10. LLM provider interface

The single seam that keeps D4 honest. Everything AI-touched goes through this.

```ts
export interface LLMProvider {
  readonly id: string;                       // 'anthropic' | 'openai-compat' | 'ollama'
  readonly dataEgress: 'remote' | 'local';   // surfaced in the UI, verbatim
  readonly capabilities: { text: boolean; vision: boolean; streaming: boolean };

  parseMeal(input: MealParseInput): Promise<MealParseResult>;
  parsePhoto(input: PhotoParseInput): Promise<MealParseResult>;   // requires capabilities.vision
  narrate(input: NarrateInput): Promise<LocalizedText>;
  classifyFood(input: FoodClassifyInput): Promise<FoodTags>;
}
```

**Hard constraints on the narrative call.** This is where health apps go wrong, so it is constrained at the interface level:

- Input is **numbers already computed by the statistics engine** — never raw observations, never a symptom diary.
- The prompt forbids inventing figures. Every number in the output must appear in the input payload; a post-generation validator extracts numerals from the output and rejects the response if any is absent from the input. On rejection, fall back to a deterministic template sentence.
- The prompt forbids causal and diagnostic language; output passes the same forbidden-phrase lint as static copy.
- Output is `{en, he}` and is stored with `narrative_model` and `prompt_version` for reproducibility (X7).

**Provider config** (`config/llm.json`):
```jsonc
{
  "text":   { "provider": "anthropic", "model": "<model-id>", "timeout_ms": 8000 },
  "vision": { "provider": "anthropic", "model": "<model-id>", "enabled": false },
  "narrative": { "provider": "ollama", "endpoint": "http://ollama:11434", "model": "<local-model>" },
  "fallback_order": ["anthropic", "ollama", "deterministic"]
}
```
`deterministic` is a real, always-available provider that produces template-based output with no model. The app must be fully usable with it — degraded, never broken.

---

## 11. Realtime

Server-Sent Events at `/events` (auth via short-lived token in the query string):

| Event | Payload |
|---|---|
| `parse.completed` | `{observation_id, items}` — a queued parse finished |
| `analysis.completed` | `{run_id, new_insights: n}` |
| `trial.phase_changed` | `{trial_id, phase, message}` |
| `safety.flag_raised` | `{flag_id, rule_key}` |
| `sync.hint` | `{new_seq}` — another device wrote something |

SSE, not WebSocket: the traffic is one-directional, it survives proxies better, and it reconnects for free.

---

## 12. Health & ops

| Path | Purpose |
|---|---|
| `GET /health` | Liveness. No auth. |
| `GET /health/ready` | DB, object store, job queue, LLM provider reachability. |
| `GET /metrics` | Prometheus. Bound to the internal network only. |

Key metrics to expose from day one: `meal_parse_duration_seconds`, `meal_parse_degraded_total`, `observation_write_duration_seconds`, `sync_conflicts_total`, `analysis_run_duration_seconds`, `llm_tokens_total{provider,purpose}`, `outbox_depth`.

---

## 13. Addendum v1.1 — endpoints required by the flow spec

The completeness audit found UI with no API behind it, and API with no UI in front of it. Both are fixed here.

### 13.1 Endpoints that were missing

| Method | Path | Purpose | Fixes |
|---|---|---|---|
| POST | `/safety-flags/{id}/acknowledge` | Sets `acknowledged_at`, starts the 7-day suppression | `safety_flag.acknowledged_at` existed with no way to write it |
| GET | `/safety-flags` | Active and recent flags, for the inbox and the export | — |
| POST | `/push/subscribe` | `{endpoint, keys:{p256dh,auth}, device_label}` | Reminders could not reach a closed app (D16) |
| DELETE | `/push/subscribe` | Unsubscribe this device | — |
| GET | `/push/vapid-key` | Public VAPID key for the client | — |
| GET · PUT | `/me/reminders` | Per-kind reminder prefs, quiet hours, global pause | The Reminders screen had nothing to read |
| POST | `/me/trackers/custom` | Create a user-authored tracker definition (D15) | Users could not create trackers despite the UI implying it |
| PATCH · DELETE | `/me/trackers/custom/{key}` | Edit (version-bumping) or remove | — |
| POST | `/me/packs/{key}/remove` | Inverse of apply | Packs could be applied but never removed |
| GET | `/me/packs` | Which pack is active and what it contains | — |
| GET · POST | `/avoid` | List / add an avoid entry (D17) | Verdict card's button pointed at nothing |
| DELETE | `/avoid/{id}` | Remove | — |
| GET | `/trials` | Already specified; now has a consuming screen (S85) | — |
| POST | `/trials/{id}/stop-early` | Ends the trial and produces a partial verdict (D19) | Early stop had no status or endpoint |
| GET | `/charts/{key}` | Series data for the Trends screen | U6 had no data source |
| GET | `/scores/{date}/breakdown` | Component-level score explanation | The tap-to-explain had no payload |
| POST | `/analyze/power` | Already in the analysis service; now surfaced through the API for the "N more days" line | The number was not derivable |
| GET | `/insights/{id}/compare/{runId}` | This run vs. a superseded one | — |
| POST | `/observations/{id}/split` · `/merge` | Split a meal, merge two (`08` §5.4) | A mis-parse was unfixable |
| GET | `/observations/deleted` | Recently deleted, 30 days | The soft-delete window was unreachable by the user |
| POST | `/observations/{id}/restore` | Undelete | — |
| GET | `/inbox` · POST `/inbox/{id}/read` | The in-app notification centre (`08` §12.4) | Red flags are never pushed, so they needed a home |

### 13.2 SSE additions

| Event | Payload |
|---|---|
| `export.completed` | `{job_id, url, format}` — the user may have navigated away |
| `import.progress` | `{done, total}` |
| `media.upload_failed` | `{media_id, observation_id}` — surfaces the permanently-failed photo |
| `insight.superseded` | `{association_id, superseded_by}` |

### 13.3 Behaviour clarifications the audit demanded

- **`POST /meals/{id}/repeat` returns a draft, it does not save.** The one-tap instant save is the Today quick-repeat tile, which posts a normal `/meals` create. Two different behaviours, two different controls (`08` §4.5).
- **`PATCH /meals/{id}/items/{itemId}` also upserts `user_food`** with the corrected alias and quantity. This is the learning loop; without it the personal library never improves.
- **`POST /analysis/run` is idempotent while a run is in flight** — a second call returns `200` with the in-flight `run_id` rather than queueing another.
- **`POST /trials/propose` refuses with `409` and a machine-readable `reason`** (`active_trial_exists` · `elimination_cap` · `avoid_list_recent`) so the client can show the right guardrail sheet (S83/S84) rather than a generic error.
- **`POST /import` is idempotent on `client_id`** and runs in a single transaction; a cancel rolls the whole thing back.
- **Every list endpoint returns an explicit `total`** so empty states can distinguish "none" from "none *yet*".

### 13.4 Auth additions

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/change-passphrase` | Current + new; revokes all other sessions |
| GET · DELETE | `/auth/sessions` | List and revoke individual sessions |
| POST | `/auth/totp/enroll` · `/verify` · `/disable` | 2FA, with 10 single-use recovery codes |
| POST | `/auth/reset-passphrase` | **Server-side only** — reachable from `localhost`/the Docker network, never from the public interface. Issues a single-use, 15-minute token that lets the holder set a new passphrase. Invoked by the `pnpm reset-passphrase` CLI. **No data is touched.** |
| POST | `/auth/reset-passphrase/{token}` | Consume the token, set the new passphrase, revoke all sessions. |


---

## 14. Addendum v1.3 — encryption status endpoints (D28)

| Method | Path | Purpose |
|---|---|---|
| GET | `/security/status` | `{encryption: "on", alg, created_at, rotated_at, checksum, fields_encrypted: [...]}` — drives the Security screen. Never returns key material. |
| POST | `/security/recovery-card` | Reprints the recovery card. **Requires re-authentication**, is rate-limited to 3/hour, and writes an audit row every time. Returns the card as text, never as a downloadable file the browser might cache. |
| POST | `/security/verify-card` | Body is a pasted card; returns `{valid: true|false}` by checking it unwraps the live DEK. Confirms a backup is real without revealing anything. |
| GET | `/security/audit` | When the card was last shown or verified, and from where. |

Key **rotation is CLI-only** (`06` §5.4) and has no HTTP surface at all. Anything that can rotate a key can destroy the data, so it does not get an endpoint that a session hijack could reach.


---

## 15. Addendum v1.5 — clarification (D29)

| Method | Path | Purpose |
|---|---|---|
| GET | `/meals/suggestions?at=<rfc3339>&exclude=<food_ids>` | Up to 3 foods the user has most often logged in a ±90-minute window around `at`, each with `times_logged`. **Computed from the user's own history by SQL; no model call.** Returns `[]` when fewer than 3 qualify, which is the signal for the client to show the hint variant instead. |

`POST /meals` and `POST /observations` accept `specificity` (`resolved` \| `partial` \| `unspecified`). The server recomputes it from the resolved items and **overrides** a client value that disagrees — a client cannot mark an empty meal `resolved`, deliberately, because that flag governs whether the entry reaches the analysis.

`POST /meals/parse` gains `"tier": 1 | 2 | 3` in its response so the client knows which of the three behaviours in `08` §4.3b to run, without re-deriving the rule from the item list.


---

## 16. Addendum v1.6 — the day builder (D30, D31)

| Method | Path | Purpose |
|---|---|---|
| GET | `/days/{date}/builder` | Everything the day-builder screen needs in one call: existing observations grouped by slot, the user's slot medians with their `n`, what is missing from the day, and the current `day_weight` with its components. One request, one render. |
| POST | `/days/{date}/builder` | Bulk upsert. Body is the slot array below. Creates, updates and deletes in a single transaction, returns a `batch_id`. |
| POST | `/observations/{id}/move` | `{to_date}` — moves an entry to another day. Recomputes `local_day`, invalidates both days' rollups, and re-evaluates any covering `trial_day`. |
| POST | `/days/{date}/copy` | `{to_date, scope: "meals" \| "all"}` |
| DELETE | `/batches/{batch_id}` | Undo a whole day-builder save. |
| GET | `/me/slot-times` | The user's slot medians, for prefilling offline. Cached client-side. |

```jsonc
// POST /days/2026-08-21/builder
{
  "slots": [
    { "slot": "breakfast", "observation_id": null,
      "text": "קפה עם חלב, טוסט עם אבוקדו",
      "occurred_at": "2026-08-21T08:10:00+03:00", "time_source": "slot_median" },
    { "slot": "lunch", "observation_id": "01J8...",      // existing → update
      "text": "פיתה עם חומוס וסלט",
      "occurred_at": "2026-08-21T13:20:00+03:00", "time_source": "user_set" },
    { "slot": "dinner", "observation_id": "01J9...", "text": "" }   // emptied → delete
  ]
}
```

**Server rules, all non-negotiable:**

- `time_precision` is **derived from `time_source` and the recording delay**, and a client-supplied value is ignored. The client cannot mark an estimate as exact.
- An empty `text` on an existing `observation_id` is a **soft delete**, and it joins the batch so one undo reverses the whole save.
- Parsing is queued per slot, not inline — the response returns immediately with the observations created, and `parse.completed` fires per slot. A day builder save must not wait on four model calls.
- The whole thing is one transaction. A failure on slot three leaves slots one and two unwritten, because a half-saved day is worse than an unsaved one.

### 16.1 Multi-line distribution

`POST /meals/parse-multiline` takes a blob and returns a slot assignment **without creating anything** — the client shows the proposed distribution and the user confirms. Recognised, in order: an explicit slot label (`בוקר:` / `Breakfast:`), a leading time (`13:00 …`), then bare lines filling empty slots in order.

---

## 17. Addendum v1.7 — endpoints for D32–D46

### 17.1 Blinded challenge (D32)

```
POST /trials/propose            → body may now carry {"preferred_design": "D"}
```

The proposal response gains a `blinding` block. It is **advisory on the proposal and binding once the trial starts**:

```jsonc
"blinding": {
  "available": true,                      // false → the target has no isolated-compound form
  "agent": "lactose_powder",
  "control": "glucose_powder",
  "vehicle": "capsule",                   // capsule | powder_in_water | food_matrix
  "prep_guide_key": "blinding.prep.capsule",
  "unavailable_reason": null              // "no_isolated_form" | "dose_unknown"
}
```

`available: false` is **not an error and never blocks the trial** — it downgrades the proposal to Design A–C and the client must show the open-label banner. A user must never be stuck because their suspect food is a vegetable.

| Method | Path | Notes |
|---|---|---|
| POST | `/trials/{id}/allocation` | Generates the sealed sequence. Returns **only** `{n_periods, sealed: true, sealed_at}` — never the sequence itself. Idempotent; a second call returns the existing allocation. `409` once `started_at` is set. |
| GET | `/trials/{id}/schedule` | Per-period **envelope labels only** (`A1`, `A2`, …) plus dates. Contains no arm information. This is what the packing screen prints. |
| POST | `/trials/{id}/reveal` | Unseals. Allowed only when every period is complete or the trial is abandoned. Sets `revealed_at`. **Irreversible.** |
| GET | `/trials/{id}/verdict` | Unchanged path; `409` if `design = 'D'` and `revealed_at` is null. |

**Three server rules, all testable:**

- `trial.allocation_key` is excluded from `/sync/pull` by an explicit **column allowlist**, not by omission. Add a test that fails if the column name appears anywhere in a sync payload.
- Any endpoint returning trial state filters period arms until `revealed_at` is set. The filter lives in one serializer, not at each call site.
- `POST /trials/{id}/reveal` is rate-limited to one call per trial and audit-logged with the actor.

### 17.2 Blinding guess (D33)

| Method | Path | Notes |
|---|---|---|
| POST | `/trials/{id}/periods/{index}/guess` | `{guess: "active"\|"control"\|"no_idea", confidence: 1–5}`. Accepted only after the period ends and before `revealed_at`. `409` outside that window — a guess entered after the reveal is worthless and must not be recorded. |
| GET | `/trials/{id}/blinding-report` | `{break_blind_rate, chance_baseline, n_periods_guessed, by_guess: {...}, by_allocation: {...}, diverges: bool}`. |

`diverges` is computed server-side against a configured threshold so the client never decides whether to show the divergence warning.

Asked for **every** design. In an open-label trial it is the expectation-effect measurement, and `06`'s copy lint must not let the guess prompt be skipped for Designs A–C.

### 17.3 Washout (D37)

| Method | Path | Notes |
|---|---|---|
| GET | `/trials/{id}/washout-status` | `{gate_met: bool, current_value, baseline_value, delta, days_elapsed, days_cap, recommendation}` where recommendation ∈ `wait` · `proceed` · `extend` · `review`. |
| POST | `/trials/{id}/washout/override` | User proceeds despite an unmet gate. Requires `{reason}`, and the override is recorded as a **protocol deviation** surfaced in the trial report (D44). |

The daily trial job evaluates the gate and, on `recommendation: review` (the 10-day cap), pushes `trial.washout_stalled`. It never advances the phase on its own.

### 17.4 Transit measurement (D36)

| Method | Path | Notes |
|---|---|---|
| POST | `/transit` | `{ingested_at, marker}` → starts a measurement. `409` if one is already open. |
| PATCH | `/transit/{id}` | `{first_seen_at}` closes it, or `{abandoned: true, note}`. |
| GET | `/transit` | List plus `{median_hours, n, population_median_hours, applied_to_lags: bool}`. |

`applied_to_lags` is false until three non-abandoned measurements exist (`04` §4.1). The client shows "2 of 3 measurements — still using the population default" rather than implying personalisation it does not have.

An open measurement older than 96 h is auto-abandoned by the daily job with `note: "auto_expired"`, because a marker never seen is a marker missed, not a 5-day transit.

### 17.5 Event markers (D41)

| Method | Path | Notes |
|---|---|---|
| POST · PATCH · DELETE | `/events` · `/events/{id}` | `label` is encrypted at the application layer (`06` §5.3) like every other narrative field. |
| GET | `/events?from=&to=` | Overlapping markers for a range. Included in `GET /days/{date}` so the day view can show them. |

Insight and verdict payloads gain `overlapping_events: [{id, kind, days_overlapping}]`. Where the array is non-empty the evidence card says so; it does not silently adjust the estimate.

### 17.6 Food components (D34)

| Method | Path | Notes |
|---|---|---|
| GET | `/foods/{id}/components` | The resolved graph, depth-capped at 3. Returns `{components: [...], depth, has_cycle: false}`. |
| PUT | `/foods/{id}/components` | Replace the component set. User-authored foods only — a cycle or depth > 3 is rejected `422` with the offending path. |
| GET | `/foods/{id}/tags?resolve=transitive` | Tags including those inherited from components, each carrying `via: [food_id]` so the UI can explain *why* a dish counts as a fructan exposure. |

`via` is the difference between a user trusting the tag and disputing it. Never return an inherited tag without it.

### 17.7 Portion precision (D35)

`meal_item` payloads gain `portion_precision`. The parser sets `estimated` by default and `unspecified` when it could not infer a quantity at all — it **never** sets `weighed` or `measured`, which only a user action can produce.

### 17.8 Trial report (D44)

| Method | Path | Notes |
|---|---|---|
| GET | `/trials/{id}/report` | The report as data: `{trial, preregistration, schedule, sequence, days, washout, deviations, adverse_events, verdict}`. `409 not_complete` while the trial runs; `409 not_revealed` for a blinded trial before the reveal (the report names each period's arm). The web app renders it at `/report/trial?id=` and the browser prints it to PDF (impl-notes I-31). |

- `preregistration` is the frozen `hypothesis` exactly as stored, including `power` (the simulated power from the proposal, `null` for trials created before it was recorded).
- `sequence` is what was actually completed: consecutive runs of `trial_day` before the day the trial ended, with logged / followed / slipped / excluded counts. `schedule` is the plan as run (after pauses and slip extensions).
- `adverse_events` are the safety flags raised between start and end. `deviations` are the trial's recorded deviations, plus the abandonment and its reason.

The report is generated from the frozen pre-registration plus the observed data — **never** from current spec defaults, or a trial run under older settings would be reported under newer ones.
