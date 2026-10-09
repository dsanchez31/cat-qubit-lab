# Numerics

## Fock truncation

The Fock basis is infinite; the simulation keeps the first `N` levels. A coherent state of mean
`|α|²` has almost no weight above `|α|² + a few √|α|²` photons, so
`N = ⌈|α|² + 6|α| + 12⌉` (clamped to `[12, 60]`) is enough for the dynamics and the Wigner function
(`recommended_dimension` in `crates/physics/src/flip_times.rs`). States built in the truncated space
are renormalized (`states.rs`).

Flip times need more. The truncation edge breaks the symmetry that protects `|±α⟩` and creates
spurious bit flips, negligible for the dynamics but dominant once the true bit-flip time exceeds
about `10⁹ / κ₂`: with the plain rule, `T_bf` saturates around `|α|² ≈ 5` and then decreases.
`flip_time_dimension` adds 20 levels, which converges both times to better than `10⁻³` up to
`|α|² = 8` (`crates/physics/tests/convergence.rs` checks it against 10 more levels).

## The Lindblad equation

An open system evolves according to the **Lindblad master equation**:

```
dρ/dt = Σ_k ( L_k ρ L_k† − ½ L_k†L_k ρ − ½ ρ L_k†L_k )
```

Each **jump operator** `L_k` describes one way the environment acts on the system (here
`√κ₂ (a² − α²)`, `√κ₁ a`, `√κφ a†a`). There is no Hamiltonian term: in the frame used by the model,
the cat is entirely shaped by dissipation.

The right-hand side is a linear map of `ρ`, the **Liouvillian** `L`. `Lindbladian::apply` in
`lindblad.rs` evaluates it with sparse products: every operator here has at most three non-zero
diagonals, so a product costs `O(N²)` instead of `O(N³)`. `K = Σ L_k†L_k` is precomputed.

## RK4

`dρ/dt = L(ρ)` is integrated with the classical fourth-order Runge-Kutta method: four evaluations
of `L` per step, combined with weights 1/6, 2/6, 2/6, 1/6 (`Rk4Integrator::step`).

The equation is **stiff**: some components decay very fast (rates up to about `κ₂ N²`), others very
slowly. An explicit method is only stable if `dt × |λ| ≲ 2.8` for every eigenvalue `λ` of `L`. The
code bounds the spectral radius with Gershgorin's theorem (`2 Σ ‖L_k†L_k‖`, each norm bounded by the
largest absolute row sum) and takes `dt = 2 / bound`. Simple and safe, at the price of many small
steps; an implicit or exponential integrator would be the next step for larger systems.

## The Wigner function

For a density matrix in the Fock basis, the Wigner function has a closed form. Writing
`u = 2(x² + p²)` and `θ = atan2(p, x)`:

```
W(x, p) = (1/π) Σ_{d≥0} c_d Re[ e^{−i d θ} Σ_n ρ_{n+d, n} ψ_n^{(d)}(u) ]      c_0 = 1, c_d = 2
ψ_n^{(d)}(u) = (−1)^n √(n!/(n+d)!) u^{d/2} e^{−u/2} L_n^{(d)}(u)
```

`L_n^{(d)}` are generalized Laguerre polynomials. Taken alone they reach huge values (around 10¹⁷
for `N = 60`) that overflow `f32`; the normalized functions `ψ` stay between −1 and 1. They obey the
same three-term recurrence as the polynomials,

```
ψ_{n+1} = −[ (2n + d + 1 − u) ψ_n + √(n(n+d)) ψ_{n−1} ] / √((n+1)(n+1+d))
```

starting from `ψ_0^{(d)} = u^{d/2} e^{−u/2} / √(d!)`, itself built incrementally over `d`. This is
what lets the same algorithm run in double precision on the CPU (`wigner.rs`) and in single
precision on the GPU (`apps/web/src/gpu/wigner.wgsl`), one grid point per GPU thread.

## Flip times from the spectrum

Bit-flip times grow exponentially with `|α|²`: the reference data already give `2 × 10⁷` (in units
of `1/κ₂`) at `|α|² = 4` with `κ₁/κ₂ = 10⁻²`. No time-domain simulation can reach that, so the times are read from
the **spectrum** of the Liouvillian: every eigenvalue `λ` is a decay mode `e^{λt}`, and the slowest
modes are the logical errors.

Structure makes this cheap (`flip_times.rs`):

1. With a real `α` the Liouvillian is a real matrix.
2. Every term maps `|m⟩⟨n|` to `|m'⟩⟨n'|` with `m − m'` and `n − n'` of the same parity, so the
   parity of `m − n` is conserved: the Liouvillian splits into two independent blocks of about
   `N²/2` elements each.
3. The **odd block** holds the coherence `|C+⟩⟨C−|`, whose decay is the bit flip. Its eigenvalue of
   smallest magnitude is `−Γ_bf`.
4. The **even block** holds the parity and the steady state (eigenvalue 0). The steady state is
   computed first, then shifted away (`L' = L − s ρ_ss tr(·)`, which moves its eigenvalue to `−s`
   without touching the other modes). The smallest remaining eigenvalue is `−Γ_pf`.

The smallest eigenvalue is found by **inverse iteration**: factor the block once (LU with partial
pivoting, `linalg.rs`), then repeatedly solve `L y = x` and normalize. Each solve multiplies the
slow mode by `1/λ`, which is enormous compared with the other modes, so a handful of iterations
converge. The time is `T = 1/Γ`.

## Validation

`reference/src/cat_reference/generate.py` computes the same quantities with dynamiqs, an
independent library (adaptive Tsit5 integrator, full dense eigendecomposition, QuTiP-style Wigner
algorithm). `crates/physics/tests/reference.rs` compares:

| Quantity | Tolerance |
| --- | --- |
| `ρ(t)` along two trajectories | 1e-6 per entry |
| bit-flip and phase-flip times | 1e-4 relative |
| Wigner function of two cats | 1e-9 |
