"""Generate dynamiqs reference data for crates/physics/tests/reference.rs.

Run with `uv run generate` from the reference/ directory. Results are written to reference/data/.
"""

import json
from importlib.metadata import version
from pathlib import Path

import dynamiqs as dq
import jax
import jax.numpy as jnp
import numpy as np

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# Same physical units as the Rust crate: rates in units of kappa2 when kappa2 = 1.
TIME_EVOLUTION_CASES = [
    {"name": "inflation", "alpha": 2.0, "kappa1": 0.0, "kappa2": 1.0, "kappa_phi": 0.0},
    {
        "name": "inflation_with_losses",
        "alpha": 1.5,
        "kappa1": 0.05,
        "kappa2": 1.0,
        "kappa_phi": 0.01,
    },
]
TIMES = [0.0, 0.25, 0.5, 1.0, 2.0]

# Rates kept above ~1e-8 so that a dense eigensolver resolves them accurately.
FLIP_TIME_CASES = [
    {"alpha": alpha, "kappa1": 1e-2, "kappa2": 1.0, "kappa_phi": kappa_phi}
    for alpha in (1.0, 1.5, 2.0)
    for kappa_phi in (0.0, 1e-3)
]

WIGNER_CASES = [
    {"name": "even_cat", "alpha": 2.0, "odd": False},
    {"name": "odd_cat", "alpha": 1.5, "odd": True},
]
WIGNER_X = np.linspace(-5.0, 5.0, 41)
# A different length along p reveals the axis order of the dynamiqs output.
WIGNER_P = np.linspace(-4.0, 4.0, 33)


def recommended_dimension(alpha: float) -> int:
    """Mirror of cat_qubit_physics::recommended_dimension."""
    a = abs(alpha)
    return min(60, max(12, int(np.ceil(a * a + 6 * a + 12))))


def jump_operators(dim: int, alpha: float, kappa1: float, kappa2: float, kappa_phi: float):
    # Dense layout throughout: the Liouvillian is diagonalized densely anyway.
    a = dq.destroy(dim, layout=dq.dense)
    jumps = []
    if kappa2 > 0:
        jumps.append(np.sqrt(kappa2) * (a @ a - alpha**2 * dq.eye(dim, layout=dq.dense)))
    if kappa1 > 0:
        jumps.append(np.sqrt(kappa1) * a)
    if kappa_phi > 0:
        jumps.append(np.sqrt(kappa_phi) * (a.dag() @ a))
    return jumps


def cat_density_matrix(dim: int, alpha: float, odd: bool) -> np.ndarray:
    """Truncated then renormalized cat state, built exactly as in crates/physics/src/states.rs."""

    def coherent(beta: float) -> np.ndarray:
        # beta^n / sqrt(n!) by recurrence: n! overflows int64 from n = 21.
        ratios = beta / np.sqrt(np.arange(1, dim))
        ket = np.concatenate(([1.0], np.cumprod(ratios))).astype(complex)
        return ket / np.linalg.norm(ket)

    ket = coherent(alpha) + (-1 if odd else 1) * coherent(-alpha)
    ket /= np.linalg.norm(ket)
    return np.outer(ket, ket.conj())


def time_evolution() -> list[dict]:
    cases = []
    for case in TIME_EVOLUTION_CASES:
        params = {k: v for k, v in case.items() if k != "name"}
        dim = recommended_dimension(case["alpha"])
        result = dq.mesolve(
            jnp.zeros((dim, dim)),
            jump_operators(dim, **params),
            dq.todm(dq.fock(dim, 0)),
            jnp.asarray(TIMES),
            method=dq.method.Tsit5(rtol=1e-10, atol=1e-12),
        )
        states = np.asarray(result.states.to_numpy())
        cases.append(
            {
                **case,
                "dimension": dim,
                "times": TIMES,
                "states": [{"re": s.real.tolist(), "im": s.imag.tolist()} for s in states],
            }
        )
    return cases


def flip_times() -> list[dict]:
    cases = []
    for case in FLIP_TIME_CASES:
        dim = recommended_dimension(case["alpha"])
        liouvillian = dq.slindbladian(jnp.zeros((dim, dim)), jump_operators(dim, **case))
        eigenvalues, eigenvectors = np.linalg.eig(np.asarray(liouvillian.to_numpy()))
        # The parity of m - n is the same for row and column stacking of rho.
        k = np.arange(dim * dim)
        odd_offset = ((k % dim) - (k // dim)) % 2 == 1
        odd_weight = np.sum(np.abs(eigenvectors[odd_offset, :]) ** 2, axis=0)
        rates = -eigenvalues.real
        bit_flip_rate = rates[odd_weight > 0.5].min()
        even_rates = rates[(odd_weight < 0.5) & (rates > 1e-9)]
        phase_flip_rate = even_rates.min()
        cases.append(
            {
                **case,
                "dimension": dim,
                "bit_flip_time": 1.0 / bit_flip_rate,
                "phase_flip_time": 1.0 / phase_flip_rate,
            }
        )
    return cases


def wigner() -> list[dict]:
    cases = []
    for case in WIGNER_CASES:
        dim = recommended_dimension(case["alpha"])
        rho = cat_density_matrix(dim, case["alpha"], case["odd"])
        _, _, w = dq.wigner(rho, xvec=WIGNER_X, yvec=WIGNER_P, hbar=1.0)
        w = np.asarray(w)
        rows_along_p = w if w.shape == (len(WIGNER_P), len(WIGNER_X)) else w.T
        cases.append(
            {
                **case,
                "dimension": dim,
                "x": WIGNER_X.tolist(),
                "p": WIGNER_P.tolist(),
                "values": rows_along_p.tolist(),
            }
        )
    return cases


def write(name: str, cases: list[dict]) -> None:
    payload = {"generator": f"dynamiqs {version('dynamiqs')}", "cases": cases}
    path = DATA_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=1) + "\n")
    print(f"wrote {path.relative_to(DATA_DIR.parent)}")


def main() -> None:
    # Small dense problems in double precision: the CPU is the right backend, no CUDA jaxlib needed.
    jax.config.update("jax_platforms", "cpu")
    dq.set_precision("double")
    DATA_DIR.mkdir(exist_ok=True)
    write("time_evolution", time_evolution())
    write("flip_times", flip_times())
    write("wigner", wigner())


if __name__ == "__main__":
    main()
