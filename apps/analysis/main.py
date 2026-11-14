"""FoodTrack analysis service — four narrow, stateless endpoints (06 §1). Reads Postgres as the
non-superuser app role with app.user_id set per transaction. Internal network only."""
from __future__ import annotations
import os
from datetime import date
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from engine.associations import ENGINE_VERSION, analyze
from engine.config import analysis_config
from engine.load import load_user
from engine import stats as S
from engine.trials import design_power, verdict

app = FastAPI(title="FoodTrack analysis", docs_url=None, redoc_url=None, openapi_url=None)
DSN = os.environ.get("DATABASE_URL", "postgresql://foodtrack_app:foodtrack_app@localhost:5432/foodtrack")


class AssocReq(BaseModel):
    user_id: str
    frm: date | None = None
    to: date | None = None
    outcomes: list[str] | None = None
    params: dict | None = None


class PowerReq(BaseModel):
    p_base: float
    p_exposed_prevalence: float
    n_exposed_now: int
    delta: float | None = None


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/analyze/associations")
def associations(req: AssocReq) -> dict:
    cfg = {**analysis_config(), **(req.params or {})}
    try:
        ds = load_user(DSN, req.user_id, req.frm, req.to)
    except LookupError:
        raise HTTPException(404, "no such user")
    out = analyze(ds, cfg, outcomes=req.outcomes)
    for a in out["associations"]:
        a["exposure_label"] = ds.labels.get(a["exposure_ref"], {"en": a["exposure_ref"], "he": a["exposure_ref"]})
    for ne in out["not_enough_data"]:
        ne["exposure_label"] = ds.labels.get(ne["exposure_ref"], {"en": ne["exposure_ref"], "he": ne["exposure_ref"]})
    return {"engine_version": ENGINE_VERSION, **out}


@app.post("/analyze/power")
def power(req: PowerReq) -> dict:
    cfg = analysis_config()
    d = req.delta or cfg["min_interesting_rd"]
    n_pairs = S.two_proportion_n(min(0.99, req.p_base + d), req.p_base)
    need = max(cfg["min_exposed_days"], n_pairs)
    pe = req.p_exposed_prevalence
    if pe < cfg["days_more_min_prevalence"]:
        return {"days_more": None, "reason": "too_rare"}
    more = max(0, -(-(need - req.n_exposed_now) // 1) / pe)
    more = int(-(-more // 1))
    return {"days_more": more if more <= cfg["days_more_max_shown"] else None, "reason": None if more <= cfg["days_more_max_shown"] else "too_long", "n_exposed_needed": need}


class TrialReq(BaseModel):
    days: list[dict]
    hypothesis: dict
    outcome_type: str
    guesses: list[dict] | None = None
    allocation: list[str] | None = None
    partial: dict | None = None


@app.post("/analyze/trial")
def trial(req: TrialReq) -> dict:
    return verdict(req.days, req.hypothesis, req.outcome_type, req.guesses, req.allocation, req.partial, analysis_config())


class TrialPowerReq(BaseModel):
    on_days: int
    off_days: int
    p_base: float
    log_rate: float
    mie: float


@app.post("/analyze/trial-power")
def trial_power(req: TrialPowerReq) -> dict:
    cfg = analysis_config()
    p = design_power({"on_days": req.on_days, "off_days": req.off_days}, req.p_base, req.log_rate, req.mie, sims=cfg["trial_power_simulations"], bar=cfg["trial_decision_bar"])
    return {"power": p, "adequate": p >= cfg["trial_power_target"]}
