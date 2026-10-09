//! Physics core of cat-qubit-lab: a single bosonic mode stabilized by two-photon dissipation.
//!
//! - [`lindblad`]: master equation and RK4 integrator;
//! - [`states`] and [`observables`]: initial states and expectation values;
//! - [`wigner`]: phase-space picture;
//! - [`flip_times`]: bit-flip and phase-flip times from the Liouvillian spectrum;
//! - [`simulation`]: stateful facade used by the WebAssembly bindings.

pub mod flip_times;
pub mod fock;
pub mod linalg;
pub mod lindblad;
pub mod observables;
pub mod simulation;
pub mod states;
pub mod wigner;

pub use flip_times::{FlipTimes, flip_time_dimension, flip_times, recommended_dimension};
pub use lindblad::CatParams;
pub use simulation::{InitialState, Simulation};
pub use states::CatParity;
pub use wigner::PhaseSpaceGrid;
