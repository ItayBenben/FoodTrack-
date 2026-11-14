"""Trial verdicts against data with a known answer (04 §10, US-06)."""
import numpy as np
from engine.trials import design_power, verdict

HYP = {"minimum_interesting_effect": 0.20, "min_adherence": 0.85, "min_days_logged": 0.70, "decision_bar": 0.90}


def make(rng, n_on, n_off, p_on, p_off, adherent=1.0, logged=1.0):
    days = [{"phase": "baseline", "outcome": float(rng.random() < p_on), "logged": rng.random() < logged, "adherent": None} for _ in range(n_on // 2)]
    days += [{"phase": "elimination", "outcome": float(rng.random() < p_off), "logged": rng.random() < logged, "adherent": rng.random() < adherent} for _ in range(n_off)]
    days += [{"phase": "challenge", "outcome": float(rng.random() < p_on), "logged": True, "adherent": None} for _ in range(n_on - n_on // 2)]
    return days


def test_a_real_trigger_is_found():
    v = verdict(make(np.random.default_rng(1), 24, 21, 0.75, 0.10), HYP, "binary")
    assert v["verdict"] == "effect" and v["p_effect"] >= 0.9


def test_no_effect_is_a_positive_conclusion_not_a_shrug():
    rng = np.random.default_rng(2)
    days = make(rng, 40, 40, 0.10, 0.10)
    v = verdict(days, HYP, "binary")
    assert v["verdict"] in ("no_meaningful_effect", "probably_not"), v


def test_low_adherence_is_inconclusive_never_negative():          # US-06 AC5
    v = verdict(make(np.random.default_rng(3), 24, 21, 0.1, 0.1, adherent=0.5), HYP, "binary")
    assert v["verdict"] == "inconclusive" and v["reason"] == "low_adherence"


def test_too_few_days_logged_is_inconclusive():
    v = verdict(make(np.random.default_rng(4), 24, 21, 0.7, 0.1, logged=0.4), HYP, "binary")
    assert v["verdict"] == "inconclusive"


def test_analytic_washout_days_are_dropped_from_the_likelihood():
    days = make(np.random.default_rng(5), 24, 21, 0.7, 0.1)
    for d in days[:3]:
        d["analytic_excluded"] = True
    v = verdict(days, HYP, "binary")
    assert v["analytic_days_excluded"] == 3


def test_guess_divergence_downgrades_a_blinded_effect():
    rng = np.random.default_rng(6)
    alloc = ["active", "control"] * 3
    days = []
    for i, a in enumerate(alloc):
        for _ in range(3):
            days.append({"phase": "active" if a == "active" else "control", "period_index": i, "outcome": float(rng.random() < (0.9 if a == "active" else 0.05)), "logged": True, "adherent": True})
    # the user guessed exactly backwards: belief and substance disagree
    guesses = [{"period_index": i, "guess": "control" if a == "active" else "active"} for i, a in enumerate(alloc)]
    v = verdict(days, {**HYP, "minimum_interesting_effect": 0.2}, "binary", guesses, alloc)
    assert v["blinding"]["break_blind_rate"] == 0.0 and v["blinding"]["diverges"] is True
    assert v["verdict"] != "effect"


def test_continuous_outcome_uses_robust_posterior():
    rng = np.random.default_rng(7)
    days = [{"phase": "baseline", "outcome": float(rng.normal(6, 1.5)), "logged": True} for _ in range(14)]
    days += [{"phase": "elimination", "outcome": float(rng.normal(2, 1.5)), "logged": True, "adherent": True} for _ in range(21)]
    days[3]["outcome"] = 40.0   # one terrible day must not decide it
    v = verdict(days, {**HYP, "minimum_interesting_effect": 1.0}, "continuous")
    assert v["verdict"] == "effect"


def test_short_designs_are_flagged_as_underpowered():
    weak = design_power({"on_days": 10, "off_days": 10}, 0.3, 0.9, 0.2, sims=400)
    strong = design_power({"on_days": 40, "off_days": 40}, 0.3, 0.9, 0.4, sims=400)
    assert weak < 0.8 <= strong
