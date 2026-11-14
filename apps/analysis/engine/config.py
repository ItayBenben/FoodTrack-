"""Loads config/analysis.json and the tracker definitions (the engine reads them; nothing is hard-coded)."""
from __future__ import annotations
import json
import os
from functools import lru_cache
from pathlib import Path


def repo_root() -> Path:
    here = Path(__file__).resolve()
    for p in [here, *here.parents]:
        if (p / "config" / "trackers").is_dir():
            return p
    return Path(os.environ.get("FOODTRACK_ROOT", "/app"))


def config_dir() -> Path:
    return Path(os.environ.get("CONFIG_DIR", repo_root() / "config"))


@lru_cache
def analysis_config() -> dict:
    return json.loads((config_dir() / "analysis.json").read_text())


@lru_cache
def tracker_definitions() -> dict[str, dict]:
    out = {}
    for f in sorted((config_dir() / "trackers").glob("*.json")):
        d = json.loads(f.read_text())
        out[d["key"]] = d
    return out
