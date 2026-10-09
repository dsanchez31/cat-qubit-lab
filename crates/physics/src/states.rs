//! Initial density matrices in the truncated Fock space.

use crate::fock::{C64, DenseMatrix};

/// Below this norm a superposition is treated as vanishing.
const VANISHING_NORM: f64 = 1e-12;

/// Photon-number parity of a cat state `|β⟩ ± |−β⟩`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CatParity {
    /// `|C+⟩ ∝ |β⟩ + |−β⟩`, even photon numbers only.
    Even,
    /// `|C−⟩ ∝ |β⟩ − |−β⟩`, odd photon numbers only.
    Odd,
}

/// Vacuum state `|0⟩⟨0|`.
pub fn vacuum(dim: usize) -> DenseMatrix {
    fock(dim, 0)
}

/// Fock state `|n⟩⟨n|`, `n` clamped to the highest available level.
pub fn fock(dim: usize, n: usize) -> DenseMatrix {
    let mut rho = DenseMatrix::zeros(dim);
    let level = n.min(dim - 1);
    rho.set(level, level, C64::new(1.0, 0.0));
    rho
}

/// Coherent state `|β⟩⟨β|`, renormalized after truncation.
pub fn coherent(dim: usize, beta: C64) -> DenseMatrix {
    pure_state(&coherent_ket(dim, beta))
}

/// Cat state `|β⟩ ± |−β⟩`, renormalized. Falls back to `|0⟩` or `|1⟩` when `β → 0`.
pub fn cat(dim: usize, beta: C64, parity: CatParity) -> DenseMatrix {
    let sign = match parity {
        CatParity::Even => 1.0,
        CatParity::Odd => -1.0,
    };
    let plus = coherent_ket(dim, beta);
    let minus = coherent_ket(dim, -beta);
    let ket: Vec<C64> = plus.iter().zip(&minus).map(|(p, m)| p + m * sign).collect();
    if norm(&ket) < VANISHING_NORM {
        return match parity {
            CatParity::Even => fock(dim, 0),
            CatParity::Odd => fock(dim, 1),
        };
    }
    pure_state(&ket)
}

fn coherent_ket(dim: usize, beta: C64) -> Vec<C64> {
    let mut ket = Vec::with_capacity(dim);
    let mut amplitude = C64::new(1.0, 0.0);
    for n in 0..dim {
        if n > 0 {
            amplitude *= beta / (n as f64).sqrt();
        }
        ket.push(amplitude);
    }
    let scale = norm(&ket).recip();
    ket.iter().map(|c| c * scale).collect()
}

fn norm(ket: &[C64]) -> f64 {
    ket.iter().map(C64::norm_sqr).sum::<f64>().sqrt()
}

fn pure_state(ket: &[C64]) -> DenseMatrix {
    let dim = ket.len();
    let scale = norm(ket).powi(-2);
    let mut rho = DenseMatrix::zeros(dim);
    for (m, psi_m) in ket.iter().enumerate() {
        for (n, psi_n) in ket.iter().enumerate() {
            rho.set(m, n, psi_m * psi_n.conj() * scale);
        }
    }
    rho
}
