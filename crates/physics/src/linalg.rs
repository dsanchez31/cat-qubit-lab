//! Real dense linear algebra: LU decomposition and inverse iteration.

use std::fmt;

/// Relative change of the inverse-iteration estimate below which it is considered converged.
const INVERSE_ITERATION_TOLERANCE: f64 = 1e-12;
const INVERSE_ITERATION_MAX_STEPS: usize = 200;

/// Error raised when a pivot vanishes during the LU decomposition.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SingularMatrix;

impl fmt::Display for SingularMatrix {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("matrix is singular")
    }
}

impl std::error::Error for SingularMatrix {}

/// LU decomposition with partial pivoting of a square row-major matrix.
#[derive(Clone, Debug)]
pub struct LuDecomposition {
    dim: usize,
    lu: Vec<f64>,
    pivots: Vec<usize>,
}

impl LuDecomposition {
    /// Factorizes the `dim × dim` row-major `matrix`.
    ///
    /// # Errors
    ///
    /// Returns [`SingularMatrix`] when a pivot is exactly zero.
    ///
    /// # Panics
    ///
    /// Panics when `matrix` does not hold `dim * dim` entries.
    pub fn new(mut matrix: Vec<f64>, dim: usize) -> Result<Self, SingularMatrix> {
        assert_eq!(matrix.len(), dim * dim, "matrix must be dim × dim");
        let mut pivots = Vec::with_capacity(dim);
        for k in 0..dim {
            let pivot_row = (k..dim)
                .max_by(|&a, &b| {
                    matrix[a * dim + k]
                        .abs()
                        .total_cmp(&matrix[b * dim + k].abs())
                })
                .unwrap_or(k);
            if matrix[pivot_row * dim + k] == 0.0 {
                return Err(SingularMatrix);
            }
            if pivot_row != k {
                for j in 0..dim {
                    matrix.swap(k * dim + j, pivot_row * dim + j);
                }
            }
            pivots.push(pivot_row);
            let (upper, lower) = matrix.split_at_mut((k + 1) * dim);
            let pivot_line = &upper[k * dim..];
            let pivot = pivot_line[k];
            for row in lower.chunks_exact_mut(dim) {
                let factor = row[k] / pivot;
                row[k] = factor;
                if factor != 0.0 {
                    for (value, &above) in row[k + 1..].iter_mut().zip(&pivot_line[k + 1..dim]) {
                        *value -= factor * above;
                    }
                }
            }
        }
        Ok(Self {
            dim,
            lu: matrix,
            pivots,
        })
    }

    /// Solves `A x = rhs`.
    pub fn solve(&self, rhs: &[f64]) -> Vec<f64> {
        let dim = self.dim;
        let mut x = rhs.to_vec();
        for (k, &p) in self.pivots.iter().enumerate() {
            x.swap(k, p);
        }
        for i in 0..dim {
            let row = &self.lu[i * dim..i * dim + i];
            let correction: f64 = row.iter().zip(&x[..i]).map(|(a, b)| a * b).sum();
            x[i] -= correction;
        }
        for i in (0..dim).rev() {
            let row = &self.lu[i * dim..(i + 1) * dim];
            let correction: f64 = row[i + 1..]
                .iter()
                .zip(&x[i + 1..])
                .map(|(a, b)| a * b)
                .sum();
            x[i] = (x[i] - correction) / row[i];
        }
        x
    }
}

/// Eigenvalue of smallest modulus of a real matrix, by inverse iteration from `start`.
///
/// Converges quickly when that eigenvalue is real and well separated from the rest of the
/// spectrum, which holds for the slow modes of a cat qubit. Returns `None` when the matrix is
/// singular or the iteration degenerates.
pub fn smallest_eigenvalue(matrix: Vec<f64>, dim: usize, start: &[f64]) -> Option<f64> {
    let lu = LuDecomposition::new(matrix, dim).ok()?;
    let mut x = normalized(start)?;
    let mut estimate = 0.0;
    for _ in 0..INVERSE_ITERATION_MAX_STEPS {
        let y = lu.solve(&x);
        // x is normalized and y ≈ x / λ, so x · y estimates 1 / λ.
        let next: f64 = x.iter().zip(&y).map(|(a, b)| a * b).sum();
        x = normalized(&y)?;
        let converged = (next - estimate).abs() <= INVERSE_ITERATION_TOLERANCE * next.abs();
        estimate = next;
        if converged {
            break;
        }
    }
    (estimate != 0.0 && estimate.is_finite()).then_some(estimate.recip())
}

fn normalized(v: &[f64]) -> Option<Vec<f64>> {
    let norm = v.iter().map(|a| a * a).sum::<f64>().sqrt();
    (norm > 0.0 && norm.is_finite()).then(|| v.iter().map(|a| a / norm).collect())
}
