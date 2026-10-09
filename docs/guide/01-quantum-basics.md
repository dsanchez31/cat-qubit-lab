# Quantum basics

## States and superposition

A classical bit is 0 or 1. A quantum system is described by a **state vector** `|ψ⟩`, a list of
complex numbers called amplitudes, one per possible outcome. For a qubit,

```
|ψ⟩ = c₀ |0⟩ + c₁ |1⟩
```

Measuring gives 0 with probability `|c₀|²` and 1 with probability `|c₁|²`. Before the measurement
both possibilities coexist: this is **superposition**. The complex phases of the amplitudes matter
too, they decide how amplitudes add up or cancel (**interference**).

Two kinds of errors can hit a qubit:

- a **bit flip** swaps `|0⟩` and `|1⟩`;
- a **phase flip** changes the sign of `c₁`, invisible on a single measurement but fatal for
  interference.

Quantum error correction must handle both, which is why it is so expensive.

## The harmonic oscillator

A superconducting resonator is a circuit in which microwave light bounces back and forth. Quantum
mechanically it is a **harmonic oscillator**: its energy comes in identical packets, photons. The
states with exactly `n` photons are the **Fock states** `|0⟩, |1⟩, |2⟩, …`; `|0⟩` is the vacuum.

Two operators act on these states:

- the **annihilation operator** `a` removes a photon: `a |n⟩ = √n |n−1⟩`;
- its adjoint `a†` adds one: `a† |n⟩ = √(n+1) |n+1⟩`.

`a†a` counts photons: `a†a |n⟩ = n |n⟩`. Any state of the resonator is a superposition of Fock
states, so it is a vector `(c₀, c₁, c₂, …)` and operators are matrices acting on it. That is all a
simulation needs: vectors, matrices, and products. See `SparseMatrix::annihilation` and
`SparseMatrix::number` in `crates/physics/src/fock.rs`.

**Parity** is `(−1)^n`: +1 for even photon numbers, −1 for odd ones. It will play a central role.

## Density matrices

A state vector describes a system perfectly isolated from the rest of the world. A real resonator
leaks photons into its environment, and our knowledge of it becomes statistical. The general
description is the **density matrix**

```
ρ = Σ_k p_k |ψ_k⟩⟨ψ_k|
```

a mixture of pure states with probabilities `p_k`. In the Fock basis it is a square matrix
`ρ_mn`:

- the diagonal `ρ_nn` gives the probability of finding `n` photons;
- the off-diagonal entries (the **coherences**) carry the phase information that makes
  interference possible.

Useful numbers (`crates/physics/src/observables.rs`):

| Quantity | Formula | Meaning |
| --- | --- | --- |
| trace | `Σ ρ_nn` | total probability, always 1 |
| mean photon number | `Σ n ρ_nn` | average energy |
| parity | `Σ (−1)^n ρ_nn` | +1 even, −1 odd, 0 for an even/odd mixture |
| purity | `tr(ρ²)` | 1 for a pure state, smaller once information has leaked out |

## The Wigner function

A matrix is hard to look at. The **Wigner function** `W(x, p)` turns the state into a landscape
over the plane of two quadratures: `x` (the field amplitude in phase with a reference) and `p`
(the amplitude in quadrature). It behaves like a probability density, it integrates to 1 and its
projections on `x` or `p` give the measured distributions, with one exception: it can be
**negative**. Negative regions have no classical counterpart; they are the signature of quantum
interference.

- vacuum: a Gaussian bump at the origin;
- Fock `|1⟩`: a ring whose center dips to `−1/π`;
- coherent state: a Gaussian bump displaced from the origin;
- cat state: two bumps with interference fringes in between, alternately positive and negative.

In the app the height is `W`, teal marks negative values and yellow positive ones.

The convention used everywhere in this repository is `a = (x + i p)/√2`, so the vacuum is
`W = exp(−x² − p²)/π` and a coherent state `|α⟩` with a real `α` sits at `x = √2 α`.
