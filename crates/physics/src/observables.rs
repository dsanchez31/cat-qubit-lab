//! Expectation values read from a density matrix.

use crate::fock::{C64, DenseMatrix};

/// Scalar observables displayed alongside the phase-space picture.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Observables {
    /// `⟨a†a⟩`
    pub mean_photon_number: f64,
    /// `⟨(−1)^{a†a}⟩`
    pub parity: f64,
    /// `tr(ρ²)`
    pub purity: f64,
    /// `tr(ρ)`, drifts away from 1 only through numerical error.
    pub trace: f64,
}

/// Computes the observables of a Hermitian density matrix.
pub fn measure(rho: &DenseMatrix) -> Observables {
    let mut mean_photon_number = 0.0;
    let mut parity = 0.0;
    let mut trace = 0.0;
    for n in 0..rho.dim {
        let population = rho.get(n, n).re;
        mean_photon_number += n as f64 * population;
        parity += if n % 2 == 0 { population } else { -population };
        trace += population;
    }
    let purity = rho.data.iter().map(C64::norm_sqr).sum();
    Observables {
        mean_photon_number,
        parity,
        purity,
        trace,
    }
}
