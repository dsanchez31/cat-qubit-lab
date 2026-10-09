# Cat qubits

## Coherent states

Drive a resonator with a classical microwave tone and it ends up in a **coherent state** `|α⟩`, the
quantum version of a classical wave with amplitude `|α|` and phase `arg α`:

```
|α⟩ = e^{−|α|²/2} Σ_n αⁿ / √(n!) |n⟩
```

The photon number follows a Poisson distribution of mean `|α|²`. In phase space it is a Gaussian
bump at distance proportional to `|α|` from the origin. Removing a photon does not change it:
`a |α⟩ = α |α⟩`. Keep this property in mind.

## Cat states

A **cat state** superposes two opposite coherent states:

```
|C±⟩ ∝ |α⟩ ± |−α⟩
```

The name refers to Schrödinger's cat: two macroscopically distinct situations at once. Expanding in
Fock states, the odd terms cancel in `|C+⟩` and the even terms cancel in `|C−⟩`: the even cat has
parity +1, the odd cat −1. In phase space: two bumps at `±α`, with fringes between them.

A qubit is encoded in this two-dimensional space. Two bases are natural:

- `|C+⟩` and `|C−⟩`, distinguished by **parity**;
- `|α⟩` and `|−α⟩` (approximately `(|C+⟩ ± |C−⟩)/√2`), distinguished by **which bump** the field
  sits in.

## Two-photon dissipation

Preparing a cat is not enough: it must stay a cat. Alice & Bob's approach is to couple the
resonator to its environment so that it can only exchange photons **in pairs**. Mathematically,
this is a dissipation process with jump operator

```
L₂ = √κ₂ (a² − α²)
```

Both `|α⟩` and `|−α⟩` satisfy `a² |±α⟩ = α² |±α⟩`, so `L₂` vanishes on them: they are stationary.
Any other state is pushed towards the space they span, at a rate set by `κ₂`. Since photons leave
and arrive two at a time, parity is conserved: the vacuum (even) inflates into the even cat
`|C+⟩`. Tutorial step 4 shows exactly this.

## Bit flips and phase flips

Real resonators also lose single photons at a rate `κ₁` (jump operator `√κ₁ a`).

- **Phase flips**: a single photon loss maps `|C+⟩` to `|C−⟩` (the parity flips) and vice versa.
  Losses happen at a rate proportional to the number of photons, so the phase-flip rate grows
  **linearly** with `|α|²`.
- **Bit flips**: to go from `|α⟩` to `|−α⟩`, the field must cross the origin while two-photon
  dissipation keeps pulling it back towards `±α`. The barrier grows with the distance between the
  bumps and the bit-flip rate is suppressed **exponentially** in `|α|²`. The exponent depends on
  the noise: close to `exp(−2|α|²)` once dephasing is present, steeper with single-photon loss
  alone (compare the two series in `reference/data/flip_times.json`).

Increasing `|α|²` therefore buys an exponential reduction of bit flips at a linear cost in phase
flips. This was demonstrated experimentally (Lescanne et al. 2020) and pushed to bit-flip times
above ten seconds (Réglade et al. 2024).

## Why the bias matters

A general-purpose quantum error correcting code must detect both error types. The surface code does
this with a 2D grid of qubits and needs hundreds to thousands of physical qubits per logical qubit.
If bit flips are negligible, only phase flips remain, and a **repetition code** suffices: a line of
cat qubits whose parities are compared pairwise, like a classical majority vote. Fewer qubits, a 1D
layout, simpler decoding. That is the central argument of the cat-qubit architecture.

Tutorial step 5 plots both times against `|α|²` on a log scale: the bit-flip curve is a straight
rising line (exponential), the phase-flip curve slowly falls (`1/|α|²`).
