"""In-memory dataset for one user, and everything the engine derives from tracker DEFINITIONS.
No tracker key is named here (CLAUDE.md rule 1): outcomes, confounders, covariates, calibration and
the outcome-record / check-in roles are all read from config/trackers/*.json."""
from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import math
import statistics


@dataclass
class Obs:
    tracker: str
    at: datetime            # aware, UTC
    day: date
    precision: str          # exact | slot_estimate | day_only
    values: dict


@dataclass
class Meal:
    at: datetime
    day: date
    precision: str
    foods: list[tuple[str, float | None]]          # (food_id, grams)
    tags: dict[str, float] = field(default_factory=dict)       # tag -> dose (grams, may be 0 for presence only)
    nutrients: dict[str, float] = field(default_factory=dict)  # nutrient -> amount
    specificity: str = "resolved"
    slot: str | None = None


@dataclass
class Dataset:
    timezone: str
    rollover: str
    defs: dict[str, dict]
    obs: list[Obs]
    meals: list[Meal]
    labels: dict[str, dict] = field(default_factory=dict)     # exposure ref -> {en, he}
    events: list[dict] = field(default_factory=list)          # event markers {kind, start, end}
    transit_hours: list[float] = field(default_factory=list)

    def tz(self):
        return ZoneInfo(self.timezone)


# ───────── definition-driven aggregation (mirrors packages/tracker-schema/src/values.ts) ─────────
def _matches(agg: dict, v: dict) -> bool:
    w = agg.get("where")
    return True if not w else v.get(w["field"]) in w["in"]


def obs_contribution(agg: dict, values: dict):
    """One observation's contribution to an aggregation, or None if it doesn't apply."""
    if not _matches(agg, values):
        return None
    op = agg["op"]
    if op == "count":
        return 1.0
    v = values.get(agg.get("field"))
    if v is None:
        return None
    if op == "any":
        if "in" in agg:
            return 1.0 if v in agg["in"] else 0.0
        if "gte" in agg:
            return 1.0 if isinstance(v, (int, float)) and v >= agg["gte"] else 0.0
        if "lt" in agg:
            return 1.0 if isinstance(v, (int, float)) and v < agg["lt"] else 0.0
        if isinstance(v, list):
            return 1.0 if v else 0.0
        return 1.0 if v is True else 0.0
    if not isinstance(v, (int, float)) or isinstance(v, bool):
        return None
    if op in ("max_abs_deviation_from", "mean_abs_deviation_from"):
        return abs(v - agg["center"])
    return float(v) * agg.get("scale", 1)


def combine(op: str, vals: list[float]):
    if not vals:
        return None
    if op in ("any",):
        return 1.0 if any(v > 0 for v in vals) else 0.0
    if op in ("max", "max_abs_deviation_from"):
        return max(vals)
    if op in ("min",):
        return min(vals)
    if op in ("sum", "count"):
        return sum(vals)
    if op == "last":
        return vals[-1]
    return sum(vals) / len(vals)


@dataclass
class OutcomeDef:
    ref: str
    tracker: str
    agg: dict
    type: str              # binary | continuous
    labels: dict
    notable: float | None = None   # for <key>_notable: threshold on the continuous value
    direction: str = "higher_is_worse"
    absent_is_zero: bool = True


def outcome_defs(defs: dict[str, dict]) -> list[OutcomeDef]:
    out = []
    for d in defs.values():
        for a in d.get("aggregation", {}).get("daily", []):
            an = a.get("analysis")
            if not an or an.get("role") != "outcome":
                continue
            absent_zero = a["op"] in ("any", "max", "sum", "count")
            o = OutcomeDef(f"{d['key']}.{a['key']}", d["key"], a, an["type"], an["labels"], direction=an.get("direction", "higher_is_worse"), absent_is_zero=absent_zero)
            out.append(o)
            if an["type"] == "continuous" and an.get("notable_threshold") is not None:
                t = an["notable_threshold"]
                out.append(OutcomeDef(f"{o.ref}_notable", d["key"], a, "binary",
                                      {"en": f"{an['labels']['en']} ≥ {t}", "he": f"{an['labels']['he']} ≥ {t}"}, notable=t, absent_is_zero=True))
    return out


@dataclass
class ConfounderDef:
    key: str
    tracker: str
    agg: dict
    labels: dict
    persist_days: int
    adjust: bool
    role: str


def confounder_defs(defs: dict[str, dict]) -> list[ConfounderDef]:
    out = []
    for d in defs.values():
        for a in d.get("aggregation", {}).get("daily", []):
            an = a.get("analysis")
            if an and an.get("role") in ("confounder", "covariate") and an.get("type") == "binary":
                out.append(ConfounderDef(f"{d['key']}.{a['key']}", d["key"], a, an["labels"], an.get("persist_days", 0), bool(an.get("adjust")), an["role"]))
    return out


# ───────── days ─────────
def local_day(at: datetime, tz: ZoneInfo, rollover: str) -> date:
    h, m = (int(x) for x in rollover.split(":")[:2])
    loc = at.astimezone(tz)
    return (loc - timedelta(hours=h, minutes=m)).date()


@dataclass
class DayInfo:
    day: date
    weight: float
    meals: int
    outcome_recorded: bool
    checkin: bool


def build_days(ds: Dataset, cfg: dict) -> dict[date, DayInfo]:
    meal_tr = [k for k, d in ds.defs.items() if d.get("has_meal_items")]
    outcome_tr = {k for k, d in ds.defs.items() if d.get("counts_as_outcome_record")}
    checkin_tr = {k for k, d in ds.defs.items() if d.get("counts_as_checkin")}
    clear = {k: d["all_clear"] for k, d in ds.defs.items() if d.get("all_clear")}
    days: dict[date, dict] = {}
    for m in ds.meals:
        days.setdefault(m.day, {"meals": 0, "out": False, "chk": False})["meals"] += 1
    for o in ds.obs:
        e = days.setdefault(o.day, {"meals": 0, "out": False, "chk": False})
        if o.tracker in meal_tr:
            continue
        if o.tracker in outcome_tr:
            e["out"] = True
        if o.tracker in checkin_tr:
            e["chk"] = True
        c = clear.get(o.tracker)
        if c and o.values.get(c["field"]) == c["value"]:
            e["out"] = True
    counts = [v["meals"] for v in days.values() if v["meals"] > 0]
    median_meals = max(1.0, statistics.median(counts)) if counts else 3.0
    W = cfg["day_weight"]
    out = {}
    for d, v in days.items():
        mc = min(1.0, v["meals"] / median_meals)
        w = W["meal_coverage"] * mc + W["outcome_recorded"] * (1 if v["out"] else 0) + W["checkin_present"] * (1 if v["chk"] else 0)
        out[d] = DayInfo(d, round(w, 4), v["meals"], v["out"], v["chk"])
    return out


def confounder_days(ds: Dataset, cfg: dict) -> dict[str, set[date]]:
    """Days on which each binary confounder/covariate is present, including persistence (antibiotic within 14 days)."""
    out: dict[str, set[date]] = {}
    by_tr: dict[str, list[Obs]] = {}
    for o in ds.obs:
        by_tr.setdefault(o.tracker, []).append(o)
    for c in confounder_defs(ds.defs):
        hits: set[date] = set()
        for o in by_tr.get(c.tracker, []):
            if obs_contribution(c.agg, o.values) == 1.0:
                for k in range(c.persist_days + 1):
                    hits.add(o.day + timedelta(days=k))
        out[c.key] = hits
    # tags configured as confounders (alcohol) come from meals, not trackers
    for tag in cfg.get("confounder_tags", []):
        out[f"tag.{tag}"] = {m.day for m in ds.meals if tag in m.tags}
    return out


def transit_scale(ds: Dataset, cfg: dict) -> tuple[float, bool]:
    """Measured transit shifts the 6–24 / 24–48 boundaries (§4.1): ≥3 measurements, capped ±50%."""
    hrs = [h for h in ds.transit_hours if h and h > 0]
    if len(hrs) < cfg.get("transit_min_measurements", 3):
        return 1.0, False
    r = statistics.median(hrs) / cfg.get("population_transit_median_hours", 28)
    cap = cfg.get("transit_shift_cap_pct", 50) / 100
    return max(1 - cap, min(1 + cap, r)), True
