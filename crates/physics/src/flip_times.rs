//! Bit-flip and phase-flip times from the Liouvillian spectrum.
//!
//! Bit-flip times grow exponentially with `|α|²`, far beyond any duration a time-domain simulation can
//! cover, so the rates are read from the slow eigenvalues of the Liouvillian instead.
//!
//! With a real `α` the Liouvillian is real. Every term maps `|m⟩⟨n|` onto `|m'⟩⟨n'|` with
//! `m − m'` and `n − n'` of equal parity, so `m − n` keeps its parity and the Liouvillian is block
//! diagonal:
//! - `m − n` odd: carries `Z = |C+⟩⟨C−| + h.c.`, the slowest eigenvalue is the bit-flip rate
//!   (`Y` decays faster, at the sum of both rates);
//! - `m − n` even: carries the parity `X` and the steady state, the slowest non-zero eigenvalue is
//!   the phase-flip rate once the steady state is deflated.

use crate::linalg::{LuDecomposition, smallest_eigenvalue};
use crate::lindblad::CatParams;

/// Rates below this fraction of the total dissipation rate are rounding noise of a vanishing rate.
const NEGLIGIBLE_RELATIVE_RATE: f64 = 1e-14;

/// Characteristic times, `f64::INFINITY` when the corresponding error channel is absent.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FlipTimes {
    /// `T_bf = 1 / Γ_bf`, decay time of `⟨Z⟩`.
    pub bit_flip: f64,
    /// `T_pf = 1 / Γ_pf`, decay time of `⟨X⟩`.
    pub phase_flip: f64,
}

/// Extra Fock levels needed by the flip times on top of [`recommended_dimension`].
///
/// The truncation edge breaks the symmetry that protects `|±α⟩` and adds spurious bit flips. They
/// are invisible in the dynamics but dominate the bit-flip time once it exceeds ~1e9 / κ2: with
/// the plain truncation, `T_bf` saturates and then decreases beyond `|α|² ≈ 5`. Twenty extra
/// levels converge it to better than 1e-3 up to `|α|² = 8` (see `tests/convergence.rs`).
const FLIP_TIME_EXTRA_LEVELS: usize = 20;

/// Truncation dimension large enough for a cat of amplitude `alpha`: dynamics, Wigner function.
pub fn recommended_dimension(alpha: f64) -> usize {
    let alpha = alpha.abs();
    ((alpha * alpha + 6.0 * alpha + 12.0).ceil() as usize).clamp(12, 60)
}

/// Truncation dimension for converged flip times of a cat of amplitude `alpha`.
pub fn flip_time_dimension(alpha: f64) -> usize {
    recommended_dimension(alpha) + FLIP_TIME_EXTRA_LEVELS
}

/// Computes the bit-flip and phase-flip times in a Fock space truncated to `dim` levels.
///
/// Without two-photon dissipation (`κ2 = 0`) there is no stabilized cat manifold, hence no
/// logical qubit: both times are reported as infinite.
pub fn flip_times(params: &CatParams, dim: usize) -> FlipTimes {
    if params.kappa2 <= 0.0 {
        return FlipTimes {
            bit_flip: f64::INFINITY,
            phase_flip: f64::INFINITY,
        };
    }
    let jumps: Vec<RealSparse> = params
        .jump_operators(dim)
        .iter()
        .map(|jump| {
            RealSparse::from_columns(dim, jump.entries.iter().map(|&(r, c, v)| (r, c, v.re)))
        })
        .collect();
    let effective = effective_operator(&jumps, dim);
    let liouvillian = RealLiouvillian {
        dim,
        jumps: &jumps,
        effective: &effective,
    };

    let total_rate = params.kappa1 + params.kappa2 + params.kappa_phi;
    // Exact selection rules, so that rounding noise is never reported as a rate: `a` is the only
    // jump operator that changes the photon-number parity, hence no phase flips without
    // single-photon loss; with two-photon dissipation alone, both `|±α⟩` are stationary.
    let bit_flip_rate = (params.kappa1 > 0.0 || params.kappa_phi > 0.0)
        .then(|| bit_flip_rate(&liouvillian))
        .flatten();
    let phase_flip_rate = (params.kappa1 > 0.0)
        .then(|| phase_flip_rate(&liouvillian, total_rate))
        .flatten();
    FlipTimes {
        bit_flip: rate_to_time(bit_flip_rate, total_rate),
        phase_flip: rate_to_time(phase_flip_rate, total_rate),
    }
}

fn rate_to_time(rate: Option<f64>, total_rate: f64) -> f64 {
    match rate {
        Some(rate) if rate > NEGLIGIBLE_RELATIVE_RATE * total_rate && rate.is_finite() => {
            rate.recip()
        }
        _ => f64::INFINITY,
    }
}

fn bit_flip_rate(liouvillian: &RealLiouvillian<'_>) -> Option<f64> {
    let block = ParityBlock::new(liouvillian.dim, |m, n| m % 2 != n % 2);
    let matrix = liouvillian.restrict(&block);
    let start = vec![1.0; block.len()];
    smallest_eigenvalue(matrix, block.len(), &start).map(|lambda| -lambda)
}

fn phase_flip_rate(liouvillian: &RealLiouvillian<'_>, deflation_shift: f64) -> Option<f64> {
    if deflation_shift <= 0.0 {
        return None;
    }
    let block = ParityBlock::new(liouvillian.dim, |m, n| m % 2 == n % 2);
    let size = block.len();
    let mut matrix = liouvillian.restrict(&block);
    let trace: Vec<f64> = block
        .basis
        .iter()
        .map(|&(m, n)| if m == n { 1.0 } else { 0.0 })
        .collect();

    // Steady state: the Liouvillian rows are linearly dependent (trace preservation), so one of
    // them is replaced by the normalization tr(ρ) = 1.
    let anchor = block.position(0, 0)?;
    let mut constrained = matrix.clone();
    constrained[anchor * size..(anchor + 1) * size].copy_from_slice(&trace);
    let mut rhs = vec![0.0; size];
    rhs[anchor] = 1.0;
    let steady_state = LuDecomposition::new(constrained, size).ok()?.solve(&rhs);

    // L' = L − s ρ_ss tr(·) moves the zero eigenvalue to −s and leaves the traceless modes intact.
    for (row, &rho) in matrix.chunks_exact_mut(size).zip(&steady_state) {
        for (value, &t) in row.iter_mut().zip(&trace) {
            *value -= deflation_shift * rho * t;
        }
    }
    let start: Vec<f64> = block
        .basis
        .iter()
        .map(|&(m, n)| match (m == n, m % 2 == 0) {
            (false, _) => 0.0,
            (true, true) => 1.0,
            (true, false) => -1.0,
        })
        .collect();
    smallest_eigenvalue(matrix, size, &start).map(|lambda| -lambda)
}

/// Real sparse operator indexed by column: `columns[c]` lists the `(row, value)` pairs.
struct RealSparse {
    columns: Vec<Vec<(usize, f64)>>,
}

impl RealSparse {
    fn from_columns(dim: usize, entries: impl Iterator<Item = (usize, usize, f64)>) -> Self {
        let mut columns = vec![Vec::new(); dim];
        for (row, col, value) in entries {
            columns[col].push((row, value));
        }
        Self { columns }
    }
}

/// Dense `K = Σ_k L_kᵀ L_k`, row-major.
fn effective_operator(jumps: &[RealSparse], dim: usize) -> Vec<f64> {
    let mut effective = vec![0.0; dim * dim];
    for jump in jumps {
        for (i, column_i) in jump.columns.iter().enumerate() {
            for (j, column_j) in jump.columns.iter().enumerate() {
                let dot: f64 = column_i
                    .iter()
                    .flat_map(|&(ri, vi)| {
                        column_j
                            .iter()
                            .filter(move |&&(rj, _)| rj == ri)
                            .map(move |&(_, vj)| vi * vj)
                    })
                    .sum();
                effective[i * dim + j] += dot;
            }
        }
    }
    effective
}

/// Basis `|m⟩⟨n|` of one parity block, with the reverse lookup table.
struct ParityBlock {
    basis: Vec<(usize, usize)>,
    positions: Vec<Option<usize>>,
    dim: usize,
}

impl ParityBlock {
    fn new(dim: usize, member: impl Fn(usize, usize) -> bool) -> Self {
        let mut basis = Vec::new();
        let mut positions = vec![None; dim * dim];
        for m in 0..dim {
            for n in 0..dim {
                if member(m, n) {
                    positions[m * dim + n] = Some(basis.len());
                    basis.push((m, n));
                }
            }
        }
        Self {
            basis,
            positions,
            dim,
        }
    }

    fn len(&self) -> usize {
        self.basis.len()
    }

    fn position(&self, m: usize, n: usize) -> Option<usize> {
        self.positions[m * self.dim + n]
    }
}

struct RealLiouvillian<'a> {
    dim: usize,
    jumps: &'a [RealSparse],
    effective: &'a [f64],
}

impl RealLiouvillian<'_> {
    /// Dense row-major matrix of the Liouvillian restricted to `block`: column `c` is the image
    /// of the basis element `|m⟩⟨n|`.
    fn restrict(&self, block: &ParityBlock) -> Vec<f64> {
        let size = block.len();
        let dim = self.dim;
        let mut matrix = vec![0.0; size * size];
        let mut add = |row_m: usize, row_n: usize, column: usize, value: f64| {
            let row = block.position(row_m, row_n);
            debug_assert!(row.is_some(), "Liouvillian must preserve the parity block");
            if let Some(row) = row {
                matrix[row * size + column] += value;
            }
        };
        for (column, &(m, n)) in block.basis.iter().enumerate() {
            // L |m⟩⟨n| Lᵀ
            for jump in self.jumps {
                for &(i, vm) in &jump.columns[m] {
                    for &(j, vn) in &jump.columns[n] {
                        add(i, j, column, vm * vn);
                    }
                }
            }
            // −½ K |m⟩⟨n| − ½ |m⟩⟨n| K
            for i in 0..dim {
                let k_im = self.effective[i * dim + m];
                if k_im != 0.0 {
                    add(i, n, column, -0.5 * k_im);
                }
                let k_nj = self.effective[n * dim + i];
                if k_nj != 0.0 {
                    add(m, i, column, -0.5 * k_nj);
                }
            }
        }
        matrix
    }
}
