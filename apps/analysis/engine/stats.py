"""Statistical primitives for 04-analysis-engine.md §6–§7. Small-n honest, numpy-vectorised."""
from __future__ import annotations
import math
import numpy as np
from scipy import stats as st

Z95 = 1.959963984540054


def wilson(k: float, n: float, z: float = Z95) -> tuple[float, float]:
    if n <= 0:
        return (0.0, 1.0)
    p = k / n
    den = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, centre - half), min(1.0, centre + half))


def newcombe_rd(k1: float, n1: float, k0: float, n0: float) -> tuple[float, float]:
    """Newcombe hybrid score interval (method 10) for p1 - p0. Well-behaved at small n, unlike Wald."""
    p1, p0 = k1 / n1, k0 / n0
    l1, u1 = wilson(k1, n1)
    l0, u0 = wilson(k0, n0)
    d = p1 - p0
    lo = d - math.sqrt((p1 - l1) ** 2 + (u0 - p0) ** 2)
    hi = d + math.sqrt((u1 - p1) ** 2 + (p0 - l0) ** 2)
    return (lo, hi)


def binary_p(k1: int, n1: int, k0: int, n0: int) -> float:
    table = [[k1, n1 - k1], [k0, n0 - k0]]
    expected_min = min(n1, n0) * min(k1 + k0, n1 + n0 - k1 - k0) / max(1, n1 + n0)
    if expected_min < 5:
        return float(st.fisher_exact(table).pvalue)
    return float(st.chi2_contingency(table, correction=False).pvalue)


def welch(x1: np.ndarray, x0: np.ndarray, w1: np.ndarray | None = None, w0: np.ndarray | None = None):
    """Weighted difference in means with Welch-Satterthwaite df. Returns (diff, lo, hi, p, d)."""
    w1 = np.ones_like(x1) if w1 is None else w1
    w0 = np.ones_like(x0) if w0 is None else w0
    m1, m0 = np.average(x1, weights=w1), np.average(x0, weights=w0)
    v1 = np.average((x1 - m1) ** 2, weights=w1) * len(x1) / max(1, len(x1) - 1)
    v0 = np.average((x0 - m0) ** 2, weights=w0) * len(x0) / max(1, len(x0) - 1)
    n1, n0 = w1.sum(), w0.sum()
    se = math.sqrt(v1 / n1 + v0 / n0) if (v1 + v0) > 0 else 1e-9
    df = (v1 / n1 + v0 / n0) ** 2 / max(1e-12, (v1 / n1) ** 2 / max(1, n1 - 1) + (v0 / n0) ** 2 / max(1, n0 - 1))
    diff = m1 - m0
    tcrit = st.t.ppf(0.975, max(1.0, df))
    p = 2 * st.t.sf(abs(diff) / se, max(1.0, df))
    pooled = math.sqrt(((n1 - 1) * v1 + (n0 - 1) * v0) / max(1, n1 + n0 - 2)) or 1e-9
    return diff, diff - tcrit * se, diff + tcrit * se, float(p), diff / pooled


def hodges_lehmann(x1: np.ndarray, x0: np.ndarray) -> float:
    """Median of all pairwise differences — rank-based robustness check (§6.2)."""
    return float(np.median(np.subtract.outer(x1, x0)))


def lag1_autocorr(y: np.ndarray) -> float:
    y = y[~np.isnan(y)]
    if len(y) < 8 or np.std(y) == 0:
        return 0.0
    return float(np.corrcoef(y[:-1], y[1:])[0, 1])


_BLOCK_CACHE: dict[tuple[int, int, int], np.ndarray] = {}


def block_indices(n: int, resamples: int, seed: int = 7) -> np.ndarray:
    """Moving-block bootstrap index matrix, block length ≈ n^(1/3) (§6.4). Cached per (n, resamples)."""
    key = (n, resamples, seed)
    if key not in _BLOCK_CACHE:
        rng = np.random.default_rng(seed)
        L = max(2, round(n ** (1 / 3)))
        nb = math.ceil(n / L)
        starts = rng.integers(0, n - L + 1, size=(resamples, nb))
        idx = (starts[:, :, None] + np.arange(L)[None, None, :]).reshape(resamples, -1)[:, :n]
        _BLOCK_CACHE[key] = idx
    return _BLOCK_CACHE[key]


def bootstrap_rd(x: np.ndarray, y: np.ndarray, w: np.ndarray, resamples: int) -> tuple[float, float, float]:
    """x: exposure 0/1, y: outcome (0/1 or continuous), in day order. Returns (lo, hi, p) for mean(y|x=1)-mean(y|x=0)."""
    idx = block_indices(len(x), resamples)
    X, Y, W = x[idx], y[idx], w[idx]
    w1 = (W * X).sum(1); w0 = (W * (1 - X)).sum(1)
    ok = (w1 > 0) & (w0 > 0)
    m1 = (W * X * Y).sum(1)[ok] / w1[ok]
    m0 = (W * (1 - X) * Y).sum(1)[ok] / w0[ok]
    d = m1 - m0
    est = np.average(y[x == 1], weights=w[x == 1]) - np.average(y[x == 0], weights=w[x == 0])
    lo, hi = np.percentile(d, [2.5, 97.5])
    p = float(min(1.0, (np.sum(np.abs(d - est) >= abs(est)) + 1) / (len(d) + 1)))
    return float(lo), float(hi), p


def ridge_effect(y: np.ndarray, x: np.ndarray, Z: np.ndarray, w: np.ndarray, folds: int = 5, seed: int = 3) -> float:
    """Penalised linear model y ~ x + Z (ridge on Z only, λ by k-fold CV). Returns the adjusted x coefficient.
    For a binary y this is a linear-probability model, so the coefficient is directly a risk difference."""
    n = len(y)
    if Z.shape[1] == 0:
        Z = np.zeros((n, 0))
    Zs = (Z - Z.mean(0)) / np.where(Z.std(0) > 0, Z.std(0), 1)
    A = np.column_stack([np.ones(n), x, Zs])
    pen = np.r_[0, 0, np.ones(Zs.shape[1])]
    def fit(Aw, yw, ww, lam):
        Wm = ww[:, None]
        return np.linalg.solve(Aw.T @ (Aw * Wm) + lam * np.diag(pen) + 1e-9 * np.eye(Aw.shape[1]), Aw.T @ (yw * ww))
    rng = np.random.default_rng(seed)
    order = rng.permutation(n)
    best, best_err = 1.0, math.inf
    for lam in [0.01, 0.1, 1, 3, 10, 30, 100]:
        err = 0.0
        for f in range(folds):
            te = order[f::folds]; tr = np.setdiff1d(order, te)
            b = fit(A[tr], y[tr], w[tr], lam)
            err += float(np.sum(w[te] * (y[te] - A[te] @ b) ** 2))
        if err < best_err:
            best, best_err = lam, err
    return float(fit(A, y, w, best)[1])


def benjamini_hochberg(p: list[float]) -> list[float]:
    m = len(p)
    if m == 0:
        return []
    order = np.argsort(p)
    q = np.empty(m)
    prev = 1.0
    for rank in range(m, 0, -1):
        i = order[rank - 1]
        prev = min(prev, p[i] * m / rank)
        q[i] = prev
    return [float(min(1.0, x)) for x in q]


def two_proportion_n(p1: float, p2: float, power: float = 0.8, alpha: float = 0.05) -> int:
    """Per-group n for a two-sided two-proportion test (normal approximation)."""
    p1, p2 = min(max(p1, 1e-6), 1 - 1e-6), min(max(p2, 1e-6), 1 - 1e-6)
    za, zb = st.norm.ppf(1 - alpha / 2), st.norm.ppf(power)
    pbar = (p1 + p2) / 2
    num = (za * math.sqrt(2 * pbar * (1 - pbar)) + zb * math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2
    return math.ceil(num / (p1 - p2) ** 2)
