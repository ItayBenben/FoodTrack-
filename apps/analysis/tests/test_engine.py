"""The engine against data with a known answer (04 §13)."""
import math
import numpy as np
import pytest
from engine import stats as S
from engine.associations import analyze
from engine.config import analysis_config
from engine.synthetic import generate

CFG = analysis_config()


def _find(r, refs, outcomes=("stool.any_abnormal", "stool.loose"), window=(6.0, 24.0)):
    return [a for a in r["associations"] if a["exposure_ref"] in refs and a["outcome_ref"] in outcomes and tuple(a["lag_window"]) == window]


def test_recovers_an_injected_effect_and_the_true_effect_is_inside_the_ci():
    found, covered = 0, 0
    for seed in range(10):
        ds = generate(seed=seed, days=150, effect_tag="contains_lactose", effect_rd=0.4, prevalence={"milk": 0.15})
        hits = _find(analyze(ds, CFG), {"tag:contains_lactose", "food:milk", "tag:fodmap_lactose_high"})
        if hits:
            found += 1
            a = hits[0]
            assert a["effect"] > 0
            covered += a["ci_low"] <= 0.4 <= a["ci_high"] + 0.05
    assert found >= 7, f"recovered the injected effect in only {found}/10 users"
    assert covered >= 0.7 * found


def test_strong_effect_reaches_medium_or_high():
    ds = generate(seed=3, days=180, effect_tag="contains_lactose", effect_rd=0.5, prevalence={"milk": 0.15})
    hits = _find(analyze(ds, CFG), {"tag:contains_lactose", "food:milk"})
    assert hits and hits[0]["confidence"] in ("medium", "high")
    assert hits[0]["evidence"]["days"], "the evidence card must carry the days behind the claim"


def test_reverse_causation_is_flagged_not_reported():
    # diet changes AFTER bad days (plain rice and banana); nothing about rice changes the gut
    flagged = reported = 0
    for seed in range(6):
        r = analyze(generate(seed=200 + seed, days=150, reverse=True, base_loose=0.3), CFG)
        for a in r["associations"]:
            if a["exposure_ref"] in ("food:rice", "food:banana") and a["outcome_ref"].startswith("stool"):
                codes = {w["code"] for w in a["warnings"]}
                if "possible_reverse_causation" in codes:
                    flagged += 1
                    assert a["confidence"] == "low"
                elif a["confidence"] in ("medium", "high"):
                    reported += 1
    assert reported == 0


def test_missing_data_is_disclosed():
    r = analyze(generate(seed=5, days=120, missing=0.45, nonrandom_missing=True), CFG)
    assert r["summary"]["n_incomplete_days"] > 0
    assert r["summary"].get("missing_data_warning") or r["summary"]["n_days_analysed"] < r["summary"]["n_days_logged"]


def test_under_three_weeks_says_so_instead_of_guessing():
    r = analyze(generate(seed=1, days=15), CFG)
    assert r["summary"]["status"] == "not_enough_days" and r["associations"] == []


def test_estimated_times_never_enter_the_0_6h_window():
    ds = generate(seed=8, days=120, effect_tag="contains_lactose", effect_rd=0.4, prevalence={"milk": 0.15})
    for m in ds.meals:
        m.precision = "slot_estimate"
    r = analyze(ds, CFG)
    assert all(a["lag_window"][0] >= 6 for a in r["associations"])
    assert r["summary"]["n_days_estimated_times"] > 0


def test_not_enough_data_gives_a_real_number_or_says_why_not():
    r = analyze(generate(seed=4, days=60, prevalence={"apple": 0.05}), CFG)
    for ne in r["not_enough_data"]:
        assert ne["days_more"] is None or ne["days_more"] > 0
        if ne["prevalence"] < CFG["days_more_min_prevalence"]:
            assert ne["days_more"] is None and ne["suppressed"] == "too_rare"


# ───── primitives ─────
def test_newcombe_matches_published_example():
    # Newcombe (1998) example: 56/70 vs 48/80 → 0.2000, 95% CI 0.0524 to 0.3339
    lo, hi = S.newcombe_rd(56, 70, 48, 80)
    assert math.isclose(lo, 0.0524, abs_tol=5e-4) and math.isclose(hi, 0.3339, abs_tol=5e-4)


def test_bh_against_hand_computation():
    assert [round(q, 4) for q in S.benjamini_hochberg([0.01, 0.04, 0.03, 0.2])] == [0.04, 0.0533, 0.0533, 0.2]


def test_block_bootstrap_widens_the_interval_under_autocorrelation():
    rng = np.random.default_rng(0)
    n = 120; z = np.zeros(n)
    for i in range(1, n):
        z[i] = 0.8 * z[i - 1] + rng.normal()
    x = (np.arange(n) // 15 % 2).astype(float)        # exposure in runs, like real habits
    y = (z > 0.5).astype(float); w = np.ones(n)
    lo, hi, _ = S.bootstrap_rd(x, y, w, 2000)
    nlo, nhi = S.newcombe_rd(y[x == 1].sum(), (x == 1).sum(), y[x == 0].sum(), (x == 0).sum())
    assert (hi - lo) > (nhi - nlo)


def test_power_numbers_match_the_spec_table():
    # §15: 30% base rate, 50 pp shift → about 15 days per phase
    n = S.two_proportion_n(0.8, 0.3)
    assert 12 <= n <= 18
