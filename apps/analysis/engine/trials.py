"""N-of-1 trial verdicts (04 §10). Bayesian, because with one participant a posterior probability is
what the user wants to know. Four verdicts, not two: an effect, NO meaningful effect (the ROPE, §10.8),
inconclusive, or abandoned. Adherence gating forces 'inconclusive' — a trial you didn't follow cannot
produce a negative result."""
from __future__ import annotations
import math
import numpy as np
from scipy import stats as st

ON_PHASES = {"baseline", "challenge", "active", "on", "habitual"}
OFF_PHASES = {"elimination", "control", "off", "quarter"}


def _trim_mean(x: np.ndarray) -> float:
    return float(st.trim_mean(x, 0.2)) if len(x) >= 5 else float(np.mean(x))


def _yuen_var(x: np.ndarray) -> float:
    """Squared standard error of a 20% trimmed mean (Yuen): winsorised variance, so one bad day can't blow it up."""
    n = len(x)
    if n < 2:
        return 1.0
    g = int(math.floor(0.2 * n)); h = n - 2 * g
    xs = np.sort(x)
    w = np.clip(x, xs[g], xs[n - g - 1]) if g > 0 else x
    return float((n - 1) * np.var(w, ddof=1) / (h * (h - 1))) if h > 1 else float(np.var(x, ddof=1) / n)


def _posterior_binary(y_on: np.ndarray, y_off: np.ndarray, rng) -> np.ndarray:
    k1, n1 = float(y_on.sum()), len(y_on)
    k0, n0 = float(y_off.sum()), len(y_off)
    # Beta(1,1) on the exposed rate; the elimination rate gets a weakly informative prior centred on it
    # (Beta(2,2) scaled), so one lucky fortnight doesn't look like a cure.
    m = (k1 + 1) / (n1 + 2)
    p1 = rng.beta(1 + k1, 1 + n1 - k1, 40_000)
    p0 = rng.beta(2 * m + k0, 2 * (1 - m) + n0 - k0, 40_000)
    return p1 - p0


def _posterior_continuous(y_on: np.ndarray, y_off: np.ndarray, rng) -> tuple[np.ndarray, float]:
    """Robust location difference (20% trimmed means) with a Student-t posterior; the scale is inflated
    for lag-1 autocorrelation (AR(1) effective n) when |ρ| > 0.2."""
    d = _trim_mean(y_on) - _trim_mean(y_off)
    se = math.sqrt(_yuen_var(y_on) + _yuen_var(y_off)) or 1e-6
    both = np.concatenate([y_off, y_on])
    rho = float(np.corrcoef(both[:-1], both[1:])[0, 1]) if len(both) > 8 and both.std() > 0 else 0.0
    if abs(rho) > 0.2:
        se *= math.sqrt((1 + abs(rho)) / (1 - min(0.9, abs(rho))))
    df = max(3, len(y_on) + len(y_off) - 2)
    return d + se * rng.standard_t(df, 40_000), rho


def verdict(days: list[dict], hyp: dict, outcome_type: str, guesses: list[dict] | None = None, allocation: list[str] | None = None,
            partial: dict | None = None, cfg: dict | None = None) -> dict:
    """days: [{phase, period_index, outcome (float|None), logged, adherent, analytic_excluded}] in date order."""
    cfg = cfg or {}
    rng = np.random.default_rng(12345)
    mie = float(hyp["minimum_interesting_effect"])
    bar = float(hyp.get("decision_bar", 0.90))
    total = len(days)
    logged = [d for d in days if d.get("logged") and d.get("outcome") is not None]
    adherence_days = [d for d in days if d["phase"] in OFF_PHASES | {"washout", "followup"} and d.get("logged")]
    adherence = (sum(1 for d in adherence_days if d.get("adherent") is not False) / len(adherence_days)) if adherence_days else 1.0
    logged_share = len(logged) / total if total else 0.0
    use = [d for d in logged if not d.get("analytic_excluded")]
    on = np.array([float(d["outcome"]) for d in use if d["phase"] in ON_PHASES])
    off = np.array([float(d["outcome"]) for d in use if d["phase"] in OFF_PHASES])
    out = {"adherence": round(adherence, 3), "days_logged_share": round(logged_share, 3), "n_on": int(len(on)), "n_off": int(len(off)),
           "minimum_interesting_effect": mie, "decision_bar": bar, "outcome_type": outcome_type,
           "analytic_days_excluded": sum(1 for d in logged if d.get("analytic_excluded")), "partial": bool(partial), **(partial or {})}
    if len(on) < 3 or len(off) < 3:
        return {**out, "verdict": "inconclusive", "reason": "too_few_days", "p_effect": None, "p_rope": None, "ci": None, "effect": None}
    if outcome_type == "binary":
        draws = _posterior_binary(on, off, rng); rho = 0.0
        effect = float(on.mean() - off.mean())
    else:
        draws, rho = _posterior_continuous(on, off, rng)
        effect = _trim_mean(on) - _trim_mean(off)
    p_effect = float((draws > mie).mean())
    p_rope = float((np.abs(draws) < mie).mean())
    lo, hi = np.percentile(draws, [2.5, 97.5])
    out.update({"effect": round(effect, 4), "ci": [round(float(lo), 4), round(float(hi), 4)], "p_effect": round(p_effect, 4), "p_rope": round(p_rope, 4), "rho_1": round(rho, 3),
                "rate_on": round(float(on.mean()), 4), "rate_off": round(float(off.mean()), 4)})
    # adherence gating (§10.5) — and it is checked BEFORE the posterior is read
    if adherence < float(hyp.get("min_adherence", 0.85)) or logged_share < float(hyp.get("min_days_logged", 0.70)):
        return {**out, "verdict": "inconclusive", "reason": "low_adherence" if adherence < float(hyp.get("min_adherence", 0.85)) else "too_few_days_logged"}
    if p_effect >= bar:
        v = "effect"
    elif p_rope >= bar:
        v = "no_meaningful_effect"
    elif p_effect >= 0.70:
        v = "probable"
    elif p_effect <= 0.30 and p_rope >= 0.5:
        v = "probably_not"
    else:
        v = "inconclusive"
    out["verdict"] = v
    out["blinding"] = blinding_report(days, guesses or [], allocation, outcome_type, cfg.get("blinding_divergence_threshold", 0.20), effect)
    if out["blinding"] and out["blinding"]["diverges"] and v == "effect":
        out["verdict"] = "probable"; out["downgraded_by_guess"] = True
    if partial and v == "effect":
        out["confidence_upgrade_allowed"] = False
    return out


def blinding_report(days: list[dict], guesses: list[dict], allocation: list[str] | None, outcome_type: str, threshold: float, alloc_effect: float) -> dict | None:
    """D33: break-blind rate vs chance, and the effect by GUESS next to the effect by allocation."""
    if not guesses:
        return None
    by_period: dict[int, list[float]] = {}
    for d in days:
        if d.get("period_index") is not None and d.get("outcome") is not None and d.get("logged") and not d.get("analytic_excluded"):
            by_period.setdefault(int(d["period_index"]), []).append(float(d["outcome"]))
    arm = {i: a for i, a in enumerate(allocation)} if allocation else {}
    scored = [g for g in guesses if g["guess"] != "no_idea" and g["period_index"] in arm]
    correct = sum(1 for g in scored if g["guess"] == arm[g["period_index"]])
    n_active = sum(1 for a in arm.values() if a == "active")
    chance = max(n_active, len(arm) - n_active) / len(arm) if arm else 0.5
    guessed_active = [v for g in guesses if g["guess"] == "active" for v in by_period.get(g["period_index"], [])]
    guessed_control = [v for g in guesses if g["guess"] == "control" for v in by_period.get(g["period_index"], [])]
    by_guess = (float(np.mean(guessed_active)) - float(np.mean(guessed_control))) if guessed_active and guessed_control else None
    return {"n_periods_guessed": len(guesses), "break_blind_rate": round(correct / len(scored), 3) if scored else None, "chance_baseline": round(chance, 3),
            "effect_by_allocation": round(alloc_effect, 4), "effect_by_guess": None if by_guess is None else round(by_guess, 4),
            "diverges": bool(by_guess is not None and abs(by_guess - alloc_effect) > threshold)}


def design_power(design: dict, p_base: float, log_rate: float, mie: float, sims: int = 2000, bar: float = 0.9, seed: int = 1) -> float:
    """§14.4: simulate the pre-registered design under H1 (the rate shifts by exactly MIE). 'Adequate' when
    the posterior is confident the shift is real — P(RD > 0) ≥ bar — in ≥ 80% of simulations. (Asking for
    P(RD > MIE) under a true shift of exactly MIE would centre on 0.5 and no design could ever pass.)"""
    rng = np.random.default_rng(seed)
    n_on = int(design["on_days"] * log_rate); n_off = int(design["off_days"] * log_rate)
    if n_on < 3 or n_off < 3:
        return 0.0
    hits = 0
    for _ in range(sims):
        p_on = min(0.99, p_base + mie); p_off = p_base
        y1 = rng.random(n_on) < p_on; y0 = rng.random(n_off) < p_off
        k1, k0 = y1.sum(), y0.sum()
        m = (k1 + 1) / (n_on + 2)
        d = rng.beta(1 + k1, 1 + n_on - k1, 2000) - rng.beta(2 * m + k0, 2 * (1 - m) + n_off - k0, 2000)
        hits += (d > 0).mean() >= bar
    return hits / sims
