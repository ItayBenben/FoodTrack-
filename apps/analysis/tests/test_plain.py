import json

import numpy as np

from engine.plain import plain


def test_numpy_values_become_json_types():
    out = plain({"adequate": np.float64(0.9) >= 0.8, "p": np.float64(0.25), "n": np.int64(3),
                 "rows": [(np.bool_(False), np.array([1.5, 2.5]))], "s": "x", "none": None})
    assert out == {"adequate": True, "p": 0.25, "n": 3, "rows": [[False, [1.5, 2.5]]], "s": "x", "none": None}
    assert type(out["adequate"]) is bool and type(out["n"]) is int
    json.dumps(out)
