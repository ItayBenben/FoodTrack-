"""Loads one user's data from Postgres AS THE APP ROLE with app.user_id set per transaction (06 §5):
the analysis service is not exempt from RLS just because it is internal. It reads numbers, ids,
tags and timestamps only — never the encrypted narrative layer (02 §9.3)."""
from __future__ import annotations
import json
from datetime import date
import psycopg
from .config import config_dir, tracker_definitions
from .model import Dataset, Meal, Obs


def tag_labels() -> dict:
    return json.loads((config_dir() / "food-tags" / "tag-labels.json").read_text())


def load_user(dsn: str, user_id: str, frm: date | None = None, to: date | None = None) -> Dataset:
    with psycopg.connect(dsn) as conn, conn.transaction():
        cur = conn.cursor()
        cur.execute("SELECT set_config('app.user_id', %s, true)", (user_id,))
        cur.execute("SELECT timezone, day_rollover::text FROM app_user WHERE id = app_current_user()")
        row = cur.fetchone()
        if not row:
            raise LookupError("no such user")
        tz, rollover = row
        defs = dict(tracker_definitions())
        cur.execute("SELECT key, definition FROM user_tracker_definition WHERE deleted_at IS NULL")
        for k, d in cur.fetchall():
            defs[k] = d
        meal_trackers = [k for k, d in defs.items() if d.get("has_meal_items")]
        where = "o.deleted_at IS NULL" + (" AND o.local_day >= %(frm)s" if frm else "") + (" AND o.local_day <= %(to)s" if to else "")
        params = {"frm": frm, "to": to, "meal": meal_trackers}
        cur.execute(f"""SELECT o.id, o.tracker_key, o.occurred_at, o.local_day, o.time_precision,
                   coalesce(json_object_agg(v.field_key, coalesce(to_jsonb(v.value_num), to_jsonb(v.value_text), to_jsonb(v.value_bool), v.value_json, to_jsonb(v.value_ts)))
                            FILTER (WHERE v.field_key IS NOT NULL AND v.value_enc IS NULL), '{{}}')
            FROM observation o LEFT JOIN observation_value v ON v.observation_id = o.id
            WHERE {where} AND NOT (o.tracker_key = ANY(%(meal)s)) GROUP BY o.id""", params)
        obs = [Obs(t, at, d, p, vals if isinstance(vals, dict) else json.loads(vals)) for _, t, at, d, p, vals in cur.fetchall()]
        cur.execute(f"""SELECT o.id, o.occurred_at, o.local_day, o.time_precision, o.specificity,
                   (SELECT v.value_text FROM observation_value v WHERE v.observation_id = o.id AND v.field_key = 'slot'),
                   coalesce(json_agg(json_build_array(mi.food_id, mi.grams_est)) FILTER (WHERE mi.food_id IS NOT NULL), '[]')
            FROM observation o LEFT JOIN meal_item mi ON mi.observation_id = o.id
            WHERE {where} AND o.tracker_key = ANY(%(meal)s) GROUP BY o.id""", params)
        meal_rows = cur.fetchall()
        food_ids = sorted({f for r in meal_rows for f, _ in r[6]})
        tags: dict[str, list[tuple[str, int, float | None]]] = {}
        nutr: dict[str, dict[str, float]] = {}
        names: dict[str, dict] = {}
        if food_ids:
            cur.execute("SELECT food_id::text, tag, depth, max_fraction FROM my_food_tag_resolved WHERE food_id = ANY(%s::uuid[])", (food_ids,))
            for fid, tag, depth, frac in cur.fetchall():
                tags.setdefault(fid, []).append((tag, depth, frac))
            cur.execute("SELECT food_id::text, nutrient, per_100g FROM food_nutrient WHERE food_id = ANY(%s::uuid[])", (food_ids,))
            for fid, n, v in cur.fetchall():
                nutr.setdefault(fid, {})[n] = float(v)
            cur.execute("SELECT id::text, canonical_name, names_i18n FROM food WHERE id = ANY(%s::uuid[])", (food_ids,))
            for fid, cn, ni in cur.fetchall():
                names[fid] = {"en": cn, "he": (ni.get("he") or [cn])[0]}
        meals = []
        for _, at, d, p, spec, slot, items in meal_rows:
            m = Meal(at, d, p, [(f, g) for f, g in items], {}, {}, spec, slot)
            for f, g in m.foods:
                for tag, depth, frac in tags.get(f, []):
                    dose = (g or 0.0) * (1.0 if depth == 0 else float(frac or 0))
                    m.tags[tag] = m.tags.get(tag, 0.0) + dose
                for n, per in nutr.get(f, {}).items():
                    if g:
                        m.nutrients[n] = m.nutrients.get(n, 0.0) + per * g / 100
            meals.append(m)
        cur.execute("SELECT hours FROM transit_measurement WHERE NOT abandoned AND hours IS NOT NULL")
        transit = [float(h) for (h,) in cur.fetchall()]
    tl = tag_labels()
    labels = {f"food:{k}": v for k, v in names.items()}
    labels |= {f"tag:{k}": v for k, v in tl.items() if not k.startswith("_")}
    labels |= {f"meta:{k}": v for k, v in tl["_meta"].items() if k in ("late_meal", "large_meal")}
    labels |= {f"nutrient:{k}": v for k, v in tl["_meta"].items()}
    return Dataset(tz, rollover, defs, obs, meals, labels, transit_hours=transit)
