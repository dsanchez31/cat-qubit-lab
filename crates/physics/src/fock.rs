//! Truncated Fock space operators and the dense / sparse complex matrices they act on.

use num_complex::Complex64;

/// Double precision complex number.
pub type C64 = Complex64;

/// Dense square complex matrix, row-major storage.
#[derive(Clone, Debug)]
pub struct DenseMatrix {
    /// Number of rows and columns.
    pub dim: usize,
    /// Row-major entries, `dim * dim` long.
    pub data: Vec<C64>,
}

impl DenseMatrix {
    /// Zero matrix.
    pub fn zeros(dim: usize) -> Self {
        Self {
            dim,
            data: vec![C64::new(0.0, 0.0); dim * dim],
        }
    }

    /// Entry at `(row, col)`.
    #[inline]
    #[must_use]
    pub fn get(&self, row: usize, col: usize) -> C64 {
        self.data[row * self.dim + col]
    }

    /// Overwrites the entry at `(row, col)`.
    #[inline]
    pub fn set(&mut self, row: usize, col: usize, value: C64) {
        self.data[row * self.dim + col] = value;
    }

    /// Sets every entry to zero.
    pub fn fill_zero(&mut self) {
        self.data.iter_mut().for_each(|v| *v = C64::new(0.0, 0.0));
    }

    /// Sum of the diagonal entries.
    pub fn trace(&self) -> C64 {
        (0..self.dim).map(|i| self.get(i, i)).sum()
    }

    /// `self += scale * other`
    pub fn add_scaled(&mut self, scale: f64, other: &DenseMatrix) {
        debug_assert_eq!(self.dim, other.dim);
        self.data
            .iter_mut()
            .zip(&other.data)
            .for_each(|(a, b)| *a += b * scale);
    }

    /// `self = base + scale * other`
    pub fn assign_sum(&mut self, base: &DenseMatrix, scale: f64, other: &DenseMatrix) {
        debug_assert_eq!(self.dim, base.dim);
        debug_assert_eq!(self.dim, other.dim);
        for ((out, b), o) in self.data.iter_mut().zip(&base.data).zip(&other.data) {
            *out = b + o * scale;
        }
    }
}

/// Sparse square complex matrix stored as `(row, col, value)` triplets with unique positions.
#[derive(Clone, Debug)]
pub struct SparseMatrix {
    /// Number of rows and columns.
    pub dim: usize,
    /// Non-zero entries.
    pub entries: Vec<(usize, usize, C64)>,
}

impl SparseMatrix {
    /// Empty sparse matrix.
    pub fn zeros(dim: usize) -> Self {
        Self {
            dim,
            entries: Vec::new(),
        }
    }

    /// Identity matrix.
    pub fn identity(dim: usize) -> Self {
        Self {
            dim,
            entries: (0..dim).map(|n| (n, n, C64::new(1.0, 0.0))).collect(),
        }
    }

    /// Annihilation operator: `a |n> = sqrt(n) |n-1>`.
    pub fn annihilation(dim: usize) -> Self {
        let entries = (1..dim)
            .map(|n| (n - 1, n, C64::new((n as f64).sqrt(), 0.0)))
            .collect();
        Self { dim, entries }
    }

    /// Photon number operator `a^dagger a`.
    pub fn number(dim: usize) -> Self {
        Self {
            dim,
            entries: (0..dim).map(|n| (n, n, C64::new(n as f64, 0.0))).collect(),
        }
    }

    /// Matrix multiplied by `scale`.
    #[must_use]
    pub fn scaled(&self, scale: C64) -> Self {
        let entries = self
            .entries
            .iter()
            .map(|&(r, c, v)| (r, c, v * scale))
            .collect();
        Self {
            dim: self.dim,
            entries,
        }
    }

    /// Conjugate transpose.
    #[must_use]
    pub fn adjoint(&self) -> Self {
        let entries = self
            .entries
            .iter()
            .map(|&(r, c, v)| (c, r, v.conj()))
            .collect();
        Self {
            dim: self.dim,
            entries,
        }
    }

    /// Matrix sum.
    #[must_use]
    pub fn sum(&self, other: &SparseMatrix) -> Self {
        debug_assert_eq!(self.dim, other.dim);
        let mut dense = vec![C64::new(0.0, 0.0); self.dim * self.dim];
        for &(r, c, v) in self.entries.iter().chain(&other.entries) {
            dense[r * self.dim + c] += v;
        }
        Self::from_dense(self.dim, &dense)
    }

    /// Matrix product `self * other`.
    #[must_use]
    pub fn product(&self, other: &SparseMatrix) -> Self {
        debug_assert_eq!(self.dim, other.dim);
        let mut dense = vec![C64::new(0.0, 0.0); self.dim * self.dim];
        for &(r, k, v) in &self.entries {
            for &(k2, c, w) in &other.entries {
                if k == k2 {
                    dense[r * self.dim + c] += v * w;
                }
            }
        }
        Self::from_dense(self.dim, &dense)
    }

    fn from_dense(dim: usize, dense: &[C64]) -> Self {
        let entries = dense
            .iter()
            .enumerate()
            .filter(|(_, v)| v.norm_sqr() > 0.0)
            .map(|(i, &v)| (i / dim, i % dim, v))
            .collect();
        Self { dim, entries }
    }

    /// `out = self * x`
    pub fn left_mul_into(&self, x: &DenseMatrix, out: &mut DenseMatrix) {
        out.fill_zero();
        let d = self.dim;
        for &(r, k, v) in &self.entries {
            let src = &x.data[k * d..(k + 1) * d];
            let dst = &mut out.data[r * d..(r + 1) * d];
            dst.iter_mut().zip(src).for_each(|(o, s)| *o += v * s);
        }
    }

    /// `out += scale * x * self`
    pub fn right_mul_add(&self, x: &DenseMatrix, scale: C64, out: &mut DenseMatrix) {
        let d = self.dim;
        for &(k, c, v) in &self.entries {
            let w = v * scale;
            for i in 0..d {
                out.data[i * d + c] += x.data[i * d + k] * w;
            }
        }
    }

    /// `out += x * self^dagger`
    pub fn right_mul_adjoint_add(&self, x: &DenseMatrix, out: &mut DenseMatrix) {
        let d = self.dim;
        for &(c, k, v) in &self.entries {
            let w = v.conj();
            for i in 0..d {
                out.data[i * d + c] += x.data[i * d + k] * w;
            }
        }
    }

    /// Gershgorin bound on the spectral radius (maximum absolute row sum).
    pub fn gershgorin_bound(&self) -> f64 {
        let mut rows = vec![0.0; self.dim];
        for &(r, _, v) in &self.entries {
            rows[r] += v.norm();
        }
        rows.into_iter().fold(0.0, f64::max)
    }
}
