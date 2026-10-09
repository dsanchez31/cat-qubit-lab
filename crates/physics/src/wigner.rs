//! Wigner function on a square phase-space grid.
//!
//! Convention: `a = (x + i p) / √2`, so that `∫ W(x, p) dx dp = 1` and the vacuum is
//! `W = exp(−x² − p²) / π`. The density matrix is expanded over its diagonals `d = m − n`:
//!
//! `W(x, p) = (1/π) Σ_d c_d Re[ e^{−i d θ} Σ_n ρ_{n+d, n} ψ_n^{(d)}(u) ]`
//!
//! with `u = 2 (x² + p²)`, `θ = atan2(p, x)`, `c_0 = 1`, `c_{d>0} = 2` and
//! `ψ_n^{(d)}(u) = (−1)^n √(n! / (n+d)!) u^{d/2} e^{−u/2} L_n^{(d)}(u)`, a function bounded by 1
//! that obeys the generalized Laguerre three-term recurrence. The same algorithm runs in the WGSL
//! compute shader of the web app.

use std::f64::consts::PI;

use crate::fock::{C64, DenseMatrix};

/// Square grid `x, p ∈ [−extent, extent]` with `resolution` points per axis.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhaseSpaceGrid {
    /// Points per axis, at least 2.
    pub resolution: usize,
    /// Half-width of the grid.
    pub extent: f64,
}

impl PhaseSpaceGrid {
    /// Coordinate of the `i`-th point along either axis.
    pub fn coordinate(&self, i: usize) -> f64 {
        -self.extent + 2.0 * self.extent * i as f64 / (self.resolution - 1) as f64
    }
}

/// Wigner function sampled on `grid`, row-major with rows indexed by `p` and columns by `x`.
pub fn wigner(rho: &DenseMatrix, grid: &PhaseSpaceGrid) -> Vec<f64> {
    let mut values = Vec::with_capacity(grid.resolution * grid.resolution);
    for row in 0..grid.resolution {
        let p = grid.coordinate(row);
        for col in 0..grid.resolution {
            values.push(wigner_at(rho, grid.coordinate(col), p));
        }
    }
    values
}

/// Wigner function at a single phase-space point.
pub fn wigner_at(rho: &DenseMatrix, x: f64, p: f64) -> f64 {
    let dim = rho.dim;
    let u = 2.0 * (x * x + p * p);
    let theta = p.atan2(x);
    let mut total = 0.0;
    // ψ_0^{(d)} = u^{d/2} e^{−u/2} / √(d!), built incrementally to avoid overflow.
    let mut psi_first = (-0.5 * u).exp();
    for d in 0..dim {
        if d > 0 {
            psi_first *= (u / d as f64).sqrt();
        }
        let df = d as f64;
        let mut psi_previous = 0.0;
        let mut psi = psi_first;
        let mut diagonal_sum = rho.get(d, 0) * psi;
        for n in 0..dim - d - 1 {
            let nf = n as f64;
            let psi_next = -((2.0 * nf + df + 1.0 - u) * psi
                + (nf * (nf + df)).sqrt() * psi_previous)
                / ((nf + 1.0) * (nf + 1.0 + df)).sqrt();
            psi_previous = psi;
            psi = psi_next;
            diagonal_sum += rho.get(n + 1 + d, n + 1) * psi;
        }
        let weight = if d == 0 { 1.0 } else { 2.0 };
        let phase = C64::from_polar(1.0, -df * theta);
        total += weight * (phase * diagonal_sum).re;
    }
    total / PI
}
