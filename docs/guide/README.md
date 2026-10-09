# Guide

Background for reading this repository without prior knowledge of quantum physics or Rust.

1. [Quantum basics](01-quantum-basics.md): states, superposition, the harmonic oscillator, density
   matrices, the Wigner function.
2. [Cat qubits](02-cat-qubits.md): coherent states, cat states, two-photon dissipation, bit flips and
   phase flips, why the bias matters for error correction.
3. [Numerics](03-numerics.md): Fock truncation, the Lindblad equation, RK4, the Wigner expansion,
   flip times from the Liouvillian spectrum.
4. [Rust primer](04-rust-primer.md): the language features used in `crates/`, read through the code.
5. [Architecture](05-architecture.md): how a slider move becomes a new surface on screen.

Each chapter points to the files that implement what it describes.
