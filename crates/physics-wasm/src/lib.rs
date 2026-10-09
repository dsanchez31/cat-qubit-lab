//! WebAssembly bindings of `cat-qubit-physics`, consumed by the web app worker.
//!
//! Numbers cross the boundary as `f64` scalars or typed arrays (`Float32Array`, `Float64Array`).

use cat_qubit_physics::fock::C64;
use cat_qubit_physics::{CatParams, CatParity, InitialState, PhaseSpaceGrid, Simulation};
use wasm_bindgen::prelude::*;

/// Simulation handle owned by JavaScript.
#[wasm_bindgen]
pub struct CatSimulation {
    inner: Simulation,
}

/// Snapshot of the scalar observables.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct ObservablesSnapshot {
    /// `⟨a†a⟩`
    pub mean_photon_number: f64,
    /// `⟨(−1)^{a†a}⟩`
    pub parity: f64,
    /// `tr(ρ²)`
    pub purity: f64,
    /// `tr(ρ)`
    pub trace: f64,
}

#[wasm_bindgen]
impl CatSimulation {
    /// Creates a simulation starting from the vacuum.
    ///
    /// # Errors
    ///
    /// Rejects a truncation dimension below 2.
    #[wasm_bindgen(constructor)]
    pub fn new(
        dimension: usize,
        alpha: f64,
        kappa1: f64,
        kappa2: f64,
        kappa_phi: f64,
    ) -> Result<CatSimulation, JsError> {
        if dimension < 2 {
            return Err(JsError::new("dimension must be at least 2"));
        }
        let params = CatParams {
            alpha,
            kappa1,
            kappa2,
            kappa_phi,
        };
        Ok(Self {
            inner: Simulation::new(dimension, params),
        })
    }

    /// Truncation dimension.
    #[wasm_bindgen(getter)]
    pub fn dimension(&self) -> usize {
        self.inner.dim()
    }

    /// Simulated time since the last reset.
    #[wasm_bindgen(getter)]
    pub fn time(&self) -> f64 {
        self.inner.time()
    }

    /// Updates the physical parameters, keeping the state.
    #[wasm_bindgen(js_name = setParameters)]
    pub fn set_parameters(&mut self, alpha: f64, kappa1: f64, kappa2: f64, kappa_phi: f64) {
        self.inner.set_params(CatParams {
            alpha,
            kappa1,
            kappa2,
            kappa_phi,
        });
    }

    /// Resets to the vacuum.
    #[wasm_bindgen(js_name = resetVacuum)]
    pub fn reset_vacuum(&mut self) {
        self.inner.reset(InitialState::Vacuum);
    }

    /// Resets to the Fock state `|n⟩`.
    #[wasm_bindgen(js_name = resetFock)]
    pub fn reset_fock(&mut self, n: usize) {
        self.inner.reset(InitialState::Fock(n));
    }

    /// Resets to the coherent state `|β⟩`, `β = re + i im`.
    #[wasm_bindgen(js_name = resetCoherent)]
    pub fn reset_coherent(&mut self, re: f64, im: f64) {
        self.inner.reset(InitialState::Coherent(C64::new(re, im)));
    }

    /// Resets to the cat state `|β⟩ ± |−β⟩`, odd when `odd` is true.
    #[wasm_bindgen(js_name = resetCat)]
    pub fn reset_cat(&mut self, re: f64, im: f64, odd: bool) {
        let parity = if odd { CatParity::Odd } else { CatParity::Even };
        self.inner
            .reset(InitialState::Cat(C64::new(re, im), parity));
    }

    /// Advances the state by `duration`, returns the number of RK4 steps taken.
    pub fn evolve(&mut self, duration: f64) -> usize {
        self.inner.evolve(duration)
    }

    /// Density matrix as interleaved `[re, im]` pairs, row-major, ready for a GPU storage buffer.
    #[wasm_bindgen(js_name = densityMatrix)]
    pub fn density_matrix(&self) -> Vec<f32> {
        self.inner
            .density_matrix()
            .data
            .iter()
            .flat_map(|c| [c.re as f32, c.im as f32])
            .collect()
    }

    /// Scalar observables of the current state.
    pub fn observables(&self) -> ObservablesSnapshot {
        let o = self.inner.observables();
        ObservablesSnapshot {
            mean_photon_number: o.mean_photon_number,
            parity: o.parity,
            purity: o.purity,
            trace: o.trace,
        }
    }

    /// CPU Wigner function on a `resolution × resolution` grid over `[−extent, extent]²`.
    pub fn wigner(&self, resolution: usize, extent: f64) -> Vec<f32> {
        let grid = PhaseSpaceGrid {
            resolution: resolution.max(2),
            extent,
        };
        self.inner
            .wigner(&grid)
            .into_iter()
            .map(|w| w as f32)
            .collect()
    }
}

/// Bit-flip and phase-flip times for each `alpha` in `alphas`, as `[T_bf, T_pf]` pairs, computed
/// with the converged truncation of `flip_time_dimension`. `Infinity` marks an absent error channel
/// or a rate below the resolution of the eigensolver.
#[wasm_bindgen(js_name = flipTimes)]
pub fn flip_times(alphas: &[f64], kappa1: f64, kappa2: f64, kappa_phi: f64) -> Vec<f64> {
    alphas
        .iter()
        .flat_map(|&alpha| {
            let params = CatParams {
                alpha,
                kappa1,
                kappa2,
                kappa_phi,
            };
            let times = cat_qubit_physics::flip_times(
                &params,
                cat_qubit_physics::flip_time_dimension(alpha),
            );
            [times.bit_flip, times.phase_flip]
        })
        .collect()
}

/// Truncation dimension large enough for a cat of amplitude `alpha`.
#[wasm_bindgen(js_name = recommendedDimension)]
pub fn recommended_dimension(alpha: f64) -> usize {
    cat_qubit_physics::recommended_dimension(alpha)
}
