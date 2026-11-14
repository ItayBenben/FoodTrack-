"""The association pipeline — 04-analysis-engine.md steps 1–7.

Observational data generates hypotheses; only trials generate evidence. Everything here is built to
make a false finding hard to produce: the eligibility filter runs before anything is estimated,
multiplicity is controlled by BH within each (outcome, lag) family, autocorrelation switches to a
block bootstrap, confounding and reverse causation cap the tier, and the tier is conservative.
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime, timedelta
import math
import statistics
import numpy as np

from .model import Dataset, OutcomeDef, build_days, combine, confounder_days, confounder_defs, obs_contribution, outcome_defs, transit_scale
from . import stats as S

ENGINE_VERSION = "1.0.0"
PRECISION_MIN = {"exact": 0, "slot_estimate": 6, "day_only": 24}
DOSE_NUTRIENTS = ["fat_g", "fiber_g", "lactose_g", "caffeine_mg", "alcohol_g", "sugar_g", "energy_kcal"]


@dataclass
class Comparison:
    exposure: str
    outcome: OutcomeDef
    window: tuple[float, float]
    days: list[date]
    x: np.ndarray
    y: np.ndarray
    w: np.ndarray
    dose: np.ndarray


# ───────── exposures ─────────
def meal_exposures(ds: Dataset, cfg: dict) -> dict[str, list[tuple[datetime, date, str, float]]]:
    """ref -> [(time, day, precision, dose)] for every meal occurrence. Unspecified meals never count (D29)."""
    tz = ds.tz()
    late_h = 24 - cfg.get("meta_exposures", {}).get("late_meal_hours_before_rollover", 3)
    out: dict[str, list] = {}
    for m in ds.meals:
        if m.specificity == "unspecified":
            continue
        for fid, g in m.foods:
            out.setdefault(f"food:{fid}", []).append((m.at, m.day, m.precision, g or 0.0))
        for tag, g in m.tags.items():
            out.setdefault(f"tag:{tag}", []).append((m.at, m.day, m.precision, g or 0.0))
        loc = m.at.astimezone(tz)
        if (loc.hour >= late_h or loc.hour < 4) and m.precision != "day_only":
            out.setdefault("meta:late_meal", []).append((m.at, m.day, m.precision, 1.0))
    # day-level nutrient highs (top quartile of the user's own days) and large-meal days
    by_day: dict[date, dict[str, float]] = {}
    first: dict[tuple[date, str], tuple[datetime, str]] = {}
    for m in ds.meals:
        if m.specificity == "unspecified":
            continue
        for n, v in m.nutrients.items():
            if n in DOSE_NUTRIENTS:
                by_day.setdefault(m.day, {}).setdefault(n, 0.0)
                by_day[m.day][n] += v
                k = (m.day, n)
                if k not in first or m.at < first[k][0]:
                    first[k] = (m.at, m.precision)
    q = cfg.get("meta_exposures", {}).get("large_meal_quantile", 0.75)
    for n in DOSE_NUTRIENTS:
        vals = [d[n] for d in by_day.values() if d.get(n)]
        if len(vals) < 20:
            continue
        thr = float(np.quantile(vals, q))
        ref = "meta:large_meal" if n == "energy_kcal" else f"nutrient:{n}_high"
        for day, d in by_day.items():
            if d.get(n, 0) > thr and d.get(n, 0) > 0:
                t, p = first[(day, n)]
                out.setdefault(ref, []).append((t, day, p, d[n]))
    return out


# ───────── outcome windows ─────────
class OutcomeSeries:
    def __init__(self, od: OutcomeDef, ds: Dataset):
        ev = []
        for o in ds.obs:
            if o.tracker != od.tracker:
                continue
            c = obs_contribution(od.agg, o.values)
            if c is None:
                continue
            if od.notable is not None:
                c = 1.0 if c >= od.notable else 0.0
            ev.append((o.at.timestamp(), c))
        ev.sort()
        self.t = np.array([e[0] for e in ev]); self.v = np.array([e[1] for e in ev])
        self.op = "any" if od.type == "binary" and od.notable is not None else od.agg["op"]
        self.od = od
        self.cs = np.concatenate([[0.0], np.cumsum(self.v)]) if len(self.v) else np.array([0.0])
        self.pos = np.concatenate([[0.0], np.cumsum(self.v > 0)]) if len(self.v) else np.array([0.0])

    def values(self, anchors: np.ndarray, a: float, b: float, covered_many) -> np.ndarray:
        """Vectorised window values for many anchors at once."""
        lo, hi = anchors + a * 3600, anchors + b * 3600
        i, j = np.searchsorted(self.t, lo, "left"), np.searchsorted(self.t, hi, "left")
        n = j - i
        out = np.full(len(anchors), np.nan)
        has = n > 0
        if self.od.type == "binary":
            out[has] = ((self.pos[j] - self.pos[i])[has] > 0).astype(float)
        elif self.op in ("sum", "count"):
            out[has] = (self.cs[j] - self.cs[i])[has]
        elif self.op in ("max", "max_abs_deviation_from"):
            for k in np.nonzero(has)[0]:
                out[k] = float(self.v[i[k]:j[k]].max())
        elif self.op == "last":
            out[has] = self.v[j[has] - 1]
        else:
            out[has] = ((self.cs[j] - self.cs[i])[has] / n[has])
        if self.od.absent_is_zero:
            empty = ~has
            if empty.any():
                cov = covered_many(lo[empty], hi[empty])
                idx = np.nonzero(empty)[0]
                out[idx[cov]] = 0.0
        return out

    def value(self, anchor: float, a: float, b: float, covered) -> float:
        lo, hi = anchor + a * 3600, anchor + b * 3600
        i, j = np.searchsorted(self.t, lo, "left"), np.searchsorted(self.t, hi, "left")
        if j > i:
            v = combine(self.op, list(self.v[i:j]))
            if self.od.type == "binary":
                return 1.0 if v and v > 0 else 0.0
            return float(v)
        if self.od.absent_is_zero and covered(lo, hi):
            return 0.0
        return math.nan

    def day_value(self, ds: Dataset, day: date) -> float:
        vals = [obs_contribution(self.od.agg, o.values) for o in ds.obs if o.tracker == self.od.tracker and o.day == day]
        vals = [v for v in vals if v is not None]
        if self.od.notable is not None:
            vals = [1.0 if v >= self.od.notable else 0.0 for v in vals]
        v = combine(self.op, vals)
        if self.od.type == "binary":
            return math.nan if v is None else (1.0 if v > 0 else 0.0)
        return math.nan if v is None else float(v)


def _mie(od: OutcomeDef, cfg: dict) -> float:
    return cfg["min_interesting_rd"] if od.type == "binary" else cfg["min_interesting_d"]


# ───────── the pipeline ─────────
def analyze(ds: Dataset, cfg: dict, outcomes: list[str] | None = None, window_filter: list[tuple[float, float]] | None = None, with_days: bool = True) -> dict:
    days = build_days(ds, cfg)
    all_days = sorted(days)
    analysed = [d for d in all_days if days[d].weight >= cfg["min_day_weight"]]
    est_days = {m.day for m in ds.meals if m.precision != "exact"}
    summary = {
        "engine_version": ENGINE_VERSION, "n_days_logged": len(all_days), "n_days_analysed": len(analysed),
        "n_incomplete_days": len(all_days) - len(analysed), "n_days_estimated_times": len(est_days & set(analysed)),
        "window_start": str(all_days[0]) if all_days else None, "window_end": str(all_days[-1]) if all_days else None,
    }
    if len(analysed) < cfg["min_total_days"]:
        return {"summary": {**summary, "status": "not_enough_days", "days_needed": cfg["min_total_days"] - len(analysed)}, "associations": [], "not_enough_data": []}
    if len(all_days) and summary["n_incomplete_days"] / len(all_days) > 0.3:
        summary["missing_data_warning"] = True

    scale, transit_applied = transit_scale(ds, cfg)
    windows = []
    for a, b in cfg["lag_windows_hours"]:
        sa = a if a in (0, 6) else a * scale
        sb = b if b == 6 else b * scale
        windows.append((float(a), float(b), sa, sb))
    if window_filter:
        windows = [w for w in windows if (w[0], w[1]) in window_filter]
    summary.update({"transit_applied": transit_applied, "transit_scale": round(scale, 3)})

    tz = ds.tz()
    covered_days = {d for d, info in days.items() if info.outcome_recorded}
    cov_starts = np.array(sorted(datetime(d.year, d.month, d.day, tzinfo=tz).timestamp() for d in covered_days))
    def covered_many(lo: np.ndarray, hi: np.ndarray) -> np.ndarray:
        # a covered day whose local midnight falls in [lo − 2 days, hi] overlaps the window (rollover-safe)
        if len(cov_starts) == 0:
            return np.zeros(len(lo), dtype=bool)
        k = np.searchsorted(cov_starts, lo - 2 * 86400, "left")
        return (k < len(cov_starts)) & (cov_starts[np.minimum(k, len(cov_starts) - 1)] <= hi)

    def covered(lo: float, hi: float) -> bool:
        d0 = datetime.fromtimestamp(lo, tz).date() - timedelta(days=1)
        d1 = datetime.fromtimestamp(hi, tz).date()
        dd = d0
        while dd <= d1:
            if dd in covered_days:
                return True
            dd += timedelta(days=1)
        return False

    # Unexposed days are anchored at the exposure's OWN typical time of day, so both arms look at the
    # same hours (a breakfast food compared against "the morning after breakfast", not after lunch).
    # Anchoring the unexposed arm anywhere else makes every food eaten at a habitual hour look associated.
    def anchor_at(d: date, secs: int) -> float:
        return (datetime(d.year, d.month, d.day, tzinfo=tz) + timedelta(seconds=secs)).timestamp()
    unexp_cache: dict[tuple, dict[date, float]] = {}
    def unexposed_values(oref: str, w, secs: int) -> dict[date, float]:
        k = (oref, w, secs)
        if k not in unexp_cache:
            anchors = np.array([anchor_at(d, secs) for d in analysed])
            unexp_cache[k] = dict(zip(analysed, series[oref].values(anchors, w[2], w[3], covered_many)))
        return unexp_cache[k]
    def unexposed_value(oref: str, w, d: date, secs: int) -> float:
        return unexposed_values(oref, w, secs)[d]

    ods = [o for o in outcome_defs(ds.defs) if not outcomes or o.ref in outcomes]
    series = {o.ref: OutcomeSeries(o, ds) for o in ods}
    series = {k: s for k, s in series.items() if len(s.t) >= cfg["min_outcome_events_per_arm"] * 2}
    expo = meal_exposures(ds, cfg)
    analysed_set = set(analysed)
    n_an = len(analysed)
    lo_p, hi_p = cfg["exposure_prevalence_range"]
    weights = np.array([days[d].weight for d in analysed])

    # cheap pre-filter: an exposure that can't reach the gates is never estimated (§5)
    cand = {}
    not_enough = []
    for ref, occ in expo.items():
        edays = {d for (_, d, _, _) in occ if d in analysed_set}
        prev = len(edays) / n_an
        if len(edays) >= cfg["min_exposed_days"] and n_an - len(edays) >= cfg["min_unexposed_days"] and lo_p <= prev <= hi_p:
            cand[ref] = occ
        elif ref.startswith(("tag:", "food:")) and prev >= cfg.get("days_more_min_prevalence", 0.1) and len(edays) < cfg["min_exposed_days"]:
            not_enough.append({"exposure_ref": ref, "n_exposed": len(edays), "prevalence": round(prev, 3)})

    confs = confounder_days(ds, cfg)
    cdefs = {c.key: c for c in confounder_defs(ds.defs)}

    comps: list[dict] = []
    for ref, occ in cand.items():
        by_day: dict[date, list[tuple[datetime, str, float]]] = {}
        for t, d, p, g in occ:
            if d in analysed_set:
                by_day.setdefault(d, []).append((t, p, g))
        firsts = []
        for d, lst in by_day.items():
            t0 = min(t for t, _, _ in lst).astimezone(tz)
            mid = datetime(d.year, d.month, d.day, tzinfo=tz)
            firsts.append(int((t0 - mid).total_seconds()))
        typical = int(statistics.median(firsts)) // 1800 * 1800 if firsts else 13 * 3600  # 30-min grid keeps the cache small
        for w in windows:
            ok_days, xs, anchors, doses = [], [], [], []
            for d in analysed:
                if d in by_day:
                    allowed = [(t, g) for t, p, g in by_day[d] if PRECISION_MIN.get(p, 24) <= w[0]]
                    if not allowed:
                        continue   # an excluded exposure-day is absent, never counted as unexposed (§16.1)
                    ok_days.append(d); xs.append(1.0); anchors.append(min(t for t, _ in allowed).timestamp()); doses.append(sum(g for _, g in allowed))
                else:
                    ok_days.append(d); xs.append(0.0); anchors.append(None); doses.append(0.0)
            x = np.array(xs)
            if x.sum() < cfg["min_exposed_days"] or (1 - x).sum() < cfg["min_unexposed_days"]:
                continue
            for oref, s in series.items():
                uv = unexposed_values(oref, w, typical)
                ea = np.array([a if a is not None else 0.0 for a in anchors])
                ev = s.values(ea, w[2], w[3], covered_many)
                y = np.array([ev[k] if a is not None else uv[d] for k, (d, a) in enumerate(zip(ok_days, anchors))])
                keep = ~np.isnan(y)
                c = Comparison(ref, s.od, (w[0], w[1]), [d for d, k in zip(ok_days, keep) if k], x[keep], y[keep],
                               np.array([days[d].weight for d in ok_days])[keep], np.array(doses)[keep])
                r = _estimate(c, cfg)
                if r:
                    comps.append(r)

    # Multiplicity (§7). The spec defines the family per (outcome, lag window); with ~30 such families a
    # user with no real effect still gets ≥1 false discovery in almost every run (1 − 0.9^30), which fails
    # the null-data release gate. So the whole run is one BH family (impl-notes I-18). The gate decides.
    fams: dict[tuple, list[dict]] = {("all",): comps} if cfg.get("fdr_family", "run") == "run" else {}
    if not fams:
        for r in comps:
            fams.setdefault((r["outcome_ref"], tuple(r["lag_window"])), []).append(r)
    for fam in fams.values():
        for r, q in zip(fam, S.benjamini_hochberg([r["p_value"] for r in fam])):
            r["q_value"] = q

    out = []
    for r in comps:
        c: Comparison = r.pop("_c")
        r["confidence"] = "none"
        if r["interesting"] and r["q_value"] < cfg["low_tier_q"]:
            _refine(r, c, ds, cfg, confs, cdefs, analysed, days)
        if with_days and r["confidence"] != "none":
            r["evidence"]["days"] = [{"day": str(d), "exposed": bool(xx), "outcome": float(yy), "weight": float(ww)} for d, xx, yy, ww in zip(c.days, c.x, c.y, c.w)]
        out.append(r)

    # "you'll need about N more days" (§14.1) on the primary binary outcome, 6–24 h
    prim = next((o for o in ods if o.type == "binary" and o.ref in series and o.notable is None), None)
    if prim:
        w6 = next((w for w in windows if w[0] == 6), None)
        vals = [unexposed_value(prim.ref, w6, d, 13 * 3600) for d in analysed] if w6 else []
        vals = [v for v in vals if not math.isnan(v)]
        p_base = sum(vals) / len(vals) if vals else 0.2
        for ne in not_enough:
            pe = ne["prevalence"]
            n_pairs = S.two_proportion_n(min(0.99, p_base + cfg["min_interesting_rd"]), p_base)
            need = max(cfg["min_exposed_days"], n_pairs)
            more = math.ceil((need - ne["n_exposed"]) / pe) if pe > 0 else None
            ne.update({"outcome_ref": prim.ref, "baseline_rate": round(p_base, 3), "days_more": more if more is not None and more <= cfg["days_more_max_shown"] else None,
                       "suppressed": "too_rare" if pe < cfg["days_more_min_prevalence"] else ("too_long" if more is None or more > cfg["days_more_max_shown"] else None)})

    summary.update({"status": "done", "n_comparisons": len(comps), "n_families": len(fams),
                    "n_low": sum(r["confidence"] == "low" for r in out), "n_medium": sum(r["confidence"] == "medium" for r in out), "n_high": sum(r["confidence"] == "high" for r in out)})
    shown = [r for r in out if r["confidence"] != "none"]
    shown.sort(key=lambda r: ({"high": 0, "medium": 1, "low": 2}[r["confidence"]], 0 if (cfg.get("prefer_continuous_outcomes") and r["effect_type"] == "mean_difference") else 1, -abs(r["standardized"])))
    return {"summary": summary, "associations": shown, "not_enough_data": not_enough}


def _estimate(c: Comparison, cfg: dict) -> dict | None:
    """Eligibility gate, then the crude estimate and p (§5, §6.1, §6.2)."""
    x, y, w = c.x, c.y, c.w
    n1, n0 = int(x.sum()), int((1 - x).sum())
    if n1 < cfg["min_exposed_days"] or n0 < cfg["min_unexposed_days"] or n1 + n0 < cfg["min_total_days"]:
        return None
    prev = n1 / (n1 + n0)
    if not (cfg["exposure_prevalence_range"][0] <= prev <= cfg["exposure_prevalence_range"][1]):
        return None
    e1, e0 = int(((y > 0) & (x == 1)).sum()), int(((y > 0) & (x == 0)).sum())
    if e1 < cfg["min_outcome_events_per_arm"] or e0 < cfg["min_outcome_events_per_arm"]:
        return None
    w1, w0 = w[x == 1], w[x == 0]
    if c.outcome.type == "binary":
        k1, k0 = float((w1 * y[x == 1]).sum()), float((w0 * y[x == 0]).sum())
        N1, N0 = float(w1.sum()), float(w0.sum())
        r1, r0 = k1 / N1, k0 / N0
        effect = r1 - r0
        lo, hi = S.newcombe_rd(k1, N1, k0, N0)
        p = S.binary_p(e1, n1, e0, n0)
        pooled = (k1 + k0) / (N1 + N0)
        std = effect / math.sqrt(max(1e-9, pooled * (1 - pooled)))
        extra = {"rate_exposed": r1, "rate_unexposed": r0}
        etype = "risk_difference"
        interesting = abs(effect) >= cfg["min_interesting_rd"]
        skew = False
    else:
        diff, lo, hi, p, d = S.welch(y[x == 1], y[x == 0], w1, w0)
        hl = S.hodges_lehmann(y[x == 1], y[x == 0])
        # Robustness (§6.2): a continuous effect must survive a rank test too. Welch alone is liberal on
        # the discrete, zero-inflated scales these outcomes live on (urgency 0–4, |Bristol − 4|).
        from scipy.stats import mannwhitneyu
        p = max(p, float(mannwhitneyu(y[x == 1], y[x == 0], alternative="two-sided").pvalue))
        effect, std = diff, d
        extra = {"mean_exposed": float(np.average(y[x == 1], weights=w1)), "mean_unexposed": float(np.average(y[x == 0], weights=w0)), "cohens_d": d, "hodges_lehmann": hl}
        etype = "mean_difference"
        interesting = abs(d) >= cfg["min_interesting_d"]
        skew = hl != 0 and np.sign(hl) != np.sign(diff)
    rho = 0.0
    if interesting and p < 0.3:
        rho = S.lag1_autocorr(_day_series(c))
        if abs(rho) > cfg["autocorr_threshold"]:
            # serial correlation: the block bootstrap supplies the interval, and the p-value is the more
            # conservative of the two — never a smaller one than the model that ignored the correlation.
            lo, hi, pb = S.bootstrap_rd(x, y, w, cfg["bootstrap_resamples"])
            p = max(p, pb)
    return {"_c": c, "exposure_ref": c.exposure, "outcome_ref": c.outcome.ref, "outcome_label": c.outcome.labels, "lag_window": list(c.window),
            "n_exposed": n1, "n_unexposed": n0, "n_outcome_exposed": e1, "n_outcome_unexposed": e0, "effect_type": etype, "effect": float(effect),
            "ci_low": float(lo), "ci_high": float(hi), "p_value": float(p), "rho_1": float(rho), "standardized": float(std), "interesting": bool(interesting),
            "warnings": ([{"code": "distribution_skew"}] if skew else []), "adjusted_for": [], "attenuation": None, "evidence": {**{k: float(v) for k, v in extra.items()}}}


def _day_series(c: Comparison) -> np.ndarray:
    """The outcome as a daily series in date order (gaps as NaN) for the lag-1 autocorrelation (§6.4)."""
    if not c.days:
        return np.array([])
    start = c.days[0]
    arr = np.full((c.days[-1] - start).days + 1, np.nan)
    for d, v in zip(c.days, c.y):
        arr[(d - start).days] = v
    return arr


def _refine(r: dict, c: Comparison, ds: Dataset, cfg: dict, confs: dict, cdefs: dict, analysed: list[date], days: dict) -> None:
    """Confounding, reverse causation, dose-response, replication → the tier (§6.3–§8)."""
    x, y, w = c.x, c.y, c.w
    n = len(c.days)
    crude = r["effect"]
    # confounder matrix: configured confounders + weekend (Fri/Sat) + daily-kcal quartile
    Z, names = [], []
    for key, hit in confs.items():
        if key.startswith("tag.") or (cdefs.get(key) and cdefs[key].adjust):
            col = np.array([1.0 if d in hit else 0.0 for d in c.days])
            if 0 < col.sum() < n:
                Z.append(col); names.append(key)
    wk = np.array([1.0 if d.weekday() in (4, 5) else 0.0 for d in c.days])
    Z.append(wk); names.append("weekend")
    if Z:
        Zm = np.column_stack(Z)
        if n < cfg["regression_min_days"]:
            # stratify by the single strongest confounder; regression on <60 days is overfitting theatre
            cors = [abs(np.corrcoef(x, z)[0, 1]) if z.std() > 0 else 0 for z in Zm.T]
            j = int(np.argmax(cors))
            z = Zm[:, j]
            num = den = 0.0
            for s in (0, 1):
                m = z == s
                xs, ys, ws = x[m], y[m], w[m]
                if (xs == 1).sum() == 0 or (xs == 0).sum() == 0:
                    continue
                rd = np.average(ys[xs == 1], weights=ws[xs == 1]) - np.average(ys[xs == 0], weights=ws[xs == 0])
                n1s, n0s = (xs == 1).sum(), (xs == 0).sum()
                wt = n1s * n0s / (n1s + n0s)
                num += wt * rd; den += wt
            adj = num / den if den else crude
            r["adjusted_for"] = [names[j]]; r["adjustment_method"] = "stratified"
        else:
            adj = S.ridge_effect(y, x, Zm, w)
            r["adjusted_for"] = names; r["adjustment_method"] = "ridge"
        att = (1 - adj / crude) if crude else 0.0
        r["adjusted_effect"] = float(adj)
        r["attenuation"] = float(att)
        if att > cfg["confounder_attenuation_warn"]:
            r["warnings"].append({"code": "confounding_detected", "detail": {"crude": round(crude, 3), "adjusted": round(adj, 3)}})
        # D46: name the exposure this one travels with, so "dairy" can be told apart from "dairy with alcohol"
        best = None
        for zname, zc in zip(names, Zm.T):
            if zname == "weekend":
                continue
            share = float((zc * x).sum() / max(1, x.sum()))
            base = float(zc.mean())
            if share >= 0.3 and share - base >= 0.2 and (not best or share > best[1]):
                best = (zname, share, int((zc * x).sum()))
        if best:
            r["warnings"].append({"code": "travels_with", "detail": {"with": best[0], "label": (cdefs[best[0]].labels if best[0] in cdefs else None), "n": best[2], "of": int(x.sum())}})
        share_we, base_we = float((wk * x).sum() / max(1, x.sum())), float(wk.mean())
        if abs(share_we - base_we) > 0.25:
            r["warnings"].append({"code": "weekday_imbalance", "detail": {"n_weekend": int((wk * x).sum()), "of": int(x.sum())}})
    # overlapping life events (covariates surfaced, not just adjusted for)
    ev_hits = []
    for key, hit in confs.items():
        if cdefs.get(key) and cdefs[key].role == "covariate":
            k = sum(1 for d, xx in zip(c.days, x) if xx == 1 and d in hit)
            if k:
                ev_hits.append({"ref": key, "label": cdefs[key].labels, "days_overlapping": k})
    r["overlapping_events"] = ev_hits

    # reverse causation: does a bad day predict the exposure the NEXT day as strongly? (§6.5)
    s = OutcomeSeries(c.outcome, ds)
    eday = {d for d, xx in zip(c.days, x) if xx == 1}
    od, en = [], []
    for d in analysed:
        nd = d + timedelta(days=1)
        if nd not in days or days[nd].weight < cfg["min_day_weight"]:
            continue
        v = s.day_value(ds, d)
        if math.isnan(v):
            continue
        od.append(v); en.append(1.0 if nd in eday else 0.0)
    od, en = np.array(od), np.array(en)
    if len(od) > 10 and od.std() > 0 and en.std() > 0:
        if c.outcome.type == "continuous":
            od = (od > np.median(od)).astype(float)
        r_rev = float(np.corrcoef(od, en)[0, 1]) if od.std() > 0 else 0.0
        r_fwd = float(np.corrcoef(x, y)[0, 1]) if y.std() > 0 else 0.0
        from scipy import stats as st
        p_rev = float(st.pearsonr(od, en).pvalue) if od.std() > 0 else 1.0
        r["reverse"] = {"r_reverse": r_rev, "r_forward": r_fwd, "p": p_rev}
        if abs(r_rev) >= 0.8 * abs(r_fwd) and np.sign(r_rev) == np.sign(r_fwd) and p_rev < 0.1:
            r["warnings"].append({"code": "possible_reverse_causation"})

    # dose-response by tertiles of the user's own intake (§4)
    dose_ok = None
    dx = c.dose[x == 1]; dy = y[x == 1]
    if (x == 1).sum() >= cfg["dose_min_exposure_days"] and np.unique(dx).size >= 3:
        t1, t2 = np.quantile(dx, [1 / 3, 2 / 3])
        groups = [dy[dx <= t1], dy[(dx > t1) & (dx <= t2)], dy[dx > t2]]
        if all(len(g) >= 3 for g in groups):
            means = [float(g.mean()) for g in groups]
            sign = np.sign(crude)
            dose_ok = bool(all(sign * (means[i + 1] - means[i]) >= 0 for i in range(2)) and sign * (means[2] - means[0]) > 0)
            r["dose_response"] = {"tertile_means": means, "monotone": dose_ok}

    # replication in two non-overlapping halves (§8)
    half = len(c.days) // 2
    rep = None
    if half >= 10:
        mie = _mie(c.outcome, cfg)
        effs = []
        for sl in (slice(0, half), slice(half, None)):
            xs, ys = x[sl], y[sl]
            if (xs == 1).sum() >= 4 and (xs == 0).sum() >= 4:
                e = ys[xs == 1].mean() - ys[xs == 0].mean()
                if c.outcome.type == "continuous":
                    sd = ys.std() or 1
                    e = e / sd
                effs.append(e)
        if len(effs) == 2:
            rep = all(np.sign(e) == np.sign(crude) and abs(e) >= mie / 2 for e in effs)
            r["replication"] = {"halves": [float(e) for e in effs], "replicated": rep}

    # ───── tier ─────
    codes = {wn["code"] for wn in r["warnings"]}
    tier = "low"
    attn_ok = r["attenuation"] is None or (r["attenuation"] < cfg["confounder_attenuation_warn"] and np.sign(r.get("adjusted_effect", crude)) == np.sign(crude))
    display_ok = c.outcome.type != "binary" or abs(crude) >= cfg["display_threshold_rd"]
    if (r["q_value"] < cfg["fdr_q"] and r["n_exposed"] >= cfg["medium_min_exposed_days"] and attn_ok and display_ok
            and "possible_reverse_causation" not in codes and "distribution_skew" not in codes):
        tier = "medium"
        if (dose_ok or rep) and dose_ok is not False:
            tier = "high"
    r["confidence"] = tier
