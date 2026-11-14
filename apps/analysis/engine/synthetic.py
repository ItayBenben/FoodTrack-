"""Synthetic users with a KNOWN answer (§13): injected effect of known size/lag/prevalence, null users,
a reverse-causation fixture and a non-random missing-data fixture. Deterministic per seed."""
from __future__ import annotations
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import math
import numpy as np

from .config import tracker_definitions
from .model import Dataset, Meal, Obs, local_day

TZ = "Asia/Jerusalem"
# food_id -> (tags, typical grams, kcal per 100 g)
FOODS = {
    "milk": (["contains_lactose", "dairy", "fodmap_lactose_high"], 200, 61), "yogurt": (["contains_lactose", "dairy", "fodmap_lactose_high"], 150, 61),
    "cheese": (["dairy"], 40, 350), "bread": (["contains_gluten", "wheat", "fodmap_fructan_high"], 60, 265), "pita": (["contains_gluten", "wheat", "fodmap_fructan_high"], 60, 275),
    "pasta": (["contains_gluten", "wheat", "fodmap_fructan_high"], 180, 158), "rice": (["fodmap_fructan_low"], 160, 130), "potato": ([], 150, 87),
    "hummus": (["legume", "fodmap_gos_moderate"], 45, 166), "lentils": (["legume", "fodmap_gos_high"], 200, 116), "falafel": (["legume", "fried", "high_fat"], 70, 333),
    "egg": (["egg"], 50, 155), "chicken": (["poultry"], 150, 165), "beef": (["red_meat", "high_fat"], 150, 250), "fish": (["fish"], 150, 96),
    "salad": ([], 150, 45), "onion": (["fodmap_fructan_high"], 50, 40), "apple": (["fodmap_fructose_high", "fodmap_polyol_high"], 180, 52),
    "banana": ([], 120, 89), "coffee": (["caffeine"], 240, 2), "tea": (["caffeine"], 240, 1), "beer": (["alcohol", "contains_gluten"], 330, 43),
    "wine": (["alcohol"], 150, 85), "chocolate": (["caffeine", "dairy"], 25, 535), "schug": (["spicy"], 5, 60), "fries": (["fried", "high_fat"], 120, 312),
}
MENU = {
    "breakfast": [["bread", "egg", "salad"], ["yogurt", "banana"], ["bread", "cheese"], ["egg", "salad", "pita"], ["coffee", "bread"]],
    "lunch": [["pita", "hummus", "salad"], ["chicken", "rice", "salad"], ["pasta"], ["falafel", "pita", "schug"], ["lentils", "rice", "onion"], ["fish", "potato"]],
    "dinner": [["beef", "potato", "salad"], ["egg", "bread", "salad"], ["chicken", "rice"], ["pasta", "cheese"], ["fish", "rice", "salad"]],
}


def generate(seed: int = 0, days: int = 120, effect_tag: str | None = None, effect_rd: float = 0.0, lag: tuple[float, float] = (6, 24),
             base_loose: float = 0.15, prevalence: dict[str, float] | None = None, reverse: bool = False, missing: float = 0.1,
             nonrandom_missing: bool = False, ar: float = 0.5, end: date | None = None) -> Dataset:
    rng = np.random.default_rng(seed)
    tz = ZoneInfo(TZ)
    end = end or date(2026, 10, 31)
    start = end - timedelta(days=days - 1)
    prevalence = prevalence or {}
    meals: list[Meal] = []; obs: list[Obs] = []
    latent = 0.0
    bad_yesterday = False
    def at(d: date, h: float, jitter_min: float) -> datetime:
        t = datetime(d.year, d.month, d.day, tzinfo=tz) + timedelta(hours=h, minutes=float(rng.normal(0, jitter_min)))
        return t.astimezone(ZoneInfo("UTC"))
    exposure_times: list[float] = []
    for i in range(days):
        d = start + timedelta(days=i)
        latent = ar * latent + rng.normal(0, 0.6)       # a bad week is a real thing (§6.4)
        skip = rng.random() < missing
        for slot, h in (("breakfast", 8), ("lunch", 13.2), ("dinner", 19.7)):
            if skip and slot != "breakfast":
                continue
            names = list(MENU[slot][rng.integers(len(MENU[slot]))])
            if reverse and bad_yesterday and slot == "lunch":
                names = ["rice", "banana"]        # eats plain food after a bad day
            for f, p in prevalence.items():
                if rng.random() < p and f not in names:
                    names.append(f)
            if rng.random() < 0.4 and "coffee" not in names:
                names.append("coffee")
            t = at(d, h, 35)
            tags: dict[str, float] = {}
            nutr = {"energy_kcal": 0.0}
            foods = []
            for n in names:
                tg, g, kcal = FOODS[n]
                g = g * float(rng.uniform(0.7, 1.4))
                foods.append((n, g)); nutr["energy_kcal"] += g * kcal / 100
                for x in tg:
                    tags[x] = tags.get(x, 0.0) + g
            meals.append(Meal(t, local_day(t, tz, "04:00"), "exact", foods, tags, nutr, "resolved", slot))
            if effect_tag and effect_tag in tags:
                exposure_times.append(t.timestamp())
        if rng.random() < 0.08:
            t = at(d, 21, 30); meals.append(Meal(t, local_day(t, tz, "04:00"), "exact", [("wine", 150.0)], {"alcohol": 150.0}, {"energy_kcal": 128.0}, "resolved", "drink"))
        # stools: next morning and sometimes afternoon
        bad = False
        for h in ([7.6, 15.5] if rng.random() < 0.3 else [7.6]):
            t = at(d, h, 40)
            ts = t.timestamp()
            lagged = any(lag[0] <= (ts - e) / 3600 < lag[1] for e in exposure_times[-12:])
            p = base_loose * math.exp(0.35 * latent) / (1 - base_loose + base_loose * math.exp(0.35 * latent))
            if lagged:
                p = min(0.95, p + effect_rd)
            loose = rng.random() < p
            bad = bad or loose
            if nonrandom_missing and not loose and rng.random() < 0.4:
                continue  # good days logged less (§13.5)
            b = int(rng.choice([6, 7])) if loose else int(rng.choice([3, 4, 4, 4, 5]))
            obs.append(Obs("stool", t, local_day(t, tz, "04:00"), "exact", {"bristol": b, "urgency": int(rng.integers(2, 5)) if loose else int(rng.integers(0, 2))}))
            if loose and rng.random() < 0.5:
                obs.append(Obs("symptom", t + timedelta(minutes=30), local_day(t, tz, "04:00"), "exact", {"kind": "bloating", "severity": int(rng.integers(4, 9))}))
        bad_yesterday = bad
        if not skip and rng.random() < 0.85:
            t = at(d, 22, 20)
            obs.append(Obs("checkin", t, local_day(t, tz, "04:00"), "exact", {"energy": int(rng.integers(2, 6)), "stress": int(rng.integers(1, 6)), "sleep_hours": float(np.clip(rng.normal(7, 1), 4, 10)), "all_clear": not bad}))
    labels = {f"food:{k}": {"en": k, "he": k} for k in FOODS} | {f"tag:{t}": {"en": t, "he": t} for v in FOODS.values() for t in v[0]}
    return Dataset(TZ, "04:00", tracker_definitions(), obs, meals, labels)
