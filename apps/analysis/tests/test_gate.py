"""THE release gate (04 §13, CLAUDE.md rule 4): 500 simulated users with NO real effect;
fewer than 10% may surface any medium-or-higher insight. Never weaken this to make it pass."""
from concurrent.futures import ProcessPoolExecutor
import os
import pytest
from engine.associations import analyze
from engine.config import analysis_config
from engine.synthetic import generate

N_USERS = int(os.environ.get("GATE_USERS", "500"))


def _one(seed: int) -> bool:
    days = 60 + (seed * 37) % 121           # 60–180 days of logging
    r = analyze(generate(seed=10_000 + seed, days=days), analysis_config(), with_days=False)
    return any(a["confidence"] in ("medium", "high") for a in r["associations"])


@pytest.mark.gate
def test_null_data_gate():
    with ProcessPoolExecutor(max_workers=os.cpu_count() or 2) as ex:
        hits = sum(ex.map(_one, range(N_USERS), chunksize=8))
    rate = hits / N_USERS
    print(f"null-data gate: {hits}/{N_USERS} users surfaced a medium+ insight ({rate:.1%})")
    assert rate < 0.10, f"{rate:.1%} of no-effect users got a medium+ insight — the engine invents findings"
