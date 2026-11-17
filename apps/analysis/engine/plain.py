"""Responses leave as plain JSON types. numpy scalars (np.bool_, np.float64, …) are not JSON types, and newer
pydantic refuses to serialize them; one slipping through turned every insight request into a 500. Converting
at the boundary keeps the engine free to use numpy anywhere."""
from __future__ import annotations
import functools
from typing import Any, Callable

import numpy as np


def plain(x: Any) -> Any:
    if isinstance(x, dict):
        return {k: plain(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [plain(v) for v in x]
    if isinstance(x, np.ndarray):
        return plain(x.tolist())
    if isinstance(x, np.generic):
        return x.item()
    return x


def plain_route(fn: Callable[..., Any]) -> Callable[..., Any]:
    @functools.wraps(fn)
    def wrapper(*a: Any, **kw: Any) -> Any:
        return plain(fn(*a, **kw))
    return wrapper
