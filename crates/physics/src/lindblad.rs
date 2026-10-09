//! Lindblad master equation of a dissipative cat qubit and its RK4 integrator.

use crate::fock::{C64, DenseMatrix, SparseMatrix};

/// Largest RK4 step as a fraction of the inverse spectral radius bound.
///
/// The RK4 stability region reaches about 2.78 on the negative real axis; 2.0 keeps a margin
/// for eigenvalues with an imaginary part.
const RK4_STABILITY_FACTOR: f64 = 2.0;

/// Physical parameters of the cat qubit. All rates share the same, arbitrary, time unit.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CatParams {
    /// Cat amplitude, real: the two coherent states sit at `±alpha` on the real axis.
    pub alpha: f64,
    /// Single-photon loss rate `κ1`.
    pub kappa1: f64,
    /// Two-photon dissipation rate `κ2`.
    pub kappa2: f64,
    /// Pure dephasing rate `κφ`.
    pub kappa_phi: f64,
}

impl CatParams {
    /// Jump operators `√κ2 (a² − α²)`, `√κ1 a` and `√κφ a†a`, skipping vanishing rates.
    pub fn jump_operators(&self, dim: usize) -> Vec<SparseMatrix> {
        let a = SparseMatrix::annihilation(dim);
        let mut jumps = Vec::with_capacity(3);
        if self.kappa2 > 0.0 {
            let shift = SparseMatrix::identity(dim).scaled(C64::new(-self.alpha * self.alpha, 0.0));
            let two_photon = a.product(&a).sum(&shift);
            jumps.push(two_photon.scaled(C64::new(self.kappa2.sqrt(), 0.0)));
        }
        if self.kappa1 > 0.0 {
            jumps.push(a.scaled(C64::new(self.kappa1.sqrt(), 0.0)));
        }
        if self.kappa_phi > 0.0 {
            jumps.push(SparseMatrix::number(dim).scaled(C64::new(self.kappa_phi.sqrt(), 0.0)));
        }
        jumps
    }
}

/// Liouvillian `L(ρ) = Σ_k L_k ρ L_k† − ½ {K, ρ}` with `K = Σ_k L_k† L_k`.
#[derive(Clone, Debug)]
pub struct Lindbladian {
    jumps: Vec<SparseMatrix>,
    effective: SparseMatrix,
    spectral_radius_bound: f64,
}

impl Lindbladian {
    /// Builds the Liouvillian of the cat qubit in a Fock space truncated to `dim` levels.
    pub fn new(params: &CatParams, dim: usize) -> Self {
        let jumps = params.jump_operators(dim);
        let products: Vec<SparseMatrix> = jumps.iter().map(|j| j.adjoint().product(j)).collect();
        let effective = products
            .iter()
            .fold(SparseMatrix::zeros(dim), |acc, p| acc.sum(p));
        // ‖L(ρ)‖ ≤ 2 Σ_k ‖L_k† L_k‖ ‖ρ‖, each norm bounded by Gershgorin.
        let spectral_radius_bound = 2.0
            * products
                .iter()
                .map(SparseMatrix::gershgorin_bound)
                .sum::<f64>();
        Self {
            jumps,
            effective,
            spectral_radius_bound,
        }
    }

    /// Upper bound on the modulus of the Liouvillian eigenvalues.
    pub fn spectral_radius_bound(&self) -> f64 {
        self.spectral_radius_bound
    }

    /// Writes `L(rho)` into `out`, using `scratch` as temporary storage.
    pub fn apply(&self, rho: &DenseMatrix, out: &mut DenseMatrix, scratch: &mut DenseMatrix) {
        out.fill_zero();
        for jump in &self.jumps {
            jump.left_mul_into(rho, scratch);
            jump.right_mul_adjoint_add(scratch, out);
        }
        self.effective.left_mul_into(rho, scratch);
        out.add_scaled(-0.5, scratch);
        self.effective.right_mul_add(rho, C64::new(-0.5, 0.0), out);
    }
}

/// Classical fourth-order Runge-Kutta integrator for the Lindblad equation.
#[derive(Clone, Debug)]
pub struct Rk4Integrator {
    lindbladian: Lindbladian,
    max_step: f64,
    k1: DenseMatrix,
    k2: DenseMatrix,
    k3: DenseMatrix,
    k4: DenseMatrix,
    stage: DenseMatrix,
    scratch: DenseMatrix,
}

impl Rk4Integrator {
    /// Integrator for `lindbladian` acting on `dim × dim` density matrices.
    pub fn new(lindbladian: Lindbladian, dim: usize) -> Self {
        let bound = lindbladian.spectral_radius_bound();
        let max_step = if bound > 0.0 {
            RK4_STABILITY_FACTOR / bound
        } else {
            f64::INFINITY
        };
        Self {
            lindbladian,
            max_step,
            k1: DenseMatrix::zeros(dim),
            k2: DenseMatrix::zeros(dim),
            k3: DenseMatrix::zeros(dim),
            k4: DenseMatrix::zeros(dim),
            stage: DenseMatrix::zeros(dim),
            scratch: DenseMatrix::zeros(dim),
        }
    }

    /// Largest stable time step.
    pub fn max_step(&self) -> f64 {
        self.max_step
    }

    /// Evolves `rho` in place over `duration` with uniform steps, returns the number of steps.
    pub fn evolve(&mut self, rho: &mut DenseMatrix, duration: f64) -> usize {
        if duration <= 0.0 {
            return 0;
        }
        let steps = (duration / self.max_step).ceil().max(1.0) as usize;
        let dt = duration / steps as f64;
        for _ in 0..steps {
            self.step(rho, dt);
        }
        steps
    }

    fn step(&mut self, rho: &mut DenseMatrix, dt: f64) {
        let Self {
            lindbladian,
            k1,
            k2,
            k3,
            k4,
            stage,
            scratch,
            ..
        } = self;
        lindbladian.apply(rho, k1, scratch);
        stage.assign_sum(rho, 0.5 * dt, k1);
        lindbladian.apply(stage, k2, scratch);
        stage.assign_sum(rho, 0.5 * dt, k2);
        lindbladian.apply(stage, k3, scratch);
        stage.assign_sum(rho, dt, k3);
        lindbladian.apply(stage, k4, scratch);
        let weight = dt / 6.0;
        for (i, value) in rho.data.iter_mut().enumerate() {
            *value += (k1.data[i] + (k2.data[i] + k3.data[i]) * 2.0 + k4.data[i]) * weight;
        }
    }
}
