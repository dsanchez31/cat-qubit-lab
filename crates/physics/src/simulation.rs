//! Stateful simulation: density matrix, parameters and integrator kept consistent.

use crate::fock::{C64, DenseMatrix};
use crate::lindblad::{CatParams, Lindbladian, Rk4Integrator};
use crate::observables::{self, Observables};
use crate::states::{self, CatParity};
use crate::wigner::{self, PhaseSpaceGrid};

/// Initial state selectable by the user.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum InitialState {
    /// `|0⟩`
    Vacuum,
    /// `|n⟩`
    Fock(usize),
    /// `|β⟩`
    Coherent(C64),
    /// `|β⟩ ± |−β⟩`
    Cat(C64, CatParity),
}

/// Time evolution of a cat qubit density matrix.
#[derive(Clone, Debug)]
pub struct Simulation {
    dim: usize,
    params: CatParams,
    rho: DenseMatrix,
    integrator: Rk4Integrator,
    time: f64,
}

impl Simulation {
    /// Starts from the vacuum in a Fock space truncated to `dim` levels.
    ///
    /// # Panics
    ///
    /// Panics when `dim < 2`.
    pub fn new(dim: usize, params: CatParams) -> Self {
        assert!(dim >= 2, "the Fock space needs at least two levels");
        Self {
            dim,
            params,
            rho: states::vacuum(dim),
            integrator: Rk4Integrator::new(Lindbladian::new(&params, dim), dim),
            time: 0.0,
        }
    }

    /// Truncation dimension.
    pub fn dim(&self) -> usize {
        self.dim
    }

    /// Elapsed simulated time since the last reset.
    pub fn time(&self) -> f64 {
        self.time
    }

    /// Current parameters.
    pub fn params(&self) -> CatParams {
        self.params
    }

    /// Current density matrix.
    pub fn density_matrix(&self) -> &DenseMatrix {
        &self.rho
    }

    /// Changes the parameters, keeping the current state.
    pub fn set_params(&mut self, params: CatParams) {
        self.params = params;
        self.integrator = Rk4Integrator::new(Lindbladian::new(&params, self.dim), self.dim);
    }

    /// Replaces the state and resets the clock.
    pub fn reset(&mut self, state: InitialState) {
        self.rho = match state {
            InitialState::Vacuum => states::vacuum(self.dim),
            InitialState::Fock(n) => states::fock(self.dim, n),
            InitialState::Coherent(beta) => states::coherent(self.dim, beta),
            InitialState::Cat(beta, parity) => states::cat(self.dim, beta, parity),
        };
        self.time = 0.0;
    }

    /// Advances the state by `duration`, returns the number of RK4 steps taken.
    pub fn evolve(&mut self, duration: f64) -> usize {
        let steps = self.integrator.evolve(&mut self.rho, duration);
        self.time += duration.max(0.0);
        steps
    }

    /// Scalar observables of the current state.
    pub fn observables(&self) -> Observables {
        observables::measure(&self.rho)
    }

    /// Wigner function of the current state, see [`wigner::wigner`].
    pub fn wigner(&self, grid: &PhaseSpaceGrid) -> Vec<f64> {
        wigner::wigner(&self.rho, grid)
    }
}
