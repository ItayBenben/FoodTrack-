"""M7 — genericity proof: a tracker added as pure config is an outcome the engine analyses, with no code change."""
from datetime import timedelta
import numpy as np
from engine.associations import analyze
from engine.config import analysis_config
from engine.model import Obs, outcome_defs
from engine.synthetic import generate


def test_migraine_is_discovered_from_config():
    refs = {o.ref for o in outcome_defs(generate(seed=1, days=30).defs)}
    assert {"migraine.severity_max", "migraine.severity_max_notable"} <= refs


def test_engine_finds_a_food_headache_link_in_a_tracker_it_has_never_seen():
    ds = generate(seed=11, days=160, prevalence={"wine": 0.12})
    rng = np.random.default_rng(0)
    wine = [m.at for m in ds.meals if "alcohol" in m.tags]
    for d in sorted({m.day for m in ds.meals}):
        t = next((m.at for m in ds.meals if m.day == d and m.slot == "dinner"), None)
        if t is None:
            continue
        hit = any(timedelta(hours=6) <= (t + timedelta(hours=14) - w) < timedelta(hours=24) for w in wine)
        sev = int(rng.integers(5, 9)) if (hit and rng.random() < 0.8) else int(rng.random() < 0.15) * 4
        ds.obs.append(Obs("migraine", t + timedelta(hours=14), d + timedelta(days=1), "exact", {"severity": sev}))
    r = analyze(ds, analysis_config(), outcomes=["migraine.severity_max", "migraine.severity_max_notable"])
    assert any(a["exposure_ref"] == "tag:alcohol" and a["outcome_ref"].startswith("migraine") for a in r["associations"])
